//! Pure color/geometry analysis for capture-driven sync.
//!
//! Everything here is platform-independent and unit-tested: mapping Hue
//! channel positions onto the selected display topology, tile color
//! extraction with letterbox rejection and saturation weighting, temporal
//! smoothing, and the intensity presets.

use std::sync::OnceLock;

use serde::{Deserialize, Serialize};

use crate::services::hue_client::HueEntertainmentChannel;

use super::protocol::ChannelColor;

/// Fraction of the combined capture bounds sampled by a light on the screen
/// wall. Lights farther into the room sample a broader, softer region.
const SCREEN_TILE_FRACTION: f32 = 0.18;

/// Broadest region sampled by a light at the back of the room.
const BACK_TILE_FRACTION: f32 = 0.72;

/// Room-space footprint of the screen wall: the display arrangement is fitted
/// into this box (room units, all axes -1..1) and channel positions project
/// through it onto the screen. Must match the placement editor's
/// `display-geometry.ts`, which draws the same frame in the 3D room.
const FRAME_MAX_WIDTH: f32 = 1.1;
const FRAME_MAX_HEIGHT: f32 = 0.64;

/// Where the screen frame's bottom edge sits in the room, per the area's
/// configuration type. Mirrors `roomFrameOptionsFor` in `display-geometry.ts`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ScreenFrame {
    /// Desk monitor; the frame floats just above desk height.
    Monitor,
    /// TV on a stand; the frame hangs at seated eye level.
    Tv,
}

impl ScreenFrame {
    pub fn from_configuration_type(configuration_type: Option<&str>) -> Self {
        match configuration_type {
            Some("screen") => Self::Tv,
            _ => Self::Monitor,
        }
    }

    fn bottom_z(self) -> f32 {
        match self {
            Self::Monitor => -0.14,
            Self::Tv => 0.0,
        }
    }
}

/// Effect-strength floor for a light at the back of the room. Depth is not a
/// physical inverse-square correction; this keeps remote room lighting from
/// competing with screen-adjacent lights while preserving visible ambience.
const BACK_DEPTH_GAIN: f32 = 0.65;

/// Linear luminance below which a pixel is considered letterbox/black and
/// excluded from the weighted mean.
const BLACK_LUMA: f32 = 0.005;

/// Cap on sampled pixels per tile; larger tiles are strided down to this.
const MAX_TILE_SAMPLES: u32 = 4096;

/// Target log-average luminance before the ACES curve. scRGB uses 1.0 for SDR
/// white, while HDR highlights can extend well above it.
const HDR_MIDDLE_GRAY: f32 = 0.6;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SyncMode {
    /// Spatial colors with stronger temporal smoothing.
    Video,
    /// Same spatial mapping, faster response and stronger saturation.
    Game,
    /// WASAPI loopback frequency/RMS/onset analysis.
    Music,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SyncIntensity {
    Subtle,
    Moderate,
    High,
    Extreme,
}

impl SyncIntensity {
    /// Frame/analysis tick rate.
    pub fn tick_hz(self) -> u32 {
        match self {
            Self::Subtle => 20,
            Self::Moderate => 30,
            Self::High => 40,
            Self::Extreme => 50,
        }
    }

    /// Per-tick exponential smoothing factor (higher = faster response).
    pub fn smoothing_alpha(self) -> f32 {
        match self {
            Self::Subtle => 0.10,
            Self::Moderate => 0.22,
            Self::High => 0.40,
            Self::Extreme => 0.80,
        }
    }
}

impl SyncMode {
    /// Games get a faster response on top of the intensity preset.
    pub fn alpha_multiplier(self) -> f32 {
        match self {
            Self::Video => 1.0,
            Self::Game => 1.5,
            Self::Music => 1.35,
        }
    }

    /// Saturation push applied to the streamed colors.
    pub fn saturation_boost(self) -> f32 {
        match self {
            Self::Video => 1.15,
            Self::Game => 1.35,
            Self::Music => 1.2,
        }
    }
}

/// A display's bounds in virtual-desktop coordinates.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Bounds {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

impl Bounds {
    fn right(&self) -> i32 {
        self.x + self.width as i32
    }

    fn bottom(&self) -> i32 {
        self.y + self.height as i32
    }

    fn contains(&self, px: f32, py: f32) -> bool {
        px >= self.x as f32
            && px < self.right() as f32
            && py >= self.y as f32
            && py < self.bottom() as f32
    }

    fn center(&self) -> (f32, f32) {
        (
            self.x as f32 + self.width as f32 / 2.0,
            self.y as f32 + self.height as f32 / 2.0,
        )
    }
}

/// A channel's sample region on one selected display, normalized to `[0, 1]`
/// within that display so it survives resolution/DPI differences between the
/// enumerated bounds and the actual capture size.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct ChannelTile {
    /// Index into the channel list handed to `map_channels_to_tiles`.
    pub channel_index: usize,
    /// Index into the display list handed to `map_channels_to_tiles`.
    pub display_index: usize,
    pub left: f32,
    pub top: f32,
    pub right: f32,
    pub bottom: f32,
    /// Per-channel effect strength derived from Hue's room-depth coordinate.
    pub depth_gain: f32,
}

/// Maps channel positions onto the combined bounding box of the selected
/// displays by projecting them through the room's screen frame: the
/// arrangement is fitted into the frame's room-space rectangle, a channel
/// inside the rectangle samples the proportional spot on the screen, and a
/// channel outside it clamps to the nearest screen edge (a desk light below
/// the monitor follows the bottom of the picture). Hue coordinates: `x` is
/// left(-1)→right(+1) and `z` is floor(-1)→ceiling(+1), so `z` maps inverted
/// onto screen rows. `y` runs from the back of the room (-1) to the screen
/// wall (+1): increasing distance broadens the sample and reduces its effect
/// strength. Each tile is clamped to the single display that owns the
/// channel's mapped point.
pub fn map_channels_to_tiles(
    channels: &[HueEntertainmentChannel],
    displays: &[Bounds],
    frame: ScreenFrame,
) -> Vec<ChannelTile> {
    if displays.is_empty() {
        return Vec::new();
    }
    let min_x = displays.iter().map(|d| d.x).min().unwrap() as f32;
    let min_y = displays.iter().map(|d| d.y).min().unwrap() as f32;
    let max_x = displays.iter().map(Bounds::right).max().unwrap() as f32;
    let max_y = displays.iter().map(Bounds::bottom).max().unwrap() as f32;
    let combined_w = max_x - min_x;
    let combined_h = max_y - min_y;

    let frame_scale = (FRAME_MAX_WIDTH / combined_w).min(FRAME_MAX_HEIGHT / combined_h);
    let frame_w = combined_w * frame_scale;
    let frame_h = combined_h * frame_scale;
    let frame_left = -frame_w / 2.0;
    let frame_top = frame.bottom_z() + frame_h;

    channels
        .iter()
        .enumerate()
        .map(|(channel_index, channel)| {
            let depth = room_depth(channel.y);
            let tile_fraction =
                SCREEN_TILE_FRACTION + (BACK_TILE_FRACTION - SCREEN_TILE_FRACTION) * depth;
            let half_tile_w = combined_w * tile_fraction / 2.0;
            let half_tile_h = combined_h * tile_fraction / 2.0;
            let u = ((channel.x as f32 - frame_left) / frame_w).clamp(0.0, 1.0);
            let v = ((frame_top - channel.z as f32) / frame_h).clamp(0.0, 1.0);
            let px = min_x + u * combined_w;
            let py = min_y + v * combined_h;

            let display_index = displays
                .iter()
                .position(|display| display.contains(px, py))
                .unwrap_or_else(|| nearest_display(displays, px, py));
            let display = displays[display_index];

            // Clamp the tile to the owning display, then keep a minimum size
            // so edge channels still sample a meaningful region.
            let d_left = display.x as f32;
            let d_top = display.y as f32;
            let d_w = display.width as f32;
            let d_h = display.height as f32;
            let min_w = (d_w * 0.05).max(2.0);
            let min_h = (d_h * 0.05).max(2.0);

            let mut left = (px - half_tile_w).max(d_left);
            let mut right = (px + half_tile_w).min(d_left + d_w);
            if right - left < min_w {
                if left <= d_left {
                    right = (left + min_w).min(d_left + d_w);
                } else {
                    left = (right - min_w).max(d_left);
                }
            }
            let mut top = (py - half_tile_h).max(d_top);
            let mut bottom = (py + half_tile_h).min(d_top + d_h);
            if bottom - top < min_h {
                if top <= d_top {
                    bottom = (top + min_h).min(d_top + d_h);
                } else {
                    top = (bottom - min_h).max(d_top);
                }
            }

            ChannelTile {
                channel_index,
                display_index,
                left: (left - d_left) / d_w,
                top: (top - d_top) / d_h,
                right: (right - d_left) / d_w,
                bottom: (bottom - d_top) / d_h,
                depth_gain: 1.0 - (1.0 - BACK_DEPTH_GAIN) * depth,
            }
        })
        .collect()
}

/// Normalized distance from the screen wall: 0 at y=+1, 1 at y=-1.
fn room_depth(y: f64) -> f32 {
    ((1.0 - y as f32) / 2.0).clamp(0.0, 1.0)
}

fn nearest_display(displays: &[Bounds], px: f32, py: f32) -> usize {
    displays
        .iter()
        .enumerate()
        .min_by(|(_, a), (_, b)| {
            let (ax, ay) = a.center();
            let (bx, by) = b.center();
            let da = (ax - px).powi(2) + (ay - py).powi(2);
            let db = (bx - px).powi(2) + (by - py).powi(2);
            da.partial_cmp(&db).unwrap_or(std::cmp::Ordering::Equal)
        })
        .map(|(index, _)| index)
        .unwrap_or(0)
}

fn srgb_lut() -> &'static [f32; 256] {
    static LUT: OnceLock<[f32; 256]> = OnceLock::new();
    LUT.get_or_init(|| {
        let mut lut = [0.0f32; 256];
        for (byte, slot) in lut.iter_mut().enumerate() {
            let c = byte as f32 / 255.0;
            *slot = if c <= 0.04045 {
                c / 12.92
            } else {
                ((c + 0.055) / 1.055).powf(2.4)
            };
        }
        lut
    })
}

pub fn srgb_u8_to_linear(byte: u8) -> f32 {
    srgb_lut()[byte as usize]
}

pub fn linear_to_srgb_u16(linear: f32) -> u16 {
    let l = linear.clamp(0.0, 1.0);
    let srgb = if l <= 0.003_130_8 {
        l * 12.92
    } else {
        1.055 * l.powf(1.0 / 2.4) - 0.055
    };
    (srgb * 65535.0).round() as u16
}

fn luminance(rgb: [f32; 3]) -> f32 {
    0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]
}

fn sample_stride(width: u32, height: u32) -> u32 {
    let total = width * height;
    ((total as f32 / MAX_TILE_SAMPLES as f32).sqrt().ceil() as u32).max(1)
}

/// Computes the saturation-weighted mean linear color of an RGBA8 tile.
///
/// `data` is the mapped tile buffer with `row_pitch` bytes per row (D3D
/// staging textures pad rows). Near-black pixels are rejected so letterbox
/// bars don't drag colors down; if (almost) everything is black the scene
/// really is dark and black is returned. Colorful, bright pixels dominate the
/// mean so lights track the subject rather than a washed-out average.
pub fn analyze_rgba_tile(data: &[u8], width: u32, height: u32, row_pitch: u32) -> [f32; 3] {
    if width == 0 || height == 0 {
        return [0.0; 3];
    }
    // Stride the tile down to at most MAX_TILE_SAMPLES samples.
    let stride = sample_stride(width, height);

    let mut weighted = [0.0f64; 3];
    let mut weight_sum = 0.0f64;
    let mut lit = 0u32;
    let mut sampled = 0u32;

    let mut y = 0;
    while y < height {
        let row_start = (y * row_pitch) as usize;
        let mut x = 0;
        while x < width {
            let offset = row_start + (x * 4) as usize;
            if offset + 3 >= data.len() {
                break;
            }
            sampled += 1;
            let rgb = [
                srgb_u8_to_linear(data[offset]),
                srgb_u8_to_linear(data[offset + 1]),
                srgb_u8_to_linear(data[offset + 2]),
            ];
            let luma = luminance(rgb);
            if luma > BLACK_LUMA {
                lit += 1;
                let max = rgb[0].max(rgb[1]).max(rgb[2]);
                let min = rgb[0].min(rgb[1]).min(rgb[2]);
                let saturation = if max > 0.0 { (max - min) / max } else { 0.0 };
                let weight = (luma as f64) * (0.25 + 0.75 * saturation as f64);
                for (slot, component) in weighted.iter_mut().zip(rgb) {
                    *slot += component as f64 * weight;
                }
                weight_sum += weight;
            }
            x += stride;
        }
        y += stride;
    }

    // Letterbox rejection is the skip above; if under 2% of the tile is lit,
    // the region is genuinely dark.
    if weight_sum <= 0.0 || sampled == 0 || (lit as f32 / sampled as f32) < 0.02 {
        return [0.0; 3];
    }
    [
        (weighted[0] / weight_sum) as f32,
        (weighted[1] / weight_sum) as f32,
        (weighted[2] / weight_sum) as f32,
    ]
}

fn read_f16(data: &[u8], offset: usize) -> f32 {
    let value = half::f16::from_bits(u16::from_le_bytes([data[offset], data[offset + 1]])).to_f32();
    if value.is_finite() {
        value.max(0.0)
    } else {
        0.0
    }
}

fn read_rgba16f_rgb(data: &[u8], offset: usize) -> [f32; 3] {
    [
        read_f16(data, offset),
        read_f16(data, offset + 2),
        read_f16(data, offset + 4),
    ]
}

/// Chooses an exposure from the tile's log-average scRGB luminance. The
/// bounds prevent a nearly black frame or a single extreme highlight from
/// causing a visible exposure flash.
pub fn hdr_exposure(log_average_luma: f32) -> f32 {
    (HDR_MIDDLE_GRAY / log_average_luma.max(0.000_1)).clamp(0.1, 4.0)
}

/// ACES-filmic approximation applied component-wise to exposed linear scRGB.
pub fn tone_map_hdr(rgb: [f32; 3], exposure: f32) -> [f32; 3] {
    rgb.map(|component| {
        let x = (component.max(0.0) * exposure.max(0.0)).min(65_504.0);
        ((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14)).clamp(0.0, 1.0)
    })
}

/// Computes a saturation-weighted mean from an RGBA16F scRGB tile.
///
/// HDR capture arrives as linear half floats. A first pass derives adaptive
/// exposure from log-average luminance; a second pass applies an ACES-style
/// curve before the same black rejection and color weighting used for SDR.
pub fn analyze_rgba16f_tile(data: &[u8], width: u32, height: u32, row_pitch: u32) -> [f32; 3] {
    if width == 0 || height == 0 {
        return [0.0; 3];
    }
    let stride = sample_stride(width, height);
    let mut log_luma_sum = 0.0f64;
    let mut lit = 0u32;
    let mut sampled = 0u32;

    let mut y = 0;
    while y < height {
        let row_start = (y * row_pitch) as usize;
        let mut x = 0;
        while x < width {
            let offset = row_start + (x * 8) as usize;
            if offset + 7 >= data.len() {
                break;
            }
            sampled += 1;
            let luma = luminance(read_rgba16f_rgb(data, offset));
            if luma > BLACK_LUMA {
                lit += 1;
                log_luma_sum += (luma as f64).ln();
            }
            x += stride;
        }
        y += stride;
    }

    if sampled == 0 || lit == 0 || (lit as f32 / sampled as f32) < 0.02 {
        return [0.0; 3];
    }
    let log_average_luma = (log_luma_sum / lit as f64).exp() as f32;
    let exposure = hdr_exposure(log_average_luma);
    let mut weighted = [0.0f64; 3];
    let mut weight_sum = 0.0f64;

    let mut y = 0;
    while y < height {
        let row_start = (y * row_pitch) as usize;
        let mut x = 0;
        while x < width {
            let offset = row_start + (x * 8) as usize;
            if offset + 7 >= data.len() {
                break;
            }
            let rgb = tone_map_hdr(read_rgba16f_rgb(data, offset), exposure);
            let luma = luminance(rgb);
            if luma > BLACK_LUMA {
                let max = rgb[0].max(rgb[1]).max(rgb[2]);
                let min = rgb[0].min(rgb[1]).min(rgb[2]);
                let saturation = if max > 0.0 { (max - min) / max } else { 0.0 };
                let weight = (luma as f64) * (0.25 + 0.75 * saturation as f64);
                for (slot, component) in weighted.iter_mut().zip(rgb) {
                    *slot += component as f64 * weight;
                }
                weight_sum += weight;
            }
            x += stride;
        }
        y += stride;
    }

    if weight_sum <= 0.0 {
        return [0.0; 3];
    }
    [
        (weighted[0] / weight_sum) as f32,
        (weighted[1] / weight_sum) as f32,
        (weighted[2] / weight_sum) as f32,
    ]
}

/// Per-channel exponential smoothing in linear RGB.
pub struct ChannelSmoother {
    current: Vec<[f32; 3]>,
    alpha: f32,
}

impl ChannelSmoother {
    pub fn new(channel_count: usize, intensity: SyncIntensity, mode: SyncMode) -> Self {
        Self {
            current: vec![[0.0; 3]; channel_count],
            alpha: (intensity.smoothing_alpha() * mode.alpha_multiplier()).clamp(0.01, 1.0),
        }
    }

    /// Live intensity changes retune the response without resetting the
    /// current colors.
    pub fn set_alpha(&mut self, intensity: SyncIntensity, mode: SyncMode) {
        self.alpha = (intensity.smoothing_alpha() * mode.alpha_multiplier()).clamp(0.01, 1.0);
    }

    pub fn step(&mut self, targets: &[[f32; 3]]) -> &[[f32; 3]] {
        for (current, target) in self.current.iter_mut().zip(targets) {
            for (component, goal) in current.iter_mut().zip(target) {
                *component += self.alpha * (goal - *component);
            }
        }
        &self.current
    }
}

/// Converts smoothed linear colors to wire colors, applying the mode's
/// saturation boost and the effect brightness (0-100).
pub fn to_wire_colors(
    linear: &[[f32; 3]],
    channel_ids: &[u8],
    saturation_boost: f32,
    brightness: f64,
) -> Vec<ChannelColor> {
    let brightness = (brightness / 100.0).clamp(0.0, 1.0) as f32;
    linear
        .iter()
        .zip(channel_ids)
        .map(|(rgb, &channel_id)| {
            let luma = luminance(*rgb);
            let boosted = rgb.map(|component| {
                // Push components away from gray, then scale by brightness.
                let saturated = luma + (component - luma) * saturation_boost;
                saturated.max(0.0) * brightness
            });
            ChannelColor {
                channel_id,
                rgb: boosted.map(linear_to_srgb_u16),
            }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn channel(channel_id: u8, x: f64, z: f64) -> HueEntertainmentChannel {
        channel_at_depth(channel_id, x, 0.0, z)
    }

    fn channel_at_depth(channel_id: u8, x: f64, y: f64, z: f64) -> HueEntertainmentChannel {
        HueEntertainmentChannel {
            channel_id,
            x,
            y,
            z,
        }
    }

    fn display(x: i32, y: i32, width: u32, height: u32) -> Bounds {
        Bounds {
            x,
            y,
            width,
            height,
        }
    }

    #[test]
    fn maps_left_and_right_channels_across_two_side_by_side_displays() {
        // Second display to the right of a 1920x1080 primary.
        let displays = [display(0, 0, 1920, 1080), display(1920, 0, 1920, 1080)];
        let channels = [channel(0, -1.0, 0.0), channel(1, 1.0, 0.0)];
        let tiles = map_channels_to_tiles(&channels, &displays, ScreenFrame::Monitor);

        assert_eq!(tiles[0].display_index, 0);
        assert!(tiles[0].left.abs() < f32::EPSILON, "left edge tile");
        assert_eq!(tiles[1].display_index, 1);
        assert!(
            (tiles[1].right - 1.0).abs() < f32::EPSILON,
            "right edge tile"
        );
    }

    #[test]
    fn z_axis_maps_inverted_onto_screen_rows() {
        let displays = [display(0, 0, 1920, 1080)];
        let top = map_channels_to_tiles(&[channel(0, 0.0, 1.0)], &displays, ScreenFrame::Monitor)[0];
        let bottom = map_channels_to_tiles(&[channel(0, 0.0, -1.0)], &displays, ScreenFrame::Monitor)[0];
        assert!(top.top < 0.01, "z=+1 is the top of the screen");
        assert!(bottom.bottom > 0.99, "z=-1 is the bottom of the screen");
        assert!(top.bottom < bottom.top);
    }

    #[test]
    fn positions_outside_the_screen_frame_clamp_to_its_edges() {
        // Monitor frame on a 16:9 display: height = 1080 * (1.1 / 1920) ≈ 0.62
        // room units, bottom edge at z = -0.14.
        let displays = [display(0, 0, 1920, 1080)];
        let desk = map_channels_to_tiles(&[channel(0, 0.0, -0.4)], &displays, ScreenFrame::Monitor)
            [0];
        assert!(
            desk.bottom > 0.99,
            "a desk light below the frame follows the bottom of the picture"
        );
        let side = map_channels_to_tiles(&[channel(0, -0.9, 0.2)], &displays, ScreenFrame::Monitor)
            [0];
        assert!(
            side.left.abs() < f32::EPSILON,
            "a lamp left of the frame follows the left edge"
        );
    }

    #[test]
    fn positions_inside_the_screen_frame_map_proportionally() {
        let displays = [display(0, 0, 1920, 1080)];
        let frame_h = 1080.0 / 1920.0 * 1.1;
        let mid_z = -0.14 + frame_h / 2.0;
        let tile = map_channels_to_tiles(
            &[channel(0, 0.0, mid_z as f64)],
            &displays,
            ScreenFrame::Monitor,
        )[0];
        let center_v = (tile.top + tile.bottom) / 2.0;
        assert!(
            (center_v - 0.5).abs() < 0.01,
            "the frame's vertical center samples mid-screen, got {center_v}"
        );
    }

    #[test]
    fn the_tv_frame_sits_higher_in_the_room_than_the_monitor_frame() {
        let displays = [display(0, 0, 1920, 1080)];
        let channels = [channel(0, 0.0, 0.1)];
        let monitor = map_channels_to_tiles(&channels, &displays, ScreenFrame::Monitor)[0];
        let tv = map_channels_to_tiles(&channels, &displays, ScreenFrame::Tv)[0];
        // The same room height lands lower on the TV picture because the TV
        // frame's bottom edge sits higher.
        let monitor_v = (monitor.top + monitor.bottom) / 2.0;
        let tv_v = (tv.top + tv.bottom) / 2.0;
        assert!(tv_v > monitor_v, "{tv_v} vs {monitor_v}");
    }

    #[test]
    fn tiles_stay_within_their_display_and_keep_a_minimum_size() {
        let displays = [display(-1920, -500, 1920, 1080), display(0, 0, 2560, 1440)];
        let channels = [
            channel(0, -1.0, 1.0),
            channel(1, 0.0, 0.0),
            channel(2, 1.0, -1.0),
        ];
        for tile in map_channels_to_tiles(&channels, &displays, ScreenFrame::Monitor) {
            assert!(tile.left >= 0.0 && tile.right <= 1.0);
            assert!(tile.top >= 0.0 && tile.bottom <= 1.0);
            assert!(tile.right - tile.left >= 0.04);
            assert!(tile.bottom - tile.top >= 0.04);
        }
    }

    #[test]
    fn center_channel_between_displays_lands_on_exactly_one() {
        let displays = [display(0, 0, 1920, 1080), display(1920, 0, 1920, 1080)];
        let tiles = map_channels_to_tiles(&[channel(0, 0.0, 0.0)], &displays, ScreenFrame::Monitor);
        // x=0 maps to the seam; the tile must belong to one display and stay
        // inside it.
        let tile = tiles[0];
        assert!(tile.display_index <= 1);
        assert!(tile.left >= 0.0 && tile.right <= 1.0);
    }

    #[test]
    fn depth_broadens_sampling_and_reduces_effect_strength() {
        let displays = [display(0, 0, 1920, 1080)];
        let screen = map_channels_to_tiles(&[channel_at_depth(0, 0.0, 1.0, 0.0)], &displays, ScreenFrame::Monitor)[0];
        let middle = map_channels_to_tiles(&[channel_at_depth(0, 0.0, 0.0, 0.0)], &displays, ScreenFrame::Monitor)[0];
        let back = map_channels_to_tiles(&[channel_at_depth(0, 0.0, -1.0, 0.0)], &displays, ScreenFrame::Monitor)[0];

        let screen_width = screen.right - screen.left;
        let middle_width = middle.right - middle.left;
        let back_width = back.right - back.left;
        assert!((screen_width - SCREEN_TILE_FRACTION).abs() < 0.001);
        assert!(screen_width < middle_width && middle_width < back_width);
        assert!((back_width - BACK_TILE_FRACTION).abs() < 0.001);
        assert!((screen.depth_gain - 1.0).abs() < f32::EPSILON);
        assert!(screen.depth_gain > middle.depth_gain);
        assert!(middle.depth_gain > back.depth_gain);
        assert!((back.depth_gain - BACK_DEPTH_GAIN).abs() < f32::EPSILON);
    }

    #[test]
    fn out_of_range_depth_is_clamped() {
        let displays = [display(0, 0, 1920, 1080)];
        let beyond_screen =
            map_channels_to_tiles(&[channel_at_depth(0, 0.0, 4.0, 0.0)], &displays, ScreenFrame::Monitor)[0];
        let beyond_back =
            map_channels_to_tiles(&[channel_at_depth(0, 0.0, -4.0, 0.0)], &displays, ScreenFrame::Monitor)[0];

        assert!((beyond_screen.depth_gain - 1.0).abs() < f32::EPSILON);
        assert!((beyond_back.depth_gain - BACK_DEPTH_GAIN).abs() < f32::EPSILON);
    }

    fn solid_tile(rgba: [u8; 4], width: u32, height: u32) -> Vec<u8> {
        let mut data = Vec::with_capacity((width * height * 4) as usize);
        for _ in 0..width * height {
            data.extend_from_slice(&rgba);
        }
        data
    }

    #[test]
    fn analyzes_a_solid_color_tile() {
        let data = solid_tile([255, 0, 0, 255], 32, 32);
        let rgb = analyze_rgba_tile(&data, 32, 32, 32 * 4);
        assert!((rgb[0] - 1.0).abs() < 0.001);
        assert!(rgb[1] < 0.001 && rgb[2] < 0.001);
    }

    #[test]
    fn letterbox_black_is_rejected_in_favor_of_content() {
        // Top half black (letterbox), bottom half green.
        let width = 32u32;
        let height = 32u32;
        let mut data = solid_tile([0, 0, 0, 255], width, height / 2);
        data.extend(solid_tile([0, 255, 0, 255], width, height / 2));
        let rgb = analyze_rgba_tile(&data, width, height, width * 4);
        assert!(rgb[1] > 0.9, "green content dominates, got {rgb:?}");
    }

    #[test]
    fn an_all_black_tile_stays_black() {
        let data = solid_tile([0, 0, 0, 255], 16, 16);
        assert_eq!(analyze_rgba_tile(&data, 16, 16, 16 * 4), [0.0; 3]);
    }

    #[test]
    fn saturated_pixels_outweigh_gray_ones() {
        // Half neutral gray, half vivid blue at the same luminance ballpark.
        let width = 32u32;
        let height = 32u32;
        let mut data = solid_tile([128, 128, 128, 255], width, height / 2);
        data.extend(solid_tile([0, 0, 255, 255], width, height / 2));
        let rgb = analyze_rgba_tile(&data, width, height, width * 4);
        assert!(
            rgb[2] > rgb[0] * 1.5,
            "blue must dominate the weighted mean, got {rgb:?}"
        );
    }

    #[test]
    fn row_pitch_padding_is_respected() {
        // 4 pixels per row, pitch padded to 32 bytes; padding filled with
        // garbage that must not be read as pixels.
        let width = 4u32;
        let height = 4u32;
        let pitch = 32u32;
        let mut data = vec![0xEEu8; (pitch * height) as usize];
        for y in 0..height {
            for x in 0..width {
                let offset = (y * pitch + x * 4) as usize;
                data[offset..offset + 4].copy_from_slice(&[255, 0, 0, 255]);
            }
        }
        let rgb = analyze_rgba_tile(&data, width, height, pitch);
        assert!((rgb[0] - 1.0).abs() < 0.001 && rgb[1] < 0.001);
    }

    fn solid_hdr_tile(rgb: [f32; 3], width: u32, height: u32) -> Vec<u8> {
        let encoded = rgb.map(|component| half::f16::from_f32(component).to_bits());
        let mut data = Vec::with_capacity((width * height * 8) as usize);
        for _ in 0..width * height {
            for component in encoded {
                data.extend_from_slice(&component.to_le_bytes());
            }
            data.extend_from_slice(&half::f16::ONE.to_bits().to_le_bytes());
        }
        data
    }

    #[test]
    fn hdr_tone_mapping_bounds_highlights_and_preserves_color_order() {
        let data = solid_hdr_tile([8.0, 2.0, 0.25], 16, 16);
        let rgb = analyze_rgba16f_tile(&data, 16, 16, 16 * 8);
        assert!(rgb.iter().all(|component| component.is_finite()));
        assert!(rgb.iter().all(|component| (0.0..=1.0).contains(component)));
        assert!(rgb[0] > rgb[1] && rgb[1] > rgb[2], "{rgb:?}");
    }

    #[test]
    fn hdr_adaptive_exposure_compensates_for_scene_luminance() {
        assert!(hdr_exposure(0.1) > hdr_exposure(2.0));
        assert_eq!(hdr_exposure(0.0), 4.0);
        assert_eq!(hdr_exposure(100.0), 0.1);
    }

    #[test]
    fn hdr_black_and_non_finite_values_are_safe() {
        let black = solid_hdr_tile([0.0; 3], 4, 4);
        assert_eq!(analyze_rgba16f_tile(&black, 4, 4, 4 * 8), [0.0; 3]);

        let mut invalid = solid_hdr_tile([1.0, 1.0, 1.0], 1, 1);
        invalid[0..2].copy_from_slice(&half::f16::NAN.to_bits().to_le_bytes());
        let rgb = analyze_rgba16f_tile(&invalid, 1, 1, 8);
        assert!(rgb.iter().all(|component| component.is_finite()));
    }

    #[test]
    fn smoother_converges_faster_at_higher_intensity() {
        let target = [[1.0f32, 0.0, 0.0]];
        let mut subtle = ChannelSmoother::new(1, SyncIntensity::Subtle, SyncMode::Video);
        let mut extreme = ChannelSmoother::new(1, SyncIntensity::Extreme, SyncMode::Video);
        for _ in 0..5 {
            subtle.step(&target);
            extreme.step(&target);
        }
        let subtle_r = subtle.current[0][0];
        let extreme_r = extreme.current[0][0];
        assert!(extreme_r > subtle_r * 2.0, "{extreme_r} vs {subtle_r}");
        assert!(extreme_r <= 1.0);
    }

    #[test]
    fn game_mode_responds_faster_than_video() {
        let video = ChannelSmoother::new(1, SyncIntensity::Moderate, SyncMode::Video);
        let game = ChannelSmoother::new(1, SyncIntensity::Moderate, SyncMode::Game);
        assert!(game.alpha > video.alpha);
    }

    #[test]
    fn wire_conversion_applies_brightness_and_keeps_bounds() {
        let colors = to_wire_colors(&[[1.0, 1.0, 1.0]], &[3], 1.35, 50.0);
        assert_eq!(colors[0].channel_id, 3);
        assert!(colors[0].rgb[0] < 0xFFFF, "50% brightness dims the output");
        let full = to_wire_colors(&[[1.0, 1.0, 1.0]], &[3], 1.35, 100.0);
        assert_eq!(full[0].rgb, [0xFFFF; 3], "boost never overflows");
    }

    #[test]
    fn srgb_round_trip_endpoints() {
        assert_eq!(srgb_u8_to_linear(0), 0.0);
        assert!((srgb_u8_to_linear(255) - 1.0).abs() < f32::EPSILON);
        assert_eq!(linear_to_srgb_u16(0.0), 0);
        assert_eq!(linear_to_srgb_u16(1.0), 0xFFFF);
    }
}
