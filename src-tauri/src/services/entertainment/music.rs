//! Platform-independent music analysis for PC sync.
//!
//! WASAPI supplies 48 kHz mono samples. This module applies a Hann window,
//! computes an FFT, maps logarithmic frequency bands to Hue channels by their
//! horizontal positions, and turns RMS/onset energy into palette colors.

use std::sync::Arc;

use rustfft::num_complex::Complex32;
use rustfft::{Fft, FftPlanner};
use serde::{Deserialize, Serialize};

use crate::services::hue_client::SceneColor;

use super::analysis::srgb_u8_to_linear;

pub const SAMPLE_RATE: u32 = 48_000;
pub const FFT_SIZE: usize = 2_048;
pub const FFT_HOP: usize = FFT_SIZE / 2;

const MIN_FREQUENCY: f32 = 60.0;
const MAX_FREQUENCY: f32 = 12_000.0;
const SILENCE_RMS: f32 = 0.000_1;

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum MusicPalette {
    #[default]
    Spectrum,
    Vibrant,
    Warm,
    Cool,
}

/// Persisted palette selection: a built-in palette, or one derived from an
/// existing Hue scene's colors when the session starts. Untagged so the
/// built-in variants keep serializing as the plain strings older installs
/// already have stored.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum MusicPaletteChoice {
    Builtin(MusicPalette),
    Scene(ScenePaletteRef),
}

impl Default for MusicPaletteChoice {
    fn default() -> Self {
        Self::Builtin(MusicPalette::Spectrum)
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScenePaletteRef {
    pub scene_id: String,
    /// Display name captured when the palette was chosen; colors are refetched
    /// by id at session start.
    #[serde(default)]
    pub scene_name: Option<String>,
}

/// A palette the analyzer can sample: a built-in formula, or fixed linear-RGB
/// stops derived from a scene.
#[derive(Debug, Clone)]
pub enum ResolvedPalette {
    Builtin(MusicPalette),
    /// Never empty; sampled by piecewise-linear interpolation across `[0, 1]`.
    Stops(Vec<[f32; 3]>),
}

impl ResolvedPalette {
    fn color(&self, position: f32, onset: f32) -> [f32; 3] {
        match self {
            Self::Builtin(palette) => palette_color(*palette, position, onset),
            Self::Stops(stops) => sample_stops(stops, position),
        }
    }
}

/// Derives palette stops from a scene's action colors. `None` when the scene
/// carries no usable colors.
pub fn scene_palette_stops(colors: &[SceneColor]) -> Option<ResolvedPalette> {
    let stops: Vec<[f32; 3]> = colors
        .iter()
        .filter_map(|color| {
            if let Some([x, y]) = color.xy {
                Some(xy_to_linear_rgb(x as f32, y as f32))
            } else {
                color.mirek.map(mirek_to_linear_rgb)
            }
        })
        .filter(|rgb| rgb.iter().any(|component| *component > 0.0))
        .collect();
    if stops.is_empty() {
        None
    } else {
        Some(ResolvedPalette::Stops(stops))
    }
}

fn sample_stops(stops: &[[f32; 3]], position: f32) -> [f32; 3] {
    match stops.len() {
        0 => [0.0; 3],
        1 => stops[0],
        len => {
            let scaled = position.clamp(0.0, 1.0) * (len - 1) as f32;
            let index = (scaled.floor() as usize).min(len - 2);
            let fraction = scaled - index as f32;
            std::array::from_fn(|component| {
                stops[index][component]
                    + (stops[index + 1][component] - stops[index][component]) * fraction
            })
        }
    }
}

/// CIE 1931 xy chromaticity to linear sRGB, normalized so the dominant
/// component is 1: palette stops carry hue, loudness supplies brightness.
fn xy_to_linear_rgb(x: f32, y: f32) -> [f32; 3] {
    if y <= 0.0 {
        return [0.0; 3];
    }
    let big_x = x / y;
    let big_z = (1.0 - x - y) / y;
    let rgb = [
        3.2406 * big_x - 1.5372 - 0.4986 * big_z,
        -0.9689 * big_x + 1.8758 + 0.0415 * big_z,
        0.0557 * big_x - 0.2040 + 1.0570 * big_z,
    ];
    normalize_linear(rgb.map(|component| component.max(0.0)))
}

/// Color temperature to linear sRGB via the standard blackbody approximation,
/// normalized like `xy_to_linear_rgb`.
fn mirek_to_linear_rgb(mirek: u16) -> [f32; 3] {
    let kelvin = (1_000_000.0 / f32::from(mirek.max(1))).clamp(1_000.0, 12_000.0);
    let t = kelvin / 100.0;
    let red = if t <= 66.0 {
        255.0
    } else {
        329.698_73 * (t - 60.0).powf(-0.133_204_76)
    };
    let green = if t <= 66.0 {
        99.470_8 * t.ln() - 161.119_57
    } else {
        288.122_17 * (t - 60.0).powf(-0.075_514_85)
    };
    let blue = if t >= 66.0 {
        255.0
    } else if t <= 19.0 {
        0.0
    } else {
        138.517_73 * (t - 10.0).ln() - 305.044_8
    };
    let srgb = [red, green, blue].map(|component| component.clamp(0.0, 255.0) as u8);
    normalize_linear(srgb.map(srgb_u8_to_linear))
}

fn normalize_linear(rgb: [f32; 3]) -> [f32; 3] {
    let max = rgb[0].max(rgb[1]).max(rgb[2]);
    if max <= 0.0 {
        return [0.0; 3];
    }
    rgb.map(|component| component / max)
}

/// Loudness envelope for audio-reactive Video: RMS with an onset kick, fast
/// attack, slower decay. Same response shape as the Music envelope.
#[derive(Default)]
pub struct EnergyTracker {
    previous_rms: f32,
    envelope: f32,
}

impl EnergyTracker {
    pub fn new() -> Self {
        Self::default()
    }

    /// Feeds the newest mono samples and returns the envelope in `[0, 1]`.
    pub fn process(&mut self, samples: &[f32]) -> f32 {
        if samples.is_empty() {
            self.envelope *= 0.85;
            return self.envelope;
        }
        let sum_squares: f32 = samples
            .iter()
            .map(|sample| {
                let sample = sanitize_sample(*sample);
                sample * sample
            })
            .sum();
        let rms = (sum_squares / samples.len() as f32).sqrt();
        if rms < SILENCE_RMS {
            self.previous_rms = rms;
            self.envelope *= 0.85;
            return self.envelope;
        }
        let onset = ((rms - self.previous_rms * 1.12).max(0.0) * 7.5).clamp(0.0, 1.0);
        self.previous_rms = rms;
        let target = (rms * 3.5 + onset * 0.6).clamp(0.0, 1.0);
        self.envelope = if target > self.envelope {
            self.envelope * 0.35 + target * 0.65
        } else {
            self.envelope * 0.82 + target * 0.18
        };
        self.envelope
    }
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum MusicChannelCount {
    #[default]
    MatchArea,
    One,
    Three,
    Five,
}

impl MusicChannelCount {
    fn resolve(self, area_channels: usize) -> usize {
        match self {
            Self::MatchArea => area_channels.max(1),
            Self::One => 1,
            Self::Three => 3,
            Self::Five => 5,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct MusicChannel {
    pub channel_id: u8,
    /// Hue entertainment x coordinate, nominally -1 (left) to +1 (right).
    pub x: f32,
}

pub struct MusicAnalyzer {
    fft: Arc<dyn Fft<f32>>,
    window: Vec<f32>,
    spectrum: Vec<Complex32>,
    palette: ResolvedPalette,
    channel_count: MusicChannelCount,
    previous_rms: f32,
    envelope: f32,
}

impl MusicAnalyzer {
    pub fn new(palette: ResolvedPalette, channel_count: MusicChannelCount) -> Self {
        let mut planner = FftPlanner::<f32>::new();
        let fft = planner.plan_fft_forward(FFT_SIZE);
        let window = (0..FFT_SIZE)
            .map(|index| {
                let phase = 2.0 * std::f32::consts::PI * index as f32 / (FFT_SIZE - 1) as f32;
                0.5 - 0.5 * phase.cos()
            })
            .collect();
        Self {
            fft,
            window,
            spectrum: vec![Complex32::new(0.0, 0.0); FFT_SIZE],
            palette,
            channel_count,
            previous_rms: 0.0,
            envelope: 0.0,
        }
    }

    /// Analyze the newest samples. Missing input is zero-padded and excess
    /// input is trimmed from the front.
    pub fn analyze(&mut self, samples: &[f32], channels: &[MusicChannel]) -> Vec<[f32; 3]> {
        if channels.is_empty() {
            return Vec::new();
        }

        let start = samples.len().saturating_sub(FFT_SIZE);
        let input = &samples[start..];
        let padding = FFT_SIZE - input.len();
        let mut sum_squares = 0.0f32;
        for index in 0..FFT_SIZE {
            let sample = if index < padding {
                0.0
            } else {
                sanitize_sample(input[index - padding])
            };
            sum_squares += sample * sample;
            self.spectrum[index] = Complex32::new(sample * self.window[index], 0.0);
        }
        let rms = (sum_squares / FFT_SIZE as f32).sqrt();
        self.fft.process(&mut self.spectrum);

        if rms < SILENCE_RMS {
            self.previous_rms = rms;
            self.envelope *= 0.72;
            return vec![[0.0; 3]; channels.len()];
        }

        let onset = ((rms - self.previous_rms * 1.12).max(0.0) * 7.5).clamp(0.0, 1.0);
        self.previous_rms = rms;
        let target_envelope = (rms * 3.5 + onset * 0.6).clamp(0.0, 1.0);
        self.envelope = if target_envelope > self.envelope {
            self.envelope * 0.35 + target_envelope * 0.65
        } else {
            self.envelope * 0.82 + target_envelope * 0.18
        };

        let group_count = self.channel_count.resolve(channels.len());
        let bands = self.band_levels(group_count);
        let assignments = channel_groups(channels, group_count, self.channel_count);

        assignments
            .into_iter()
            .map(|group| {
                let group_position = if group_count <= 1 {
                    0.5
                } else {
                    group as f32 / (group_count - 1) as f32
                };
                let color = self.palette.color(group_position, onset);
                let band = bands.get(group).copied().unwrap_or_default();
                let level = (band * 0.72 + self.envelope * 0.28 + onset * 0.18).clamp(0.0, 1.0);
                color.map(|component| component * level)
            })
            .collect()
    }

    fn band_levels(&self, count: usize) -> Vec<f32> {
        let mut levels = Vec::with_capacity(count);
        let frequency_ratio = MAX_FREQUENCY / MIN_FREQUENCY;
        for band in 0..count {
            let low = MIN_FREQUENCY * frequency_ratio.powf(band as f32 / count as f32);
            let high = MIN_FREQUENCY * frequency_ratio.powf((band + 1) as f32 / count as f32);
            let low_bin = frequency_to_bin(low).max(1);
            let high_bin = frequency_to_bin(high).max(low_bin + 1).min(FFT_SIZE / 2);
            let mean_power = self.spectrum[low_bin..high_bin]
                .iter()
                .map(Complex32::norm_sqr)
                .sum::<f32>()
                / (high_bin - low_bin) as f32;
            // Hann coherent gain is 0.5; scale into a perceptual 0-1 range.
            levels.push(
                (mean_power.sqrt() * 4.0 / FFT_SIZE as f32)
                    .sqrt()
                    .clamp(0.0, 1.0),
            );
        }
        levels
    }
}

fn sanitize_sample(sample: f32) -> f32 {
    if sample.is_finite() {
        sample.clamp(-1.0, 1.0)
    } else {
        0.0
    }
}

fn frequency_to_bin(frequency: f32) -> usize {
    ((frequency * FFT_SIZE as f32 / SAMPLE_RATE as f32).round() as usize).min(FFT_SIZE / 2)
}

fn channel_groups(
    channels: &[MusicChannel],
    group_count: usize,
    configured: MusicChannelCount,
) -> Vec<usize> {
    if configured == MusicChannelCount::MatchArea {
        let mut sorted: Vec<(usize, f32)> = channels
            .iter()
            .enumerate()
            .map(|(index, channel)| (index, channel.x))
            .collect();
        sorted.sort_by(|a, b| a.1.total_cmp(&b.1));
        let mut groups = vec![0; channels.len()];
        for (rank, (index, _)) in sorted.into_iter().enumerate() {
            groups[index] = rank;
        }
        groups
    } else {
        channels
            .iter()
            .map(|channel| {
                let normalized = ((channel.x + 1.0) * 0.5).clamp(0.0, 0.999_999);
                (normalized * group_count as f32).floor() as usize
            })
            .collect()
    }
}

fn palette_color(palette: MusicPalette, position: f32, onset: f32) -> [f32; 3] {
    let rgb = match palette {
        MusicPalette::Spectrum => hsv_to_rgb((0.68 - position * 0.68).rem_euclid(1.0), 0.95, 1.0),
        MusicPalette::Vibrant => {
            let hue = (0.88 + position * 0.42 + onset * 0.08).fract();
            hsv_to_rgb(hue, 0.9, 1.0)
        }
        MusicPalette::Warm => lerp_rgb([255, 38, 8], [255, 190, 24], position),
        MusicPalette::Cool => lerp_rgb([32, 20, 255], [0, 225, 255], position),
    };
    rgb.map(srgb_u8_to_linear)
}

fn lerp_rgb(from: [u8; 3], to: [u8; 3], amount: f32) -> [u8; 3] {
    let amount = amount.clamp(0.0, 1.0);
    std::array::from_fn(|index| {
        (from[index] as f32 + (to[index] as f32 - from[index] as f32) * amount).round() as u8
    })
}

fn hsv_to_rgb(hue: f32, saturation: f32, value: f32) -> [u8; 3] {
    let sector = hue.rem_euclid(1.0) * 6.0;
    let index = sector.floor() as u32;
    let fraction = sector - index as f32;
    let p = value * (1.0 - saturation);
    let q = value * (1.0 - saturation * fraction);
    let t = value * (1.0 - saturation * (1.0 - fraction));
    let rgb = match index % 6 {
        0 => [value, t, p],
        1 => [q, value, p],
        2 => [p, value, t],
        3 => [p, q, value],
        4 => [t, p, value],
        _ => [value, p, q],
    };
    rgb.map(|component| (component * 255.0).round() as u8)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn channels() -> Vec<MusicChannel> {
        vec![
            MusicChannel {
                channel_id: 0,
                x: -1.0,
            },
            MusicChannel {
                channel_id: 1,
                x: 0.0,
            },
            MusicChannel {
                channel_id: 2,
                x: 1.0,
            },
        ]
    }

    fn sine(frequency: f32, amplitude: f32) -> Vec<f32> {
        (0..FFT_SIZE)
            .map(|index| {
                let phase =
                    2.0 * std::f32::consts::PI * frequency * index as f32 / SAMPLE_RATE as f32;
                phase.sin() * amplitude
            })
            .collect()
    }

    fn energy(color: [f32; 3]) -> f32 {
        color.into_iter().sum()
    }

    fn builtin(palette: MusicPalette) -> ResolvedPalette {
        ResolvedPalette::Builtin(palette)
    }

    #[test]
    fn silence_produces_black() {
        let mut analyzer =
            MusicAnalyzer::new(builtin(MusicPalette::Spectrum), MusicChannelCount::MatchArea);
        assert_eq!(
            analyzer.analyze(&vec![0.0; FFT_SIZE], &channels()),
            vec![[0.0; 3]; 3]
        );
    }

    #[test]
    fn frequency_energy_moves_across_horizontal_channels() {
        let mut low = MusicAnalyzer::new(builtin(MusicPalette::Warm), MusicChannelCount::Three);
        low.analyze(&sine(100.0, 0.8), &channels());
        let low_bands = low.band_levels(3);
        assert!(low_bands[0] > low_bands[2] * 2.0, "{low_bands:?}");

        let mut high = MusicAnalyzer::new(builtin(MusicPalette::Warm), MusicChannelCount::Three);
        high.analyze(&sine(6_000.0, 0.8), &channels());
        let high_bands = high.band_levels(3);
        assert!(high_bands[2] > high_bands[0] * 2.0, "{high_bands:?}");
    }

    #[test]
    fn clipping_and_non_finite_samples_remain_bounded() {
        let mut samples = vec![4.0; FFT_SIZE];
        samples[0] = f32::NAN;
        samples[1] = f32::INFINITY;
        let mut analyzer =
            MusicAnalyzer::new(builtin(MusicPalette::Vibrant), MusicChannelCount::MatchArea);
        let colors = analyzer.analyze(&samples, &channels());
        assert!(colors
            .iter()
            .flatten()
            .all(|component| component.is_finite() && (0.0..=1.0).contains(component)));
    }

    #[test]
    fn onset_responds_more_strongly_than_a_steady_signal() {
        let signal = sine(440.0, 0.35);
        let mut analyzer = MusicAnalyzer::new(builtin(MusicPalette::Cool), MusicChannelCount::One);
        let first = energy(analyzer.analyze(&signal, &channels())[0]);
        let steady = energy(analyzer.analyze(&signal, &channels())[0]);
        assert!(first > steady, "{first} should exceed {steady}");
    }

    #[test]
    fn fixed_channel_count_uses_horizontal_position() {
        assert_eq!(
            channel_groups(&channels(), 3, MusicChannelCount::Three),
            vec![0, 1, 2]
        );
        assert_eq!(
            channel_groups(&channels(), 1, MusicChannelCount::One),
            vec![0, 0, 0]
        );
    }

    #[test]
    fn palette_choice_stays_backward_compatible_with_stored_strings() {
        let builtin: MusicPaletteChoice = serde_json::from_str("\"spectrum\"").unwrap();
        assert_eq!(builtin, MusicPaletteChoice::Builtin(MusicPalette::Spectrum));
        assert_eq!(
            serde_json::to_value(&builtin).unwrap(),
            serde_json::json!("spectrum")
        );

        let scene: MusicPaletteChoice =
            serde_json::from_str(r#"{"sceneId":"abc","sceneName":"Sunset"}"#).unwrap();
        assert_eq!(
            scene,
            MusicPaletteChoice::Scene(ScenePaletteRef {
                scene_id: "abc".to_string(),
                scene_name: Some("Sunset".to_string()),
            })
        );
    }

    #[test]
    fn scene_colors_become_normalized_palette_stops() {
        let colors = [
            SceneColor {
                // Red-ish chromaticity.
                xy: Some([0.675, 0.322]),
                mirek: None,
            },
            SceneColor {
                // Warm white.
                xy: None,
                mirek: Some(450),
            },
        ];
        let Some(ResolvedPalette::Stops(stops)) = scene_palette_stops(&colors) else {
            panic!("expected stops");
        };
        assert_eq!(stops.len(), 2);
        // Red chromaticity: red dominates and is normalized to 1.
        assert_eq!(stops[0][0], 1.0);
        assert!(stops[0][0] > stops[0][2] * 4.0, "{stops:?}");
        // Warm temperature: red above blue.
        assert!(stops[1][0] > stops[1][2], "{stops:?}");

        assert!(scene_palette_stops(&[]).is_none());
        assert!(scene_palette_stops(&[SceneColor {
            xy: None,
            mirek: None
        }])
        .is_none());
    }

    #[test]
    fn stop_sampling_interpolates_between_endpoints() {
        let stops = vec![[1.0, 0.0, 0.0], [0.0, 0.0, 1.0]];
        assert_eq!(sample_stops(&stops, 0.0), [1.0, 0.0, 0.0]);
        assert_eq!(sample_stops(&stops, 1.0), [0.0, 0.0, 1.0]);
        let middle = sample_stops(&stops, 0.5);
        assert!((middle[0] - 0.5).abs() < 0.001 && (middle[2] - 0.5).abs() < 0.001);
        // Single stop is constant, out-of-range positions clamp.
        assert_eq!(sample_stops(&stops[..1], 0.9), [1.0, 0.0, 0.0]);
        assert_eq!(sample_stops(&stops, 2.0), [0.0, 0.0, 1.0]);
    }

    #[test]
    fn energy_tracker_rises_on_sound_and_decays_in_silence() {
        let mut tracker = EnergyTracker::new();
        assert_eq!(tracker.process(&vec![0.0; FFT_SIZE]), 0.0);

        let loud = sine(440.0, 0.6);
        let peak = (0..4).map(|_| tracker.process(&loud)).fold(0.0, f32::max);
        assert!(peak > 0.5, "loud audio must push the envelope up: {peak}");

        let after_silence = tracker.process(&vec![0.0; FFT_SIZE]);
        assert!(after_silence < peak, "silence must decay the envelope");
        assert!(after_silence > 0.0, "decay is gradual, not a hard cut");
    }

    #[test]
    fn energy_tracker_is_bounded_for_hostile_input() {
        let mut tracker = EnergyTracker::new();
        let mut samples = vec![9.0f32; 512];
        samples[0] = f32::NAN;
        samples[1] = f32::NEG_INFINITY;
        for _ in 0..8 {
            let envelope = tracker.process(&samples);
            assert!(envelope.is_finite() && (0.0..=1.0).contains(&envelope));
        }
        assert!(tracker.process(&[]).is_finite());
    }
}
