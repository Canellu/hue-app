import type {
  HostSyncStopBehavior,
  MusicChannelCount,
  MusicPalette,
  MusicPaletteChoice,
} from "@/types/host-sync";

export const builtinPalettes: { value: MusicPalette; label: string }[] = [
  { value: "spectrum", label: "Spectrum" },
  { value: "vibrant", label: "Vibrant" },
  { value: "warm", label: "Warm" },
  { value: "cool", label: "Cool" },
];

export const channelCounts: { value: MusicChannelCount; label: string }[] = [
  { value: "matchArea", label: "Match area channels" },
  { value: "one", label: "1 channel" },
  { value: "three", label: "3 channels" },
  { value: "five", label: "5 channels" },
];

export const stopBehaviors: {
  value: HostSyncStopBehavior;
  label: string;
  description: string;
}[] = [
  {
    value: "restore",
    label: "Restore previous state",
    description: "Lights return to how they were before syncing.",
  },
  {
    value: "keep",
    label: "Keep final colors",
    description: "Lights hold the last synced colors.",
  },
  {
    value: "turnOff",
    label: "Turn lights off",
    description: "Member lights switch off when sync stops.",
  },
];

export const paletteToSelectValue = (palette: MusicPaletteChoice): string =>
  typeof palette === "string" ? palette : `scene:${palette.sceneId}`;

export const selectValueToPalette = (
  value: string,
  sceneName?: string | null,
): MusicPaletteChoice =>
  value.startsWith("scene:")
    ? { sceneId: value.slice("scene:".length), sceneName: sceneName ?? null }
    : (value as MusicPalette);
