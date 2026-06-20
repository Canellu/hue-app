import { PacedSlider } from "@/components/PacedSlider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import {
  sceneBubbleCss,
  sceneHexes,
} from "@/features/space-screen/utils/color-state";
import { activeTileTheme } from "@/lib/tile-theme";
import { cn } from "@/lib/utils";
import { useHueResourcesStore } from "@/stores/HueResourcesStore";
import type { HueScene } from "@/types/hue";
import { Loader2, Palette, Pencil, Sparkles, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { SidePane } from "./SidePane";

// The Hue bridge rejects resource names longer than 32 characters.
const MAX_NAME_LENGTH = 32;
const SPEED_MIN = 1;
const SPEED_MAX = 12;

const sceneBrightness = (scene: HueScene): number => {
  const max = scene.actions.reduce(
    (acc, action) => Math.max(acc, action.brightness ?? 0),
    0,
  );
  return Math.round(max > 0 ? max : 100);
};

const sceneSpeedToStep = (speed: number | null | undefined): number =>
  Math.min(
    SPEED_MAX,
    Math.max(SPEED_MIN, Math.round((speed ?? 0.5) * (SPEED_MAX - 1)) + 1),
  );

const sceneSpeedFromStep = (step: number): number =>
  (Math.min(SPEED_MAX, Math.max(SPEED_MIN, Math.round(step))) - 1) /
  (SPEED_MAX - 1);

interface ScenePaneProps {
  scene: HueScene;
  onClose: () => void;
}

export const ScenePane: React.FC<ScenePaneProps> = ({ scene, onClose }) => {
  const roomZones = useHueResourcesStore((state) => state.roomZones);

  const roomZone = scene.group
    ? roomZones.find((candidate) => candidate.id === scene.group)
    : undefined;
  const bubble = sceneBubbleCss(scene);
  const hexes = sceneHexes(scene);
  const brightness = Math.round(sceneBrightness(scene));
  const previewStyle =
    bubble != null
      ? activeTileTheme(bubble, hexes[0] ?? bubble, brightness)
      : undefined;

  const view = (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col items-center gap-3 pt-1">
        <span
          className={cn(
            "flex size-16 items-center justify-center rounded-2xl text-foreground",
            bubble ? "shadow-sm" : "bg-muted",
          )}
          style={previewStyle}
        >
          {scene.dynamic ? (
            <Sparkles size={30} strokeWidth={2.25} className="drop-shadow" />
          ) : (
            <Palette size={30} strokeWidth={2.25} />
          )}
        </span>
        <h2 className="max-w-full truncate text-center font-heading text-lg font-medium text-foreground">
          {scene.name}
        </h2>
      </div>

      <p className="text-sm font-medium text-muted-foreground">Presets</p>

      <div className="flex flex-col divide-y divide-border rounded-2xl border border-border">
        <PresetRow label="Brightness" value={`${brightness}%`} />
        {scene.dynamic && (
          <PresetRow
            label="Speed"
            value={`${sceneSpeedToStep(scene.speed)} of ${SPEED_MAX}`}
          />
        )}
        {scene.dynamic && (
          <PresetRow
            label="Autoplay"
            value={scene.autoDynamic ? "On" : "Off"}
          />
        )}
      </div>

      {hexes.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium text-muted-foreground">Palette</p>
          <div className="flex flex-wrap gap-2">
            {hexes.map((hex, index) => (
              <span
                key={`${hex}-${index}`}
                className="size-8 rounded-full shadow-sm ring-1 ring-foreground/15"
                style={{ background: hex }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <SidePane
      eyebrow={
        scene.smart ? "Smart scene" : scene.dynamic ? "Dynamic scene" : "Scene"
      }
      editLabel={`Edit ${scene.name}`}
      resetKey={scene.id}
      onClose={onClose}
      view={view}
      renderEdit={({ active, exitEdit }) => (
        <SceneEditPane
          scene={scene}
          active={active}
          roomZoneName={roomZone?.name ?? null}
          onClosePane={onClose}
          onExitEdit={exitEdit}
        />
      )}
    />
  );
};

const PresetRow: React.FC<{ label: string; value: string }> = ({
  label,
  value,
}) => (
  <div className="flex items-center justify-between gap-4 px-4 py-3">
    <span className="text-sm text-muted-foreground">{label}</span>
    <span className="text-sm font-medium text-foreground tabular-nums">
      {value}
    </span>
  </div>
);

const SceneEditPane: React.FC<{
  scene: HueScene;
  active: boolean;
  roomZoneName: string | null;
  onClosePane: () => void;
  onExitEdit: () => void;
}> = ({ scene, active, roomZoneName, onClosePane, onExitEdit }) => {
  const {
    renameScene,
    setSceneBrightness,
    setSceneSpeed,
    setSceneAutoplay,
    deleteScene,
    loadScenes,
  } = useHueResourcesStore();
  const [name, setName] = useState(scene.name);
  const [brightness, setBrightness] = useState(() =>
    Math.round(sceneBrightness(scene)),
  );
  const [speed, setSpeed] = useState(sceneSpeedToStep(scene.speed));
  const [autoDynamic, setAutoDynamic] = useState(scene.autoDynamic);
  const [renaming, setRenaming] = useState(false);
  const [deletePending, setDeletePending] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bubble = sceneBubbleCss(scene);
  const hexes = sceneHexes(scene);
  const previewStyle =
    bubble != null
      ? activeTileTheme(
          bubble,
          hexes[0] ?? bubble,
          Math.round(sceneBrightness(scene)),
        )
      : undefined;

  useEffect(() => {
    if (!active) return;
    setName(scene.name);
    setBrightness(Math.round(sceneBrightness(scene)));
    setSpeed(sceneSpeedToStep(scene.speed));
    setAutoDynamic(scene.autoDynamic);
    setRenaming(false);
    setDeletePending(false);
    setError(null);
  }, [scene, active]);

  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Name cannot be empty.");
      return;
    }
    if (trimmed.length > MAX_NAME_LENGTH) {
      setError(`Name cannot exceed ${MAX_NAME_LENGTH} characters.`);
      return;
    }

    setIsSaving(true);
    setError(null);
    try {
      if (deletePending) {
        await deleteScene(scene);
        onClosePane();
        return;
      }

      await renameScene(scene, trimmed);
      if (brightness !== Math.round(sceneBrightness(scene))) {
        setSceneBrightness(scene, brightness);
      }
      if (scene.dynamic && speed !== sceneSpeedToStep(scene.speed)) {
        await setSceneSpeed(scene, sceneSpeedFromStep(speed));
      }
      if (scene.dynamic && autoDynamic !== scene.autoDynamic) {
        await setSceneAutoplay(scene, autoDynamic);
      }
      await loadScenes();
      onExitEdit();
    } catch (saveError) {
      setError(String(saveError) || "Unable to save scene changes.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <ScrollArea
        fade
        hideScrollbar
        className="min-h-0 flex-1"
        viewportClassName="px-6 pb-6"
      >
        <div className="flex flex-col gap-5">
          <div className="flex flex-col items-center gap-3 pt-1">
            <span
              className={cn(
                "flex size-16 items-center justify-center rounded-2xl text-foreground",
                bubble ? "shadow-sm" : "bg-muted",
              )}
              style={previewStyle}
            >
              {scene.dynamic ? (
                <Sparkles
                  size={30}
                  strokeWidth={2.25}
                  className="drop-shadow"
                />
              ) : (
                <Palette size={30} strokeWidth={2.25} />
              )}
            </span>
            {renaming ? (
              <div className="flex w-full flex-col items-center gap-1">
                <Input
                  autoFocus
                  size="lg"
                  value={name}
                  maxLength={MAX_NAME_LENGTH}
                  disabled={isSaving || deletePending}
                  aria-label={`Rename ${scene.name}`}
                  className="max-w-full text-center font-heading text-lg font-medium"
                  onChange={(event) => setName(event.target.value)}
                  onFocus={(event) => event.target.select()}
                  onBlur={() => setRenaming(false)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === "Escape") {
                      setRenaming(false);
                    }
                  }}
                />
                <span className="text-xs text-muted-foreground tabular-nums">
                  {name.length}/{MAX_NAME_LENGTH}
                </span>
              </div>
            ) : (
              <button
                type="button"
                disabled={isSaving || deletePending}
                onClick={() => setRenaming(true)}
                title="Rename"
                className="flex max-w-full items-center gap-1.5 rounded-md px-2 py-0.5 text-center font-heading text-lg font-medium text-foreground hover:bg-muted disabled:opacity-50"
              >
                <span className="truncate">{name || "Unnamed scene"}</span>
                <Pencil className="size-4 shrink-0 text-muted-foreground" />
              </button>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-muted-foreground">
                Brightness
              </p>
              <span className="text-xs text-muted-foreground tabular-nums">
                {brightness}%
              </span>
            </div>
            <PacedSlider
              value={Math.max(1, brightness)}
              min={1}
              disabled={isSaving || deletePending}
              ariaLabel={`${scene.name} brightness`}
              isGroup={false}
              onInput={(value) => setBrightness(Math.round(value))}
              onCommit={(value) => setBrightness(Math.round(value))}
            />
          </div>

          {scene.dynamic && (
            <>
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">
                    Autoplay
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Start the animation whenever this scene is applied.
                  </p>
                </div>
                <Switch
                  checked={autoDynamic}
                  disabled={isSaving || deletePending}
                  aria-label="Toggle autoplay"
                  onCheckedChange={setAutoDynamic}
                />
              </div>

              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-muted-foreground">
                    Dynamic speed
                  </p>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {speed}
                  </span>
                </div>
                <PacedSlider
                  value={speed}
                  min={SPEED_MIN}
                  max={SPEED_MAX}
                  step={1}
                  disabled={isSaving || deletePending}
                  ariaLabel={`${scene.name} dynamic speed`}
                  isGroup={false}
                  onInput={(value) => setSpeed(Math.round(value))}
                  onCommit={(value) => setSpeed(Math.round(value))}
                />
              </div>
            </>
          )}

          <div className="border-t border-border pt-5">
            <div className="flex items-center justify-between gap-4 rounded-2xl border border-destructive/20 bg-destructive/5 p-4">
              <div className="min-w-0">
                <p className="text-sm font-medium text-destructive">
                  Delete scene
                </p>
                <p className="text-sm text-muted-foreground">
                  {roomZoneName
                    ? `Remove this scene from ${roomZoneName}. Save confirms it.`
                    : "Remove this scene. Save confirms it."}
                </p>
              </div>
              <Button
                type="button"
                variant={deletePending ? "outline" : "destructive"}
                disabled={isSaving}
                onClick={() => setDeletePending((current) => !current)}
              >
                <Trash2 />
                {deletePending ? "Undo" : "Delete"}
              </Button>
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
      </ScrollArea>

      <div className="flex gap-2 border-t border-border p-6 pt-4">
        <Button
          type="button"
          variant="outline"
          className="flex-1"
          disabled={isSaving}
          onClick={onExitEdit}
        >
          Cancel
        </Button>
        <Button
          type="button"
          className="flex-1"
          disabled={isSaving}
          onClick={() => void save()}
        >
          {isSaving ? <Loader2 className="animate-spin" /> : null}
          {deletePending ? "Delete scene" : "Save"}
        </Button>
      </div>
    </div>
  );
};
