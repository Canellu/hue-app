/** A local Home screen section holding an ordered list of Hue room/zone ids. */
export interface HomeLayoutSection {
  id: string;
  name: string;
  /** Ordered Hue room/zone resource ids. */
  spaceIds: string[];
}

/** Persisted Home screen layout. This is app-local and does not come from Hue. */
export type HomeLayout = HomeLayoutSection[];

export type HomeGroupingMode = "rooms-first" | "zones-first" | "custom";
