//! DTLS 1.2 transport for HueStream.
//!
//! The bridge accepts DTLS/UDP on port 2100 restricted to
//! `TLS_PSK_WITH_AES_128_GCM_SHA256`. The PSK identity is the credential's
//! `hue-application-id` (from `/auth/v1`) and the PSK is the 16-byte
//! entertainment clientkey. Implemented with the pure-Rust `webrtc-dtls`
//! stack rather than vendored OpenSSL so Windows builds need no Perl/NASM
//! toolchain.

use std::sync::Arc;
use std::time::Duration;

use tokio::net::UdpSocket;
use webrtc_dtls::cipher_suite::CipherSuiteId;
use webrtc_dtls::config::Config;
use webrtc_dtls::conn::DTLSConn;
use webrtc_util::conn::Conn;

use super::protocol::HUE_STREAM_PORT;

/// The bridge answers the handshake only while the entertainment area is
/// started for our credential; a short timeout keeps failed starts snappy.
const HANDSHAKE_TIMEOUT: Duration = Duration::from_secs(8);

pub struct EntertainmentTransport {
    conn: DTLSConn,
}

impl EntertainmentTransport {
    /// Connects and completes the PSK handshake. The entertainment area must
    /// already be started (`action: start`) for the credential that owns
    /// `application_id`, otherwise the bridge ignores the handshake.
    pub async fn connect(
        bridge_ip: &str,
        application_id: &str,
        psk: [u8; 16],
    ) -> Result<Self, String> {
        let socket = UdpSocket::bind("0.0.0.0:0")
            .await
            .map_err(|error| format!("Failed to open UDP socket: {error}"))?;
        socket
            .connect((bridge_ip, HUE_STREAM_PORT))
            .await
            .map_err(|error| {
                format!("Failed to reach bridge on UDP port {HUE_STREAM_PORT}: {error}")
            })?;

        let config = Config {
            psk: Some(Arc::new(move |_hint: &[u8]| Ok(psk.to_vec()))),
            // On the client side this is the PSK identity presented to the
            // bridge; it must be the hue-application-id, not the app key.
            psk_identity_hint: Some(application_id.as_bytes().to_vec()),
            cipher_suites: vec![CipherSuiteId::Tls_Psk_With_Aes_128_Gcm_Sha256],
            ..Default::default()
        };

        let handshake = DTLSConn::new(Arc::new(socket), config, true, None);
        let conn = tokio::time::timeout(HANDSHAKE_TIMEOUT, handshake)
            .await
            .map_err(|_| {
                "DTLS handshake with the bridge timed out. The entertainment area may not be \
                 active for this credential."
                    .to_string()
            })?
            .map_err(|error| format!("DTLS handshake failed: {error}"))?;

        Ok(Self { conn })
    }

    pub async fn send(&self, frame: &[u8]) -> Result<(), String> {
        self.conn
            .send(frame)
            .await
            .map(|_| ())
            .map_err(|error| format!("Failed to send HueStream frame: {error}"))
    }

    pub async fn close(&self) {
        let _ = self.conn.close().await;
    }
}
