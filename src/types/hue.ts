// Shared Hue API v2-facing frontend types. These mirror the camelCase payloads
// emitted by the Rust commands and preserve Hue resource names where practical.
// All ids are v2 UUIDs and all brightness values are percentages (0-100).

export type HueResourceType =
  | "room"
  | "zone"
  | "grouped_light"
  | "light"
  | "scene"
  | "device"
  | "zigbee_connectivity"
  | "bridge_home";

export interface HueResourceReference {
  rid: string;
  rtype: HueResourceType;
}

interface HueRoomZoneBase {
  /** v2 room/zone UUID. */
  id: string;
  name: string;
  /** v2 archetype, e.g. "living_room". */
  class: string;
  resourceType: "room" | "zone";
  anyOn: boolean;
  allOn: boolean;
  brightness: number | null;
  lightCount: number;
  lightIds: string[];
  /** grouped_light resource controlling this room/zone on/brightness. */
  groupedLightId: string | null;
}

export interface HueRoom extends HueRoomZoneBase {
  resourceType: "room";
}

export interface HueZone extends HueRoomZoneBase {
  resourceType: "zone";
}

export type HueRoomZone = HueRoom | HueZone;

export interface HueLight {
  id: string;
  name: string;
  isOn: boolean;
  brightness: number | null;
  reachable: boolean;
  colorMode: string | null;
  xy: [number, number] | null;
  /** Color temperature in mireds. */
  ct: number | null;
  /** Active effect identifier (e.g. "no_effect", "candle"). */
  effect: string | null;
  /** Effect identifiers this fixture supports. */
  effects: string[];
  supportsColor: boolean;
  supportsCt: boolean;
  ctMin: number | null;
  ctMax: number | null;
  gamut: [[number, number], [number, number], [number, number]] | null;
  modelId: string | null;
  productName: string | null;
  typeName: string | null;
  swVersion: string | null;
  uniqueId: string | null;
}

/** One preset color from a scene action — exactly one field is set. */
export interface SceneColor {
  xy: [number, number] | null;
  /** Color temperature in mireds. */
  mirek: number | null;
}

export interface HueScene {
  id: string;
  name: string;
  /** room/zone UUID this scene targets. */
  group: string | null;
  sceneType: string | null;
  /** Preset color palette parsed from the scene's per-light actions. */
  colors: SceneColor[];
}

/** Resource change pushed from the bridge SSE stream. Matched by v2 `id`. */
export interface HueEventUpdate {
  type: string;
  id: string | null;
  on: boolean | null;
  brightness: number | null;
  /** Live CIE xy chromaticity, when the change carries a color. */
  xy: [number, number] | null;
  /** Live color temperature in mireds, when the change carries one. */
  mirek: number | null;
}
