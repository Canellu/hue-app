//! PC-hosted Hue Entertainment sync (HueStream v2 over DTLS).
//!
//! See docs/pc-sync-plan.md for the delivery plan.

pub mod analysis;
#[cfg(windows)]
pub mod audio;
#[cfg(windows)]
pub mod capture;
pub mod credentials;
pub mod displays;
pub mod dtls;
pub mod engine;
pub mod music;
pub mod preferences;
pub mod protocol;
pub mod snapshot;
