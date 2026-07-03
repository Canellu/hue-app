//! HueStream v2 wire protocol encoding.
//!
//! Frames are sent over DTLS/UDP port 2100 to the bridge. Layout (see
//! docs/HUE/migration-guide-to-the-new-hue-api.md, "Entertainment"):
//!
//! ```text
//! bytes 0..9    "HueStream"
//! bytes 9..11   version 2.0        (0x02, 0x00)
//! byte  11      sequence number    (wraps at 255)
//! bytes 12..14  reserved           (0x00, 0x00)
//! byte  14      color space        (0x00 = RGB)
//! byte  15      reserved           (0x00)
//! bytes 16..52  entertainment configuration id, 36 ASCII characters
//! then per channel (max 20):
//!   byte  0     channel id
//!   bytes 1..7  R, G, B as 16-bit big-endian
//! ```

/// UDP port the bridge listens on for HueStream DTLS traffic.
pub const HUE_STREAM_PORT: u16 = 2100;

/// Maximum channels a v2 entertainment configuration can carry.
pub const MAX_CHANNELS: usize = 20;

const PROTOCOL_NAME: &[u8; 9] = b"HueStream";
const VERSION: [u8; 2] = [0x02, 0x00];
const COLOR_SPACE_RGB: u8 = 0x00;
const HEADER_LEN: usize = 52;
const BYTES_PER_CHANNEL: usize = 7;

/// One channel's color for a single frame, in wire units.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ChannelColor {
    pub channel_id: u8,
    /// 16-bit RGB components exactly as sent on the wire.
    pub rgb: [u16; 3],
}

impl ChannelColor {
    /// Expands 8-bit sRGB components to the full 16-bit wire range
    /// (`0xFF` maps to `0xFFFF`).
    pub fn from_rgb8(channel_id: u8, rgb: [u8; 3]) -> Self {
        Self {
            channel_id,
            rgb: rgb.map(|component| u16::from(component) * 257),
        }
    }
}

/// Encodes one HueStream v2 frame targeting `area_id`.
pub fn encode_frame(
    area_id: &str,
    sequence: u8,
    channels: &[ChannelColor],
) -> Result<Vec<u8>, String> {
    if area_id.len() != 36 || !area_id.is_ascii() {
        return Err(format!(
            "Entertainment area id must be a 36-character ASCII UUID, got {:?}",
            area_id
        ));
    }
    if channels.is_empty() {
        return Err("HueStream frame needs at least one channel.".to_string());
    }
    if channels.len() > MAX_CHANNELS {
        return Err(format!(
            "HueStream supports at most {MAX_CHANNELS} channels, got {}.",
            channels.len()
        ));
    }

    let mut frame = Vec::with_capacity(HEADER_LEN + channels.len() * BYTES_PER_CHANNEL);
    frame.extend_from_slice(PROTOCOL_NAME);
    frame.extend_from_slice(&VERSION);
    frame.push(sequence);
    frame.extend_from_slice(&[0x00, 0x00]);
    frame.push(COLOR_SPACE_RGB);
    frame.push(0x00);
    frame.extend_from_slice(area_id.as_bytes());
    for channel in channels {
        frame.push(channel.channel_id);
        for component in channel.rgb {
            frame.extend_from_slice(&component.to_be_bytes());
        }
    }
    Ok(frame)
}

#[cfg(test)]
mod tests {
    use super::*;

    const AREA_ID: &str = "1a8d99cc-967b-44f2-9202-43f976c0fa6b";

    #[test]
    fn encodes_migration_guide_example() {
        // Mirrors the v2 example frame from the local migration guide.
        let channels = [
            ChannelColor {
                channel_id: 0,
                rgb: [0xffff, 0x0000, 0x0000],
            },
            ChannelColor {
                channel_id: 1,
                rgb: [0x0000, 0xffff, 0x0000],
            },
            ChannelColor {
                channel_id: 2,
                rgb: [0x0000, 0x0000, 0xffff],
            },
            ChannelColor {
                channel_id: 3,
                rgb: [0xffff, 0xffff, 0xffff],
            },
        ];
        let frame = encode_frame(AREA_ID, 0x07, &channels).unwrap();

        assert_eq!(&frame[0..9], b"HueStream");
        assert_eq!(&frame[9..11], &[0x02, 0x00]); // version 2.0
        assert_eq!(frame[11], 0x07); // sequence
        assert_eq!(&frame[12..14], &[0x00, 0x00]); // reserved
        assert_eq!(frame[14], 0x00); // RGB color space
        assert_eq!(frame[15], 0x00); // reserved
        assert_eq!(&frame[16..52], AREA_ID.as_bytes());
        assert_eq!(&frame[52..59], &[0x00, 0xff, 0xff, 0x00, 0x00, 0x00, 0x00]);
        assert_eq!(&frame[59..66], &[0x01, 0x00, 0x00, 0xff, 0xff, 0x00, 0x00]);
        assert_eq!(&frame[66..73], &[0x02, 0x00, 0x00, 0x00, 0x00, 0xff, 0xff]);
        assert_eq!(&frame[73..80], &[0x03, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]);
        assert_eq!(frame.len(), 80);
    }

    #[test]
    fn encodes_full_16bit_components_big_endian() {
        let frame = encode_frame(
            AREA_ID,
            0,
            &[ChannelColor {
                channel_id: 5,
                rgb: [0x1234, 0xabcd, 0x00ff],
            }],
        )
        .unwrap();
        assert_eq!(&frame[52..59], &[0x05, 0x12, 0x34, 0xab, 0xcd, 0x00, 0xff]);
    }

    #[test]
    fn expands_8bit_colors_to_wire_range() {
        assert_eq!(
            ChannelColor::from_rgb8(0, [0xff, 0x00, 0x80]).rgb,
            [0xffff, 0x0000, 0x8080]
        );
    }

    #[test]
    fn sequence_wraps_without_error() {
        let channel = [ChannelColor::from_rgb8(0, [1, 2, 3])];
        for sequence in [0u8, 1, 254, 255] {
            let frame = encode_frame(AREA_ID, sequence, &channel).unwrap();
            assert_eq!(frame[11], sequence);
        }
        // Wrapping is the caller's job; 255 + 1 rolls over to 0.
        assert_eq!(255u8.wrapping_add(1), 0);
    }

    #[test]
    fn accepts_1_through_20_channels() {
        for count in 1..=MAX_CHANNELS {
            let channels: Vec<ChannelColor> = (0..count)
                .map(|id| ChannelColor::from_rgb8(id as u8, [0, 0, 0]))
                .collect();
            let frame = encode_frame(AREA_ID, 0, &channels).unwrap();
            assert_eq!(frame.len(), HEADER_LEN + count * BYTES_PER_CHANNEL);
        }
    }

    #[test]
    fn rejects_zero_and_too_many_channels() {
        assert!(encode_frame(AREA_ID, 0, &[]).is_err());
        let channels: Vec<ChannelColor> = (0..=MAX_CHANNELS)
            .map(|id| ChannelColor::from_rgb8(id as u8, [0, 0, 0]))
            .collect();
        assert!(encode_frame(AREA_ID, 0, &channels).is_err());
    }

    #[test]
    fn rejects_invalid_area_ids() {
        assert!(encode_frame("not-a-uuid", 0, &[ChannelColor::from_rgb8(0, [0, 0, 0])]).is_err());
        // Right length but non-ASCII must be rejected too.
        let non_ascii = "1a8d99cc-967b-44f2-9202-43f976c0fa6ä";
        assert!(encode_frame(non_ascii, 0, &[ChannelColor::from_rgb8(0, [0, 0, 0])]).is_err());
    }
}
