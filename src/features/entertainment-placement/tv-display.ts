import type { HostSyncDisplay } from "@/types/host-sync";

const STORAGE_KEY = "hue-entertainment-tv-aspect-ratios";

export interface TvAspectRatio {
  width: number;
  height: number;
}

export const DEFAULT_TV_ASPECT_RATIO: TvAspectRatio = {
  width: 16,
  height: 9,
};

const validDimension = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) && value > 0;

const normalize = (ratio: TvAspectRatio): TvAspectRatio => ({
  width: validDimension(ratio.width)
    ? Math.min(100, ratio.width)
    : DEFAULT_TV_ASPECT_RATIO.width,
  height: validDimension(ratio.height)
    ? Math.min(100, ratio.height)
    : DEFAULT_TV_ASPECT_RATIO.height,
});

const readStoredRatios = (): Record<string, TvAspectRatio> => {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
    return value && typeof value === "object"
      ? (value as Record<string, TvAspectRatio>)
      : {};
  } catch {
    return {};
  }
};

export const loadTvAspectRatio = (areaId: string): TvAspectRatio => {
  const stored = readStoredRatios()[areaId];
  return stored ? normalize(stored) : { ...DEFAULT_TV_ASPECT_RATIO };
};

export const saveTvAspectRatio = (
  areaId: string,
  ratio: TvAspectRatio,
): void => {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      ...readStoredRatios(),
      [areaId]: normalize(ratio),
    }),
  );
};

export const formatTvAspectRatio = (ratio: TvAspectRatio) =>
  `${ratio.width}:${ratio.height}`;

export const createVirtualTvDisplay = (
  ratio: TvAspectRatio,
): HostSyncDisplay => {
  const normalized = normalize(ratio);
  const height = 900;
  return {
    id: "virtual-tv",
    name: "TV",
    adapter: null,
    x: 0,
    y: 0,
    width: Math.round((normalized.width / normalized.height) * height),
    height,
    isPrimary: true,
    refreshRate: null,
    hdrEnabled: false,
  };
};
