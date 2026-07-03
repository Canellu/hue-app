import { useHueResourcesStore } from "@/stores/HueResourcesStore";
import type { HueLight, HueRoomZone, HueSettingsDevice } from "@/types/hue";
import { invoke } from "@tauri-apps/api/core";
import { useCallback, useRef, useState } from "react";

export const BLINK_DURATION_MS = 1_000;

/**
 * Resolves the light ids behind any selectable resource so a picker can blink
 * what the user just chose: a light blinks itself, a device blinks the lights
 * it carries, and a room/zone blinks all of its member lights.
 */
export const blinkableLightIds = (
  option: HueLight | HueSettingsDevice | HueRoomZone,
  lights: HueLight[],
): string[] => {
  if ("lightIds" in option) return option.lightIds;
  if ("serviceTypes" in option) {
    return lights
      .filter((light) => light.deviceId === option.id)
      .map((light) => light.id);
  }
  return [option.id];
};

/**
 * Runs the Hue app's native one-cycle identification breathe on a set of
 * lights. The bridge restores each light automatically. Ids that aren't in the
 * store are dropped (dev placeholder rows), and a key that is already
 * mid-blink is ignored so rapid re-selection doesn't stack signals.
 */
export const useBlinkLights = () => {
  const [blinkingKeys, setBlinkingKeys] = useState<ReadonlySet<string>>(
    () => new Set<string>(),
  );
  const inFlight = useRef(new Set<string>());

  const blink = useCallback(async (key: string, lightIds: string[]) => {
    const knownIds = new Set(
      useHueResourcesStore.getState().lights.map((light) => light.id),
    );
    const ids = lightIds.filter((id) => knownIds.has(id));
    if (ids.length === 0 || inFlight.current.has(key)) return;

    inFlight.current.add(key);
    setBlinkingKeys(new Set(inFlight.current));

    try {
      await Promise.all(ids.map((id) => invoke("signal-light", { id })));
      await wait(BLINK_DURATION_MS);
    } catch (error) {
      console.error("Failed to blink Hue lights", error);
    } finally {
      inFlight.current.delete(key);
      setBlinkingKeys(new Set(inFlight.current));
    }
  }, []);

  return { blinkingKeys, blink };
};

const wait = (durationMs: number) =>
  new Promise<void>((resolve) => window.setTimeout(resolve, durationMs));
