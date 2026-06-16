import { invoke } from "@tauri-apps/api/core";
import { RefreshCcw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useHue } from "../../context/HueContext";

export interface HueLight {
  id: string;
  name: string;
  isOn: boolean;
  brightness: number | null;
  reachable: boolean;
}

const toHueBrightness = (percentage: number) =>
  Math.max(1, Math.min(254, Math.round((percentage / 100) * 254)));

const fromHueBrightness = (bri: number | null) =>
  bri === null ? null : Math.round((bri / 254) * 100);

export const HueDeviceList: React.FC = () => {
  const { bridgeIp, bridgeId, applicationKey, refreshSession } = useHue();
  const [lights, setLights] = useState<HueLight[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savingIds, setSavingIds] = useState<Record<string, boolean>>({});

  const loadLights = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await invoke<HueLight[]>("get-hue-lights");
      setLights(
        result.map((light) => ({
          ...light,
          brightness: fromHueBrightness(light.brightness),
        })),
      );
    } catch (fetchError) {
      setError(String(fetchError) || "Failed to load lights.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadLights();
  }, [loadLights]);

  const updateLightState = useCallback(
    async (id: string, nextOn: boolean, nextBrightness: number | null) => {
      setSavingIds((prev) => ({ ...prev, [id]: true }));
      setLights((prev) =>
        prev.map((light) =>
          light.id === id
            ? {
                ...light,
                isOn: nextOn,
                brightness: nextBrightness ?? light.brightness,
              }
            : light,
        ),
      );

      try {
        await invoke("set-light-state", {
          id,
          on: nextOn,
          brightness:
            nextBrightness !== null && nextBrightness > 0
              ? toHueBrightness(nextBrightness)
              : null,
        });
      } catch (invokeError) {
        setError(String(invokeError) || "Unable to update light state.");
        void loadLights();
      } finally {
        setSavingIds((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
      }
    },
    [loadLights],
  );

  const toggleLight = useCallback(
    async (light: HueLight) => {
      await updateLightState(light.id, !light.isOn, light.brightness);
    },
    [updateLightState],
  );

  const changeBrightness = useCallback(
    async (light: HueLight, value: number) => {
      const nextOn = light.isOn || value > 0;
      await updateLightState(light.id, nextOn, value);
    },
    [updateLightState],
  );

  const sortedLights = useMemo(
    () => [...lights].sort((a, b) => a.name.localeCompare(b.name)),
    [lights],
  );

  return (
    <div className="space-y-8 text-left w-full">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-2xl">
          <h1 className="mb-2 text-4xl font-bold">Your Hue lights</h1>
          <p className="text-secondary">
            Control each device directly from the app. The layout will wrap as
            needed for smaller screens.
          </p>
          <p className="text-sm text-muted mt-2">
            Bridge IP: {bridgeIp ?? "Unknown"} · Bridge ID:{" "}
            {bridgeId ?? "Unknown"}
          </p>
        </div>

        <div className="flex flex-wrap items-start gap-3 justify-end">
          <button
            type="button"
            onClick={() => void loadLights()}
            disabled={isLoading}
            className="ghost-button inline-flex items-center gap-2"
          >
            <RefreshCcw size={16} />
            Refresh
          </button>
          <button
            type="button"
            onClick={() => void refreshSession()}
            className="ghost-button"
          >
            Reconnect
          </button>
        </div>
      </div>

      {error && <p className="text-sm text-red-300">{error}</p>}

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="neutral-spinner h-10 w-10 animate-spin rounded-full border-4"></div>
        </div>
      ) : sortedLights.length === 0 ? (
        <div className="py-12 text-center text-secondary">
          No lights found. Check your bridge and try refreshing.
        </div>
      ) : (
        <div className="flex flex-wrap gap-4">
          {sortedLights.map((light) => (
            <div
              key={light.id}
              className={`min-w-[280px] flex-1 rounded-3xl border p-4 transition-colors ${
                light.isOn
                  ? "border-accent/40 bg-accent/10 shadow-[0_18px_40px_-24px_rgba(124,58,237,0.35)]"
                  : "border-white/10 bg-var-panel"
              } relative`}
            >
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-lg font-semibold">{light.name}</p>
                    <p className="text-sm text-muted">
                      ID: {light.id} ·{" "}
                      {light.reachable ? "Reachable" : "Unreachable"}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => void toggleLight(light)}
                    disabled={savingIds[light.id]}
                    className={`accent-button whitespace-nowrap relative z-10 ${
                      savingIds[light.id] ? "opacity-60 cursor-not-allowed" : ""
                    }`}
                  >
                    {savingIds[light.id]
                      ? "Saving..."
                      : light.isOn
                        ? "Turn off"
                        : "Turn on"}
                  </button>
                </div>

                <div className="space-y-3">
                  <label className="flex items-center justify-between text-sm text-muted">
                    <span>Brightness</span>
                    <span className="font-semibold">
                      {light.brightness ?? 0}%
                    </span>
                  </label>

                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={light.brightness ?? 0}
                    disabled={savingIds[light.id]}
                    onChange={(event) =>
                      void changeBrightness(light, Number(event.target.value))
                    }
                    className="w-full"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
