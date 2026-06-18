import { cn } from "@/lib/utils";
import React from "react";

import { PressingFinger } from "./HueBridgeIllustration";

// The Pro's right-hand status indicator: a small dot flanked by two arcs,
// like "(•)". Hard-coded colors keep it faithful to the hardware regardless
// of app theme.
const SignalIndicator: React.FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
    <path
      d="M7.5 8.5a5 5 0 0 0 0 7"
      stroke="#a1a1aa"
      strokeWidth="2"
      strokeLinecap="round"
    />
    <path
      d="M16.5 8.5a5 5 0 0 1 0 7"
      stroke="#a1a1aa"
      strokeWidth="2"
      strokeLinecap="round"
    />
    <circle cx="12" cy="12" r="2.6" fill="#a1a1aa" />
  </svg>
);

// The black Hue Bridge Pro: a rounded square with a large, perfectly centered
// inset "hue" button. Two status indicators (a solid blue dot and a "(•)"
// signal) sit close together in the gap between the top edge and the top of
// the center button. Real-world colors (black plastic, Hue-blue accent) are
// hard-coded rather than themed so the illustration resembles the hardware
// regardless of app theme. The Pro has no blue glow, so its status LED blinks
// while waiting to be paired.
//
// Geometry: the body is size-40 (10rem) and the center button is size-[5.5rem],
// so when centered its top edge sits at (10 − 5.5) / 2 = 2.25rem. The indicators
// are placed at half of that — 1.125rem — i.e. exactly midway between the top
// edge and the top of the center button.
// The bare Pro device (size-40), without the padded display wrapper. Reused at
// full size by the illustration below and scaled down for thumbnails.
export const HueBridgeProBody: React.FC<{ pulse?: boolean }> = ({ pulse }) => (
  <div className="relative size-40 rounded-[2.25rem] bg-zinc-800 shadow-lg ring-1 ring-white/10">
    {/* Large inset center button, perfectly centered in the body. */}
    <div className="absolute inset-0 flex items-center justify-center">
      <div className="flex size-22 items-center justify-center rounded-full bg-zinc-800 shadow-[inset_0_0_6px_rgba(0,0,0,0.7)]">
        <span className="text-xl font-semibold lowercase tracking-tight text-zinc-700">
          hue
        </span>
      </div>
    </div>

    {/* Two indicators, centered horizontally and sitting midway between the
        top edge and the top of the center button. */}
    <div className="absolute inset-x-0 top-4.5 flex -translate-y-1/2 items-center justify-center gap-2">
      <span
        className={cn(
          "size-1 rounded-full bg-sky-400",
          pulse && "animate-pulse",
        )}
      />
      <SignalIndicator className="size-4" />
    </div>
  </div>
);

export const HueBridgeProIllustration: React.FC<{ pulse?: boolean }> = ({
  pulse,
}) => (
  <div className="relative flex size-52 items-center justify-center">
    <HueBridgeProBody pulse={pulse} />

    {pulse && <PressingFinger className="text-zinc-100" halo="#18181b" />}
  </div>
);
