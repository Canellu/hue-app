import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { DebouncedSlider } from "@/components/DebouncedSlider";
import { sceneBubbleCss } from "@/features/space-screen/utils/color-state";
import { LightCard } from "./components/LightCard";
import type { HueLight, HueRoomZone, HueScene } from "@/types/hue";

interface SpaceScreenProps {
  roomZone: HueRoomZone;
  lights: HueLight[];
  scenes: HueScene[];
  activeSceneId: string | null;
  selectedLightId: string | null;
  error: string | null;
  onRoomZoneToggle: (roomZone: HueRoomZone, nextOn: boolean) => void;
  onRoomZoneBrightness: (roomZone: HueRoomZone, pct: number) => void;
  onLightToggle: (light: HueLight, nextOn: boolean) => void;
  onLightBrightness: (light: HueLight, pct: number) => void;
  onSelectLight: (id: string) => void;
  onSceneActivate: (scene: HueScene) => void;
}

export const SpaceScreen: React.FC<SpaceScreenProps> = ({
  roomZone,
  lights,
  scenes,
  activeSceneId,
  selectedLightId,
  error,
  onRoomZoneToggle,
  onRoomZoneBrightness,
  onLightToggle,
  onLightBrightness,
  onSelectLight,
  onSceneActivate,
}) => {
  const brightnessPct = roomZone.brightness ?? 0;

  return (
    <section className="mx-auto flex w-full flex-col gap-6">
      {error && <p className="text-sm text-destructive">{error}</p>}

      <Card className="gap-4">
        <div className="flex items-center justify-between px-6">
          <span className="text-sm font-medium text-muted-foreground">
            Group controls
          </span>
          <Switch
            checked={roomZone.anyOn}
            aria-label={`Toggle ${roomZone.name}`}
            onCheckedChange={(checked) => onRoomZoneToggle(roomZone, checked)}
          />
        </div>
        <div className="px-6">
          <DebouncedSlider
            value={roomZone.anyOn ? brightnessPct : 0}
            ariaLabel={`${roomZone.name} brightness`}
            debounceMs={300}
            onCommit={(pct) => onRoomZoneBrightness(roomZone, pct)}
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
            This room or zone has no individual lights.
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
