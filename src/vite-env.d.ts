/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DEV_VIEWS?: string;
  /** Anchors the dev URL bar: "left" | "center" | "right". Unset hides it. */
  readonly VITE_DEV_TOOL_PATH?: string;
}
