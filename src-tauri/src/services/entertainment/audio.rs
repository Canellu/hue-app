//! Windows WASAPI loopback capture for Music sync.
//!
//! Capture runs on a dedicated COM-initialized thread. It requests 48 kHz
//! stereo float samples from the selected render endpoint, mixes them to
//! mono, and publishes only the newest analyzed channel colors.

#![cfg(windows)]

use std::collections::VecDeque;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{mpsc, Arc, Mutex};
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};

use serde::Serialize;
use wasapi::{
    Device, DeviceEnumerator, DeviceState, Direction, SampleType, StreamMode, WaveFormat,
};

use super::music::{
    EnergyTracker, MusicAnalyzer, MusicChannel, MusicChannelCount, ResolvedPalette, FFT_HOP,
    FFT_SIZE, SAMPLE_RATE,
};

const AUDIO_BUFFER_DURATION_HNS: i64 = 200_000;
const DEVICE_CHECK_INTERVAL: Duration = Duration::from_secs(1);
/// Consecutive non-active state checks (at `DEVICE_CHECK_INTERVAL`) before an
/// explicit audio device is treated as disconnected. Tolerates transient
/// state blips from wireless endpoints and virtual audio routers.
const DEVICE_LOSS_CHECKS: u32 = 4;
const START_TIMEOUT: Duration = Duration::from_secs(5);

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioDeviceInfo {
    pub id: String,
    pub name: String,
    pub is_default: bool,
}

pub fn enumerate_audio_outputs() -> Result<Vec<AudioDeviceInfo>, String> {
    thread::Builder::new()
        .name("hue-audio-enumeration".to_string())
        .spawn(enumerate_on_com_thread)
        .map_err(|error| format!("Failed to start audio enumeration: {error}"))?
        .join()
        .map_err(|_| "Audio enumeration thread panicked.".to_string())?
}

fn enumerate_on_com_thread() -> Result<Vec<AudioDeviceInfo>, String> {
    let _com = ComGuard::initialize()?;
    let enumerator = DeviceEnumerator::new()
        .map_err(|error| format!("Failed to create the audio device enumerator: {error}"))?;
    let default_id = enumerator
        .get_default_device(&Direction::Render)
        .and_then(|device| device.get_id())
        .ok();
    let collection = enumerator
        .get_device_collection(&Direction::Render)
        .map_err(|error| format!("Failed to enumerate audio outputs: {error}"))?;
    let mut devices = Vec::new();
    for device in &collection {
        let device = device.map_err(|error| format!("Failed to read an audio output: {error}"))?;
        let id = device
            .get_id()
            .map_err(|error| format!("Failed to read an audio output id: {error}"))?;
        let name = device
            .get_friendlyname()
            .unwrap_or_else(|_| "Unknown audio output".to_string());
        devices.push(AudioDeviceInfo {
            is_default: default_id.as_deref() == Some(&id),
            id,
            name,
        });
    }
    devices.sort_by(|a, b| {
        b.is_default
            .cmp(&a.is_default)
            .then_with(|| a.name.cmp(&b.name))
    });
    Ok(devices)
}

/// Diagnostic: opens loopback on `device_id` (or the default render endpoint
/// when `None`) for `duration` and returns the peak RMS observed. Lets a
/// caller confirm which endpoint actually carries a given app's audio without
/// starting a full sync session or touching any lights.
pub fn measure_loopback_peak_rms(
    device_id: Option<String>,
    duration: Duration,
) -> Result<f32, String> {
    thread::Builder::new()
        .name("hue-audio-probe".to_string())
        .spawn(move || {
            let _com = ComGuard::initialize()?;
            let enumerator = DeviceEnumerator::new()
                .map_err(|error| format!("Failed to create the audio device enumerator: {error}"))?;
            let device = match device_id.as_deref() {
                Some(id) => enumerator
                    .get_device(id)
                    .map_err(|_| "The selected audio output is unavailable.".to_string())?,
                None => enumerator
                    .get_default_device(&Direction::Render)
                    .map_err(|error| format!("No default audio output is available: {error}"))?,
            };
            let name = device
                .get_friendlyname()
                .unwrap_or_else(|_| "selected audio output".to_string());
            let client = create_loopback_client(&device)?;
            let capture = client
                .get_audiocaptureclient()
                .map_err(|error| format!("Failed to create loopback capture for {name}: {error}"))?;
            client
                .start_stream()
                .map_err(|error| format!("Failed to start loopback capture for {name}: {error}"))?;

            let mut raw = VecDeque::new();
            let mut samples = VecDeque::new();
            let mut peak = 0.0f32;
            let started = Instant::now();
            while started.elapsed() < duration {
                loop {
                    let frames = capture
                        .get_next_packet_size()
                        .map_err(|error| format!("Audio output {name} was lost: {error}"))?
                        .unwrap_or_default();
                    if frames == 0 {
                        break;
                    }
                    capture
                        .read_from_device_to_deque(&mut raw)
                        .map_err(|error| format!("Audio output {name} was lost: {error}"))?;
                }
                mix_stereo_f32_to_mono(&mut raw, &mut samples);
                if !samples.is_empty() {
                    let sum_squares: f32 = samples.iter().map(|s| s * s).sum();
                    let rms = (sum_squares / samples.len() as f32).sqrt();
                    peak = peak.max(rms);
                    samples.clear();
                }
                thread::sleep(Duration::from_millis(20));
            }
            let _ = client.stop_stream();
            Ok(peak)
        })
        .map_err(|error| format!("Failed to start audio probe: {error}"))?
        .join()
        .map_err(|_| "Audio probe thread panicked.".to_string())?
}

/// Diagnostic: opens loopback on `device_id` exactly like a Music session and
/// logs the endpoint's reported state plus read health every `interval` for
/// `duration`. Reveals whether an explicit device spuriously drops out of the
/// `Active` state (virtual audio routers churn endpoint state) versus a real
/// read failure. Returns one log line per tick.
pub fn diagnose_selected_device_capture(
    device_id: String,
    duration: Duration,
    interval: Duration,
) -> Result<Vec<String>, String> {
    thread::Builder::new()
        .name("hue-audio-diagnose".to_string())
        .spawn(move || {
            let _com = ComGuard::initialize()?;
            let enumerator = DeviceEnumerator::new()
                .map_err(|error| format!("Failed to create the audio device enumerator: {error}"))?;
            let device = enumerator
                .get_device(&device_id)
                .map_err(|_| "The selected audio output is unavailable.".to_string())?;
            let name = device
                .get_friendlyname()
                .unwrap_or_else(|_| "selected audio output".to_string());
            let client = create_loopback_client(&device)?;
            let capture = client
                .get_audiocaptureclient()
                .map_err(|error| format!("Failed to create loopback capture for {name}: {error}"))?;
            client
                .start_stream()
                .map_err(|error| format!("Failed to start loopback capture for {name}: {error}"))?;

            let mut log = Vec::new();
            let mut raw = VecDeque::new();
            let mut samples = VecDeque::new();
            let mut next_check = Instant::now();
            let started = Instant::now();
            let mut read_error: Option<String> = None;
            while started.elapsed() < duration {
                let mut peak = 0.0f32;
                let drain = (|| -> Result<(), String> {
                    loop {
                        let frames = capture
                            .get_next_packet_size()
                            .map_err(|error| format!("get_next_packet_size failed: {error}"))?
                            .unwrap_or_default();
                        if frames == 0 {
                            break;
                        }
                        capture
                            .read_from_device_to_deque(&mut raw)
                            .map_err(|error| format!("read_from_device failed: {error}"))?;
                    }
                    Ok(())
                })();
                if let Err(error) = drain {
                    read_error = Some(error);
                    break;
                }
                mix_stereo_f32_to_mono(&mut raw, &mut samples);
                if !samples.is_empty() {
                    let sum_squares: f32 = samples.iter().map(|s| s * s).sum();
                    peak = (sum_squares / samples.len() as f32).sqrt();
                    samples.clear();
                }

                if Instant::now() >= next_check {
                    next_check = Instant::now() + interval;
                    let state = enumerator
                        .get_device(&device_id)
                        .and_then(|device| device.get_state());
                    let (state_text, active) = match state {
                        Ok(state) => (format!("{state:?}"), state == DeviceState::Active),
                        Err(error) => (format!("get_device/get_state ERROR: {error}"), false),
                    };
                    log.push(format!(
                        "t={:>5}ms  state={state_text:<12} active={active:<5} rms={peak:.4}",
                        started.elapsed().as_millis()
                    ));
                }
                thread::sleep(Duration::from_millis(10));
            }
            let _ = client.stop_stream();
            if let Some(error) = read_error {
                log.push(format!("READ FAILED (this is a real device loss): {error}"));
            }
            Ok(log)
        })
        .map_err(|error| format!("Failed to start audio diagnosis: {error}"))?
        .join()
        .map_err(|_| "Audio diagnosis thread panicked.".to_string())?
}

pub struct AudioBoard {
    colors: Mutex<Vec<[f32; 3]>>,
    error: Mutex<Option<String>>,
}

impl AudioBoard {
    pub fn new(channel_count: usize) -> Arc<Self> {
        Arc::new(Self {
            colors: Mutex::new(vec![[0.0; 3]; channel_count]),
            error: Mutex::new(None),
        })
    }

    fn set_colors(&self, colors: Vec<[f32; 3]>) {
        *self.colors.lock().unwrap() = colors;
    }

    pub fn snapshot(&self) -> Vec<[f32; 3]> {
        self.colors.lock().unwrap().clone()
    }

    fn set_error(&self, error: String) {
        let mut slot = self.error.lock().unwrap();
        if slot.is_none() {
            *slot = Some(error);
        }
    }

    pub fn error(&self) -> Option<String> {
        self.error.lock().unwrap().clone()
    }
}

/// Latest loudness envelope for audio-reactive Video, plus the first error.
pub struct EnergyBoard {
    envelope: Mutex<f32>,
    error: Mutex<Option<String>>,
}

impl EnergyBoard {
    pub fn new() -> Arc<Self> {
        Arc::new(Self {
            envelope: Mutex::new(0.0),
            error: Mutex::new(None),
        })
    }

    fn set_envelope(&self, envelope: f32) {
        *self.envelope.lock().unwrap() = envelope;
    }

    pub fn envelope(&self) -> f32 {
        *self.envelope.lock().unwrap()
    }

    fn set_error(&self, error: String) {
        let mut slot = self.error.lock().unwrap();
        if slot.is_none() {
            *slot = Some(error);
        }
    }

    pub fn error(&self) -> Option<String> {
        self.error.lock().unwrap().clone()
    }
}

/// What the capture worker feeds each analysis window into.
enum AudioSink {
    Music {
        analyzer: MusicAnalyzer,
        channels: Vec<MusicChannel>,
        board: Arc<AudioBoard>,
    },
    Energy {
        tracker: EnergyTracker,
        board: Arc<EnergyBoard>,
    },
}

impl AudioSink {
    fn process(&mut self, frame: &[f32]) {
        match self {
            Self::Music {
                analyzer,
                channels,
                board,
            } => board.set_colors(analyzer.analyze(frame, channels)),
            Self::Energy { tracker, board } => board.set_envelope(tracker.process(frame)),
        }
    }

    fn set_error(&self, error: String) {
        match self {
            Self::Music { board, .. } => board.set_error(error),
            Self::Energy { board, .. } => board.set_error(error),
        }
    }
}

pub struct AudioRig {
    stop: Arc<AtomicBool>,
    worker: Option<JoinHandle<()>>,
}

impl AudioRig {
    /// Loopback capture feeding Music analysis. `device_id == None` follows
    /// the Windows default render endpoint, restarting loopback capture when
    /// the default changes.
    pub fn start_music(
        device_id: Option<String>,
        channels: Vec<MusicChannel>,
        palette: ResolvedPalette,
        channel_count: MusicChannelCount,
        board: &Arc<AudioBoard>,
    ) -> Result<Self, String> {
        Self::start(
            device_id,
            AudioSink::Music {
                analyzer: MusicAnalyzer::new(palette, channel_count),
                channels,
                board: board.clone(),
            },
        )
    }

    /// Loopback capture feeding only the loudness envelope, for
    /// audio-reactive Video.
    pub fn start_energy(device_id: Option<String>, board: &Arc<EnergyBoard>) -> Result<Self, String> {
        Self::start(
            device_id,
            AudioSink::Energy {
                tracker: EnergyTracker::new(),
                board: board.clone(),
            },
        )
    }

    fn start(device_id: Option<String>, sink: AudioSink) -> Result<Self, String> {
        let stop = Arc::new(AtomicBool::new(false));
        let thread_stop = stop.clone();
        let (ready_tx, ready_rx) = mpsc::sync_channel(1);
        let worker = thread::Builder::new()
            .name("hue-audio-loopback".to_string())
            .spawn(move || {
                audio_worker(device_id, sink, thread_stop, ready_tx);
            })
            .map_err(|error| format!("Failed to start audio capture: {error}"))?;

        match ready_rx.recv_timeout(START_TIMEOUT) {
            Ok(Ok(())) => Ok(Self {
                stop,
                worker: Some(worker),
            }),
            Ok(Err(error)) => {
                let _ = worker.join();
                Err(error)
            }
            Err(_) => {
                stop.store(true, Ordering::Release);
                // Dropping detaches the still-starting worker; it observes the
                // stop flag as soon as WASAPI returns.
                Err("Audio capture did not start in time.".to_string())
            }
        }
    }

    pub fn is_finished(&self) -> bool {
        self.worker.as_ref().is_some_and(JoinHandle::is_finished)
    }

    pub fn stop(&mut self) {
        self.stop.store(true, Ordering::Release);
        if let Some(worker) = self.worker.take() {
            let _ = worker.join();
        }
    }
}

fn audio_worker(
    device_id: Option<String>,
    mut sink: AudioSink,
    stop: Arc<AtomicBool>,
    ready_tx: mpsc::SyncSender<Result<(), String>>,
) {
    let _com = match ComGuard::initialize() {
        Ok(com) => com,
        Err(error) => {
            let _ = ready_tx.send(Err(error.clone()));
            sink.set_error(error);
            return;
        }
    };
    let mut first_start = true;

    while !stop.load(Ordering::Acquire) {
        match capture_device(
            device_id.as_deref(),
            &mut sink,
            &stop,
            first_start.then_some(&ready_tx),
        ) {
            Ok(CaptureEnd::Stopped) => return,
            Ok(CaptureEnd::DefaultChanged) => {
                first_start = false;
                thread::sleep(Duration::from_millis(100));
            }
            Err(error) => {
                if first_start {
                    let _ = ready_tx.send(Err(error.clone()));
                }
                sink.set_error(error);
                return;
            }
        }
    }
}

enum CaptureEnd {
    Stopped,
    DefaultChanged,
}

fn capture_device(
    selected_id: Option<&str>,
    sink: &mut AudioSink,
    stop: &AtomicBool,
    ready_tx: Option<&mpsc::SyncSender<Result<(), String>>>,
) -> Result<CaptureEnd, String> {
    let enumerator = DeviceEnumerator::new()
        .map_err(|error| format!("Failed to create the audio device enumerator: {error}"))?;
    let device = match selected_id {
        Some(id) => enumerator
            .get_device(id)
            .map_err(|_| "The selected audio output is unavailable.".to_string())?,
        None => enumerator
            .get_default_device(&Direction::Render)
            .map_err(|error| format!("No default audio output is available: {error}"))?,
    };
    let active_id = device
        .get_id()
        .map_err(|error| format!("Failed to read the audio output id: {error}"))?;
    let active_name = device
        .get_friendlyname()
        .unwrap_or_else(|_| "selected audio output".to_string());

    let client = create_loopback_client(&device)?;
    let capture = client
        .get_audiocaptureclient()
        .map_err(|error| format!("Failed to create loopback capture for {active_name}: {error}"))?;
    client
        .start_stream()
        .map_err(|error| format!("Failed to start loopback capture for {active_name}: {error}"))?;
    if let Some(tx) = ready_tx {
        let _ = tx.send(Ok(()));
    }

    let mut raw = VecDeque::new();
    let mut samples = VecDeque::with_capacity(FFT_SIZE * 2);
    let mut last_device_check = Instant::now();
    // Consecutive checks where an explicit device read as not-active. Wireless
    // endpoints and virtual audio routers (SteelSeries Sonar, VoiceMeeter, ...)
    // briefly report `NotPresent`/`Unplugged` while audio still streams, so a
    // single blip must not tear down the session.
    let mut unhealthy_checks: u32 = 0;
    let result = loop {
        if stop.load(Ordering::Acquire) {
            break Ok(CaptureEnd::Stopped);
        }

        loop {
            let frames = capture
                .get_next_packet_size()
                .map_err(|error| format!("Audio output {active_name} was lost: {error}"))?
                .unwrap_or_default();
            if frames == 0 {
                break;
            }
            capture
                .read_from_device_to_deque(&mut raw)
                .map_err(|error| format!("Audio output {active_name} was lost: {error}"))?;
        }
        mix_stereo_f32_to_mono(&mut raw, &mut samples);

        while samples.len() >= FFT_SIZE {
            let frame: Vec<f32> = samples.iter().take(FFT_SIZE).copied().collect();
            sink.process(&frame);
            for _ in 0..FFT_HOP {
                samples.pop_front();
            }
        }

        if last_device_check.elapsed() >= DEVICE_CHECK_INTERVAL {
            last_device_check = Instant::now();
            if let Some(id) = selected_id {
                let is_active = enumerator
                    .get_device(id)
                    .and_then(|device| device.get_state())
                    .is_ok_and(|state| state == DeviceState::Active);
                if is_active {
                    unhealthy_checks = 0;
                } else {
                    unhealthy_checks += 1;
                    // Genuine removal also fails the reads above; this guard
                    // only catches a device disabled without a read error.
                    if unhealthy_checks >= DEVICE_LOSS_CHECKS {
                        break Err("The selected audio output was disconnected.".to_string());
                    }
                }
            } else {
                let current_default = enumerator
                    .get_default_device(&Direction::Render)
                    .and_then(|device| device.get_id())
                    .map_err(|error| format!("The default audio output was lost: {error}"))?;
                if current_default != active_id {
                    break Ok(CaptureEnd::DefaultChanged);
                }
            }
        }

        thread::sleep(Duration::from_millis(5));
    };
    let _ = client.stop_stream();
    result
}

fn create_loopback_client(device: &Device) -> Result<wasapi::AudioClient, String> {
    let mut client = device
        .get_iaudioclient()
        .map_err(|error| format!("Failed to open the audio output: {error}"))?;
    let format = WaveFormat::new(32, 32, &SampleType::Float, SAMPLE_RATE as usize, 2, None);
    let mode = StreamMode::PollingShared {
        autoconvert: true,
        buffer_duration_hns: AUDIO_BUFFER_DURATION_HNS,
    };
    // A render endpoint initialized for Capture is WASAPI loopback mode.
    client
        .initialize_client(&format, &Direction::Capture, &mode)
        .map_err(|error| format!("Failed to initialize audio loopback: {error}"))?;
    Ok(client)
}

fn mix_stereo_f32_to_mono(raw: &mut VecDeque<u8>, samples: &mut VecDeque<f32>) {
    while raw.len() >= 8 {
        let left = f32::from_le_bytes(std::array::from_fn(|_| raw.pop_front().unwrap()));
        let right = f32::from_le_bytes(std::array::from_fn(|_| raw.pop_front().unwrap()));
        let mono = if left.is_finite() && right.is_finite() {
            ((left + right) * 0.5).clamp(-1.0, 1.0)
        } else {
            0.0
        };
        samples.push_back(mono);
    }
}

struct ComGuard;

impl ComGuard {
    fn initialize() -> Result<Self, String> {
        wasapi::initialize_mta()
            .ok()
            .map_err(|error| format!("Failed to initialize Windows audio: {error}"))?;
        Ok(Self)
    }
}

impl Drop for ComGuard {
    fn drop(&mut self) {
        wasapi::deinitialize();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stereo_float_frames_are_mixed_to_mono() {
        let mut raw = VecDeque::new();
        for sample in [0.75f32, 0.25, -0.5, 0.5] {
            raw.extend(sample.to_le_bytes());
        }
        let mut samples = VecDeque::new();
        mix_stereo_f32_to_mono(&mut raw, &mut samples);
        assert_eq!(samples, VecDeque::from([0.5, 0.0]));
        assert!(raw.is_empty());
    }

    #[test]
    fn invalid_and_clipped_samples_are_safe() {
        let mut raw = VecDeque::new();
        for sample in [f32::NAN, 1.0, 4.0, 4.0] {
            raw.extend(sample.to_le_bytes());
        }
        let mut samples = VecDeque::new();
        mix_stereo_f32_to_mono(&mut raw, &mut samples);
        assert_eq!(samples, VecDeque::from([0.0, 1.0]));
    }
}
