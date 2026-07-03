//! Windows Graphics Capture sessions feeding the sync engine.
//!
//! One capture session runs per selected display; each samples the channel
//! tiles that live on that display and writes linear-RGB colors into a shared
//! [`ColorBoard`]. The board holds only the latest value per channel —
//! superseded frames are simply overwritten, so no frame queue can grow. The
//! stream loop reads the board at its own tick rate.

#![cfg(windows)]

use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use windows_capture::capture::{CaptureControl, Context, GraphicsCaptureApiHandler};
use windows_capture::frame::Frame;
use windows_capture::graphics_capture_api::InternalCaptureControl;
use windows_capture::monitor::Monitor;
use windows_capture::settings::{
    ColorFormat, CursorCaptureSettings, DirtyRegionSettings, DrawBorderSettings,
    MinimumUpdateIntervalSettings, SecondaryWindowSettings, Settings,
};

use super::analysis::{self, ChannelTile};
use super::displays::DisplayInfo;

/// Latest per-channel colors (linear RGB) plus a sticky capture error.
pub struct ColorBoard {
    colors: Mutex<Vec<[f32; 3]>>,
    error: Mutex<Option<String>>,
}

impl ColorBoard {
    pub fn new(channel_count: usize) -> Arc<Self> {
        Arc::new(Self {
            colors: Mutex::new(vec![[0.0; 3]; channel_count]),
            error: Mutex::new(None),
        })
    }

    fn set(&self, channel_index: usize, color: [f32; 3]) {
        if let Some(slot) = self.colors.lock().unwrap().get_mut(channel_index) {
            *slot = color;
        }
    }

    pub fn snapshot(&self) -> Vec<[f32; 3]> {
        self.colors.lock().unwrap().clone()
    }

    pub fn set_error(&self, error: String) {
        let mut slot = self.error.lock().unwrap();
        if slot.is_none() {
            *slot = Some(error);
        }
    }

    pub fn error(&self) -> Option<String> {
        self.error.lock().unwrap().clone()
    }
}

/// Per-session configuration passed to the capture handler as flags.
pub struct SamplerConfig {
    /// Tiles on this display only, in display-normalized coordinates.
    pub tiles: Vec<ChannelTile>,
    pub board: Arc<ColorBoard>,
    /// Analysis is throttled to this interval regardless of the display's
    /// frame rate.
    pub min_interval: Duration,
}

pub struct FrameSampler {
    config: SamplerConfig,
    last_analysis: Option<Instant>,
}

impl GraphicsCaptureApiHandler for FrameSampler {
    type Flags = SamplerConfig;
    type Error = String;

    fn new(ctx: Context<Self::Flags>) -> Result<Self, Self::Error> {
        Ok(Self {
            config: ctx.flags,
            last_analysis: None,
        })
    }

    fn on_frame_arrived(
        &mut self,
        frame: &mut Frame,
        _capture_control: InternalCaptureControl,
    ) -> Result<(), Self::Error> {
        if let Some(last) = self.last_analysis {
            if last.elapsed() < self.config.min_interval {
                return Ok(());
            }
        }
        self.last_analysis = Some(Instant::now());

        let frame_width = frame.width();
        let frame_height = frame.height();
        for tile in &self.config.tiles {
            let start_x = (tile.left * frame_width as f32) as u32;
            let start_y = (tile.top * frame_height as f32) as u32;
            let end_x = ((tile.right * frame_width as f32) as u32)
                .min(frame_width)
                .max(start_x + 2);
            let end_y = ((tile.bottom * frame_height as f32) as u32)
                .min(frame_height)
                .max(start_y + 2);
            if end_x > frame_width || end_y > frame_height {
                continue;
            }

            let mut buffer = match frame.buffer_crop(start_x, start_y, end_x, end_y) {
                Ok(buffer) => buffer,
                Err(error) => {
                    // A single failed crop is transient (e.g. mid resize);
                    // keep the previous color and try again next tick.
                    let _ = error;
                    continue;
                }
            };
            let width = buffer.width();
            let height = buffer.height();
            let row_pitch = buffer.row_pitch();
            let color = match buffer.color_format() {
                ColorFormat::Rgba16F => {
                    analysis::analyze_rgba16f_tile(buffer.as_raw_buffer(), width, height, row_pitch)
                }
                ColorFormat::Rgba8 => {
                    analysis::analyze_rgba_tile(buffer.as_raw_buffer(), width, height, row_pitch)
                }
                ColorFormat::Bgra8 => {
                    continue;
                }
            };
            self.config.board.set(
                tile.channel_index,
                color.map(|component| component * tile.depth_gain),
            );
        }
        Ok(())
    }

    fn on_closed(&mut self) -> Result<(), Self::Error> {
        self.config
            .board
            .set_error("A captured display was disconnected.".to_string());
        Ok(())
    }
}

/// The set of running capture sessions backing one sync session.
pub struct CaptureRig {
    controls: Vec<CaptureControl<FrameSampler, String>>,
}

impl CaptureRig {
    /// Starts one capture session per selected display. `tiles` uses indices
    /// into `selected`. Already-started sessions are stopped again when a
    /// later one fails to start.
    pub fn start(
        selected: &[DisplayInfo],
        tiles: &[ChannelTile],
        board: &Arc<ColorBoard>,
        min_interval: Duration,
    ) -> Result<Self, String> {
        let monitors = Monitor::enumerate()
            .map_err(|error| format!("Failed to enumerate displays: {error}"))?;

        let mut rig = Self {
            controls: Vec::with_capacity(selected.len()),
        };
        for (display_index, display) in selected.iter().enumerate() {
            let display_tiles: Vec<ChannelTile> = tiles
                .iter()
                .filter(|tile| tile.display_index == display_index)
                .copied()
                .collect();
            if display_tiles.is_empty() {
                continue;
            }

            let monitor = monitors
                .iter()
                .find(|monitor| {
                    monitor
                        .device_name()
                        .map(|name| name == display.id)
                        .unwrap_or(false)
                })
                .copied()
                .ok_or_else(|| format!("Display {} is no longer available.", display.name))?;

            let settings = Settings::new(
                monitor,
                CursorCaptureSettings::WithoutCursor,
                DrawBorderSettings::WithoutBorder,
                SecondaryWindowSettings::Default,
                MinimumUpdateIntervalSettings::Custom(min_interval),
                DirtyRegionSettings::Default,
                if display.hdr_enabled {
                    ColorFormat::Rgba16F
                } else {
                    ColorFormat::Rgba8
                },
                SamplerConfig {
                    tiles: display_tiles,
                    board: board.clone(),
                    min_interval,
                },
            );

            match FrameSampler::start_free_threaded(settings) {
                Ok(control) => rig.controls.push(control),
                Err(error) => {
                    let message = format!("Failed to start capture on {}: {error}", display.name);
                    rig.stop();
                    return Err(message);
                }
            }
        }

        if rig.controls.is_empty() {
            return Err("No capturable region maps onto the selected displays.".to_string());
        }
        Ok(rig)
    }

    /// True when any capture thread died (e.g. handler error).
    pub fn any_session_dead(&self) -> bool {
        self.controls.iter().any(CaptureControl::is_finished)
    }

    /// Stops every session. Blocking (joins capture threads) — call from a
    /// blocking-capable context.
    pub fn stop(&mut self) {
        for control in self.controls.drain(..) {
            if let Err(error) = control.stop() {
                println!("WARN: failed to stop capture session: {error}");
            }
        }
    }
}
