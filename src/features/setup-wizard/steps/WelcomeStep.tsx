import { HueBridgeProIllustration } from "@/components/HueBridgeProIllustration";
import { Button } from "@/components/ui/button";
import type { WelcomeStepProps } from "@/types/setup-wizard";

export const WelcomeStep = ({ isBusy, onStartDiscovery }: WelcomeStepProps) => (
  <>
    <HueBridgeProIllustration />
    <div className="flex flex-col gap-3">
      <h1 className="font-heading text-4xl font-semibold">Welcome</h1>
      <p className="text-lg text-muted-foreground">
        Let&apos;s connect this app to your Philips Hue system.
      </p>
    </div>
    <Button size="xl" onClick={() => void onStartDiscovery()} disabled={isBusy}>
      {isBusy ? "Connecting…" : "Connect"}
    </Button>
  </>
);
