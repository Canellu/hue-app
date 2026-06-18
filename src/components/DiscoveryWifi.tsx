import { WifiHigh, WifiLow, WifiZero } from "lucide-react";
import { useEffect, useState } from "react";

// Each icon is a superset of the previous arc, so layering them and fading
// the higher levels in/out gives a smooth "signal building up" animation.
const DISCOVERY_WIFI_LAYERS = [WifiZero, WifiLow, WifiHigh] as const;
const STEP_COUNT = DISCOVERY_WIFI_LAYERS.length + 1;

export const DiscoveryWifi = () => {
  const [step, setStep] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setStep((current) => (current + 1) % STEP_COUNT);
    }, 600);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="relative flex size-24 items-center justify-center">
      {DISCOVERY_WIFI_LAYERS.map((Icon, index) => (
        <Icon
          key={index}
          className="absolute size-24 text-primary transition-opacity duration-500 ease-in-out"
          style={{ opacity: step > index ? 1 : 0 }}
        />
      ))}
    </div>
  );
};
