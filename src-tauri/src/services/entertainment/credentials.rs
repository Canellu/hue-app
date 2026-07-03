//! Entertainment (PC sync) credential storage.
//!
//! Streaming needs two secrets beyond the normal bridge session:
//!
//! - the entertainment `clientkey` returned by link-button pairing, used as
//!   the DTLS pre-shared key, and
//! - optionally a dedicated application key. New pairings capture the
//!   clientkey together with the normal app credential; existing
//!   installations that paired before clientkey capture provision a separate
//!   entertainment credential so the current bridge session is untouched.
//!
//! Both live in the system keyring next to the main application key.

use keyring::Entry;
use serde::Serialize;
use std::sync::{Mutex, OnceLock};

const KEYRING_SERVICE: &str = "com.anton.hue-app";
const CLIENT_KEY_ACCOUNT: &str = "hue-entertainment-client-key";
const APPLICATION_KEY_ACCOUNT: &str = "hue-entertainment-application-key";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EntertainmentCredentialStatus {
    /// True when a DTLS clientkey is stored and streaming can be attempted.
    pub has_client_key: bool,
    /// True when streaming uses a provisioned credential separate from the
    /// main bridge session (pre-existing installs), false when the main
    /// pairing already carries the clientkey.
    pub has_dedicated_application_key: bool,
}

pub fn credential_status() -> EntertainmentCredentialStatus {
    EntertainmentCredentialStatus {
        has_client_key: matches!(load_client_key(), Ok(Some(_))),
        has_dedicated_application_key: matches!(load_application_key(), Ok(Some(_))),
    }
}

/// Decodes the 32-hex-character clientkey into the 16-byte DTLS PSK.
pub fn decode_client_key(client_key: &str) -> Result<[u8; 16], String> {
    let trimmed = client_key.trim();
    if trimmed.len() != 32 || !trimmed.chars().all(|char| char.is_ascii_hexdigit()) {
        return Err("Entertainment clientkey must be 32 hexadecimal characters.".to_string());
    }
    let mut psk = [0u8; 16];
    for (index, byte) in psk.iter_mut().enumerate() {
        *byte = u8::from_str_radix(&trimmed[index * 2..index * 2 + 2], 16)
            .map_err(|error| format!("Invalid clientkey: {error}"))?;
    }
    Ok(psk)
}

pub fn save_client_key(client_key: &str) -> Result<(), String> {
    // Validate before persisting so a corrupt key fails at pairing time, not
    // at stream start.
    decode_client_key(client_key)?;
    save(client_key_entry()?, client_key_cache(), client_key)
}

pub fn load_client_key() -> Result<Option<String>, String> {
    load(client_key_entry()?, client_key_cache())
}

pub fn save_application_key(application_key: &str) -> Result<(), String> {
    save(
        application_key_entry()?,
        application_key_cache(),
        application_key,
    )
}

pub fn load_application_key() -> Result<Option<String>, String> {
    load(application_key_entry()?, application_key_cache())
}

/// Removes every stored entertainment secret. Used when the bridge session is
/// reset so stale streaming credentials never outlive the pairing.
pub fn clear_credentials() -> Result<(), String> {
    let client = clear(client_key_entry()?, client_key_cache());
    let application = clear(application_key_entry()?, application_key_cache());
    client.and(application)
}

fn client_key_entry() -> Result<Entry, String> {
    Entry::new(KEYRING_SERVICE, CLIENT_KEY_ACCOUNT)
        .map_err(|error| format!("Failed to access secure keyring: {error}"))
}

fn application_key_entry() -> Result<Entry, String> {
    Entry::new(KEYRING_SERVICE, APPLICATION_KEY_ACCOUNT)
        .map_err(|error| format!("Failed to access secure keyring: {error}"))
}

/// Keyring reads are blocking syscalls; cache values in memory like the main
/// application key so status checks stay off the keyring.
fn client_key_cache() -> &'static Mutex<Option<String>> {
    static CACHE: OnceLock<Mutex<Option<String>>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(None))
}

fn application_key_cache() -> &'static Mutex<Option<String>> {
    static CACHE: OnceLock<Mutex<Option<String>>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(None))
}

fn save(entry: Entry, cache: &Mutex<Option<String>>, value: &str) -> Result<(), String> {
    entry
        .set_password(value)
        .map_err(|error| format!("Failed to save entertainment credential: {error}"))?;
    *cache.lock().unwrap() = Some(value.to_string());
    Ok(())
}

fn load(entry: Entry, cache: &Mutex<Option<String>>) -> Result<Option<String>, String> {
    if let Some(value) = cache.lock().unwrap().clone() {
        return Ok(Some(value));
    }
    match entry.get_password() {
        Ok(value) => {
            *cache.lock().unwrap() = Some(value.clone());
            Ok(Some(value))
        }
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(error) => Err(format!("Failed to read entertainment credential: {error}")),
    }
}

fn clear(entry: Entry, cache: &Mutex<Option<String>>) -> Result<(), String> {
    *cache.lock().unwrap() = None;
    match entry.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(error) => Err(format!("Failed to clear entertainment credential: {error}")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decodes_valid_client_key() {
        assert_eq!(
            decode_client_key("00112233445566778899AABBCCDDEEFF").unwrap(),
            [
                0x00, 0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88, 0x99, 0xaa, 0xbb, 0xcc, 0xdd,
                0xee, 0xff
            ]
        );
    }

    #[test]
    fn decodes_lowercase_and_trims_whitespace() {
        assert_eq!(
            decode_client_key(" deadbeefdeadbeefdeadbeefdeadbeef \n")
                .unwrap()
                .to_vec(),
            [0xde, 0xad, 0xbe, 0xef].repeat(4)
        );
    }

    #[test]
    fn rejects_wrong_length_or_non_hex() {
        assert!(decode_client_key("").is_err());
        assert!(decode_client_key("abc").is_err());
        assert!(decode_client_key("00112233445566778899AABBCCDDEE").is_err()); // 30 chars
        assert!(decode_client_key("00112233445566778899AABBCCDDEEFF00").is_err()); // 34 chars
        assert!(decode_client_key("ZZ112233445566778899AABBCCDDEEFF").is_err());
    }
}
