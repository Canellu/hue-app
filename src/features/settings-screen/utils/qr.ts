import { BrowserQRCodeReader } from "@zxing/browser";

export interface HueQrInstallCode {
  macAddress: string;
  installCode: string;
}

export const parseHueQrText = (text: string): HueQrInstallCode => {
  const trimmed = text.trim();
  if (!trimmed.startsWith("HUE:")) {
    throw new Error("That image does not contain a Hue Zigbee QR code.");
  }

  let installCode: string | null = null;
  let macAddress: string | null = null;
  for (const part of trimmed.split(/\s+/)) {
    const installMatch = /^(?:HUE:)?Z:([a-fA-F0-9]+)$/.exec(part);
    const macMatch = /^M:([a-fA-F0-9]+)$/.exec(part);
    if (installMatch) installCode = installMatch[1].toUpperCase();
    if (macMatch) macAddress = macMatch[1].toUpperCase();
  }

  if (!installCode) throw new Error("Hue QR code is missing an install code.");
  if (!macAddress) throw new Error("Hue QR code is missing a MAC address.");
  if (!/^[A-F0-9]{36}$/.test(installCode)) {
    throw new Error("Hue QR install code must be 36 hexadecimal characters.");
  }
  if (!/^[A-F0-9]{16}$/.test(macAddress)) {
    throw new Error("Hue QR MAC address must be 16 hexadecimal characters.");
  }

  return { macAddress, installCode };
};

export const decodeQrImageFile = async (file: File): Promise<string> => {
  const url = URL.createObjectURL(file);
  try {
    const reader = new BrowserQRCodeReader();
    const result = await reader.decodeFromImageUrl(url);
    return result.getText();
  } catch {
    throw new Error("No readable QR code was found in that image.");
  } finally {
    URL.revokeObjectURL(url);
  }
};
