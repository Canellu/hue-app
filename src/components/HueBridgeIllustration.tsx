import { cn } from "@/lib/utils";
import { Globe, Network, Power } from "lucide-react";
import React from "react";

const statusIcons = [Power, Network, Globe];

// The classic white Hue Bridge (v2): a white rounded square with a large,
// perfectly centered round button carrying the Philips wordmark, and a row of
// three gray status icons — each with a blue LED directly beneath it — sitting
// in the gap between the top edge and the top of the center button. Real-world
// colors (white plastic, a Hue-blue accent ring) are hard-coded rather than
// themed so the illustration resembles the hardware regardless of app theme.
// The blue ring is part of the device and brightens while waiting to be paired.
//
// Geometry: the body is size-40 (10rem) and the center button is ~40% of that
// width (4rem). The icon row is the same width, so the icons line up over the
// button. When the button is centered its top edge sits at (10 − 4) / 2 = 3rem,
// so the icon/dot cluster is centered at half of that — 1.5rem — i.e. exactly
// midway between the top edge and the button.
// The bare white device (size-40), without the padded display wrapper / glow.
// Reused at full size by the illustration below and scaled down for thumbnails.
export const HueBridgeBody: React.FC<{ pulse?: boolean }> = ({ pulse }) => (
  <div className="relative size-40 rounded-[2rem] bg-white shadow-lg ring-1 ring-black/10">
    {/* Large center button (~40% of the body width), perfectly centered. */}
    <div className="absolute inset-0 flex items-center justify-center">
      <div
        className={cn(
          "flex size-16 items-center justify-center rounded-full bg-white ring-2 ring-sky-400/60",
          pulse &&
            "ring-[3px] ring-sky-400/90 shadow-[0_0_24px_rgba(56,189,248,0.6)]",
        )}
      >
        <span className="text-[7px] font-semibold tracking-wider text-zinc-400">
          PHILIPS
        </span>
      </div>
    </div>

    {/* Three status icons, each with a blue LED stacked directly beneath it so
        the two line up. The row matches the button width and the whole cluster
        sits midway between the top edge and the top of the center button. */}
    <div className="absolute inset-x-0 top-6 flex -translate-y-1/2 justify-center">
      <div className="flex w-16 justify-between text-zinc-400">
        {statusIcons.map((Icon, index) => (
          <div key={index} className="flex flex-col items-center gap-1">
            <Icon className="size-2.5" strokeWidth={2.25} />
            <span className="size-1 rounded-full bg-sky-400/80" />
          </div>
        ))}
      </div>
    </div>
  </div>
);

// A line-art "tap" hand: extended index finger over three folded fingers and a
// thumb curling out at the bottom-left. Drawn as an outline (no fill) the way a
// click/tap glyph is. The main stroke follows `currentColor`; a contrasting
// `halo` is drawn behind it so the hand stays visible where it overhangs the
// page background (which can match the hand's own color), not just the bridge.
const handPaths = [
  "M8 13v-8.5a1.5 1.5 0 0 1 3 0v7.5",
  "M11 11.5v-2a1.5 1.5 0 0 1 3 0v2.5",
  "M14 10.5a1.5 1.5 0 0 1 3 0v1.5",
  "M17 11.5a1.5 1.5 0 0 1 3 0v4.5a6 6 0 0 1 -6 6h-2h.208a6 6 0 0 1 -5.012 -2.7a69.74 69.74 0 0 1 -.196 -.3c-.312 -.479 -1.407 -2.388 -3.286 -5.728a1.5 1.5 0 0 1 .536 -2.022a1.867 1.867 0 0 1 2.28 .28l1.762 1.74",
];

const PointingHand: React.FC<{
  className?: string;
  style?: React.CSSProperties;
  halo: string;
}> = ({ className, style, halo }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    style={style}
    aria-hidden
  >
    {/* contrasting halo behind the hand */}
    <g stroke={halo} strokeWidth={3.4}>
      {handPaths.map((d) => (
        <path key={d} d={d} />
      ))}
    </g>
    {/* main outline */}
    <g stroke="currentColor" strokeWidth={1.4}>
      {handPaths.map((d) => (
        <path key={d} d={d} />
      ))}
    </g>
  </svg>
);

// Overlay for the pairing state: a finger repeatedly pressing the center button,
// with a ripple radiating from the button at the moment of contact. Sized to be
// dropped inside the size-52 illustration wrapper, centered on the body. The
// hand color is set by the caller via `className` so it contrasts with the
// specific bridge plastic (dark on the white bridge, light on the black Pro),
// with `halo` set to the opposite tone so it also reads over the page.
export const PressingFinger: React.FC<{ className?: string; halo: string }> = ({
  className,
  halo,
}) => (
  <div className="pointer-events-none absolute inset-0">
    {/* tap ripple, centered on the button */}
    <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
      <span
        className="tap-ripple block size-16 rounded-full bg-sky-400/40"
        style={{ animation: "tap-ripple 3.8s ease-out 1s infinite both" }}
      />
    </span>

    {/* finger, offset so the index fingertip lands on the center button and the
        wrist trails off to the lower-right */}
    <div
      className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
      style={{ marginLeft: "2rem", marginTop: "2.6rem" }}
    >
      <PointingHand
        halo={halo}
        className={cn("finger-tap size-28", className)}
        style={{
          animation: "finger-tap 3.8s ease-in-out 1s infinite both",
          transformOrigin: "bottom center",
        }}
      />
    </div>
  </div>
);

export const HueBridgeIllustration: React.FC<{ pulse?: boolean }> = ({
  pulse,
}) => (
  <div className="relative flex size-52 items-center justify-center">
    <HueBridgeBody pulse={pulse} />

    {pulse && <PressingFinger className="text-zinc-800" halo="#ffffff" />}
  </div>
);
