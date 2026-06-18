import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

interface StatusScreenProps {
  /** Illustration or animation shown above the text (e.g. DiscoveryWifi, BridgeStatus). */
  visual?: ReactNode;
  title: ReactNode;
  /** Extra classes for the title, e.g. "text-shimmer" for the loading state. */
  titleClassName?: string;
  description?: ReactNode;
  /** Action buttons rendered below the text. */
  actions?: ReactNode;
}

/**
 * Centered, full-height status layout shared by standalone screens (connection
 * loading, disconnected) and matching the setup wizard step style.
 */
export const StatusScreen = ({
  visual,
  title,
  titleClassName,
  description,
  actions,
}: StatusScreenProps) => (
  <div className="relative flex h-full w-full flex-col items-center justify-center px-6 py-10">
    <div className="flex w-full max-w-xl flex-col items-center gap-10 text-center">
      {visual}
      <div className="flex flex-col gap-3">
        <h1
          className={cn("font-heading text-4xl font-semibold", titleClassName)}
        >
          {title}
        </h1>
        {description ? (
          <p className="text-lg text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions}
    </div>
  </div>
);
