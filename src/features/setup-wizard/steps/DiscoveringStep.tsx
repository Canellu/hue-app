import { DiscoveryWifi } from "@/components/DiscoveryWifi";

export const DiscoveringStep = () => (
  <>
    <DiscoveryWifi />
    <div className="flex flex-col gap-3">
      <h1 className="text-shimmer font-heading text-4xl font-semibold">
        Looking for Hue Bridges…
      </h1>
      <p className="text-lg text-muted-foreground">
        Scanning your network for a Hue Bridge.
      </p>
    </div>
  </>
);
