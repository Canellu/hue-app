import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { roomTileColor, sceneBubbleCss } from "./colorState";
import { DebouncedSlider } from "./DebouncedSlider";
import { LightCard } from "./LightCard";
import { getRoomIcon } from "./roomIcons";
import type { HueGroup, HueLight, HueScene } from "./types";

interface RoomScreenProps {
  group: HueGroup;
  lights: HueLight[];
  scenes: HueScene[];
  activeSceneId: string | null;
  selectedLightId: string | null;
  error: string | null;
  onGroupToggle: (group: HueGroup, nextOn: boolean) => void;
  onGroupBrightness: (group: HueGroup, pct: number) => void;
  onLightToggle: (light: HueLight, nextOn: boolean) => void;
  onLightBrightness: (light: HueLight, pct: number) => void;
  onSelectLight: (id: string) => void;
  onSceneActivate: (scene: HueScene) => void;
}

export const RoomScreen: React.FC<RoomScreenProps> = ({
  group,
  lights,
  scenes,
  activeSceneId,
  selectedLightId,
  error,
  onGroupToggle,
  onGroupBrightness,
  onLightToggle,
  onLightBrightness,
  onSelectLight,
  onSceneActivate,
}) => {
  const Icon = getRoomIcon(group.class);
  const roomPct = group.brightness ?? 0;
  const tile = roomTileColor(lights);

  return (
    <section className="mx-auto flex w-full flex-col gap-6">
      <div className="flex items-center gap-3">
        <span
          className={cn(
            "flex size-9 items-center justify-center rounded-full ring-1 ring-foreground/10",
            tile.active ? "text-white" : "bg-muted text-muted-foreground",
          )}
          style={
            tile.active && tile.background
              ? { background: tile.background }
              : undefined
          }
        >
          <Icon size={20} />
        </span>
        <h1 className="font-heading text-2xl font-semibold">{group.name}</h1>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Card className="gap-4">
        <div className="flex items-center justify-between px-6">
          <span className="text-sm text-muted-foreground">
            {group.lightCount} {group.lightCount === 1 ? "light" : "lights"} ·{" "}
            {group.anyOn ? "On" : "Off"}
          </span>
          <Switch
            checked={group.anyOn}
            aria-label={`Toggle ${group.name}`}
            onCheckedChange={(checked) => onGroupToggle(group, checked)}
          />
        </div>
        <div className="px-6">
          <DebouncedSlider
            value={group.anyOn ? roomPct : 0}
            ariaLabel={`${group.name} brightness`}
            debounceMs={300}
            onCommit={(pct) => onGroupBrightness(group, pct)}
          />
        </div>
      </Card>

      {scenes.length > 0 && (
        <div className="flex flex-col gap-3">
          <p className="text-sm font-medium text-muted-foreground">Scenes</p>
          <div className="flex flex-wrap gap-2">
            {scenes.map((scene) => {
              const bubble = sceneBubbleCss(scene);
              return (
                <Button
                  key={scene.id}
                  variant={scene.id === activeSceneId ? "default" : "outline"}
                  size="sm"
                  className="gap-2"
                  onClick={() => onSceneActivate(scene)}
                >
                  <span
                    className="size-3 rounded-full ring-1 ring-foreground/15"
                    style={bubble ? { background: bubble } : undefined}
                  />
                  {scene.name}
                </Button>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-3">
        <p className="text-sm font-medium text-muted-foreground">Lights</p>
        {lights.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            This room has no individual lights.
          </p>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
            {lights.map((light) => (
              <LightCard
                key={light.id}
                light={light}
                selected={light.id === selectedLightId}
                onSelect={onSelectLight}
                onToggle={onLightToggle}
                onBrightness={onLightBrightness}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
};
