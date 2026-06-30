import React, { useId } from "react";

// The Hue Play HDMI Sync Box: a low, wide glossy-black box with softly rounded
// corners, drawn as an SVG in a shallow 3/4 perspective so it reads as a real
// 3D object. The geometry (top lid, front face, and the two short side faces)
// comes from a traced outline of the hardware; the gradients are tuned here to
// mimic glossy black plastic lit from above. Real-world colors are hard-coded
// rather than themed so the illustration resembles the hardware regardless of
// app theme. The status LED blinks while the box is busy (pairing / searching
// for a sync source).
//
// The bare Sync Box device, without any padded display wrapper. Reused at full
// size by the illustration below and scaled down for thumbnails. While `pulse`
// is set (pairing / searching) the status LED blinks green to match the
// hardware's pairing indicator.
export const HueSyncBoxBody: React.FC<{ pulse?: boolean; width?: number }> = ({
  pulse,
  width = 320,
}) => {
  // Namespace the gradient/filter ids so multiple instances never collide.
  const raw = useId().replace(/:/g, "");
  const id = (name: string) => `${raw}-${name}`;

  return (
    <svg
      viewBox="0 0 847 268"
      width={width}
      height={Math.round((width * 268) / 847)}
      style={{ filter: "drop-shadow(0 7px 9px rgba(0,0,0,0.6))" }}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        {/* Lid: lit along the far/top edge, falling into shadow toward the
            near (front) edge. */}
        <linearGradient
          id={id("top")}
          x1="423"
          y1="0"
          x2="423"
          y2="166"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#3c3c40" />
          <stop offset="0.5" stopColor="#2a2a2d" />
          <stop offset="1" stopColor="#202023" />
        </linearGradient>

        {/* Soft specular sheen pooling toward the top-center of the lid. */}
        <radialGradient
          id={id("sheen")}
          cx="0"
          cy="0"
          r="1"
          gradientUnits="userSpaceOnUse"
          gradientTransform="translate(423 36) scale(430 150)"
        >
          <stop stopColor="white" stopOpacity="0.1" />
          <stop offset="0.7" stopColor="white" stopOpacity="0" />
        </radialGradient>

        {/* Front face: a near-matte plane that reads as the same body as the
            lid. Only a very gentle mid-band lift keeps it from looking flat,
            but it stays close to the lid's near-edge tone so the face blends
            into the body rather than standing out. */}
        <linearGradient
          id={id("front")}
          x1="53"
          y1="215"
          x2="789"
          y2="215"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#181819" />
          <stop offset="0.5" stopColor="#212123" />
          <stop offset="1" stopColor="#181819" />
        </linearGradient>

        {/* Side faces: turned slightly away from the light, but kept close to
            the front face's corner tone so the two planes read as one
            continuous body where they meet at the rounded corners. */}
        <linearGradient
          id={id("side")}
          x1="423"
          y1="166"
          x2="423"
          y2="265"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#181819" />
          <stop offset="1" stopColor="#141416" />
        </linearGradient>

        {/* Power-button rim: lit white along the top edge and falling to a dark
            shadow along the bottom, so the oval reads as recessed into the
            face. */}
        <linearGradient
          id={id("button")}
          x1="714"
          y1="200"
          x2="714"
          y2="238"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="white" stopOpacity="0.22" />
          <stop offset="0.5" stopColor="white" stopOpacity="0.04" />
          <stop offset="1" stopColor="black" stopOpacity="0.4" />
        </linearGradient>
      </defs>

      {/* Solid body backing: the same four faces filled flat in one dark tone,
          drawn first and given a hairline stroke of that same tone so the whole
          silhouette is gap-free. The gradient faces draw on top; without this,
          the anti-aliased seams where two faces abut let the window background
          bleed through as thin lines (obvious on a colored backdrop). Now any
          sub-pixel seam reveals this body color instead. */}
      <g fill="#1a1a1c" stroke="#1a1a1c" strokeWidth="2" strokeLinejoin="round">
        <path d="M71.5241 29.7778C60.5236 43.7778 0.523602 122.278 1.52363 134.278L1.52363 135.617C1.98773 142.794 9.79505 157.568 44.3881 164.68C47.2469 165.268 50.2887 165.803 53.5243 166.278C53.5243 166.278 783.025 168.611 788.525 165.278C788.525 165.278 793.43 165.278 800.353 164.414C816.344 162.418 843.101 155.812 845.025 133.944V128.778C842.525 117.778 774.524 28.7778 774.524 28.7778C755.024 3.278 701.024 3.27779 701.024 3.27779C701.024 3.27779 185.524 -0.722237 141.524 3.27779C97.5241 7.27781 83.0242 18.2781 71.5241 29.7778Z" />
        <path d="M788.525 165.278C783.025 168.611 53.5243 166.278 53.5243 166.278V265.278C53.5243 265.278 783.025 267.611 788.525 264.278V165.278Z" />
        <path d="M1.52363 233.278C1.02363 240.278 8.5051 258.676 53.5243 265.278V166.278C50.2887 165.803 47.2469 165.268 44.3881 164.68C9.79505 157.568 1.98773 142.794 1.52363 135.617L1.52363 232.628L1.52363 233.278Z" />
        <path d="M788.525 264.278C788.525 264.278 848.025 264.278 845.025 227.778V133.944C843.101 155.812 816.344 162.418 800.353 164.414C793.43 165.278 788.525 165.278 788.525 165.278V264.278Z" />
      </g>

      {/* Left + right side faces (drawn first, behind the front face). */}
      <path
        d="M1.52363 233.278C1.02363 240.278 8.5051 258.676 53.5243 265.278V166.278C50.2887 165.803 47.2469 165.268 44.3881 164.68C9.79505 157.568 1.98773 142.794 1.52363 135.617L1.52363 232.628L1.52363 233.278Z"
        fill={`url(#${id("side")})`}
      />
      <path
        d="M788.525 264.278C788.525 264.278 848.025 264.278 845.025 227.778V133.944C843.101 155.812 816.344 162.418 800.353 164.414C793.43 165.278 788.525 165.278 788.525 165.278V264.278Z"
        fill={`url(#${id("side")})`}
      />

      {/* Front face + glossy reflection. */}
      <path
        d="M788.525 165.278C783.025 168.611 53.5243 166.278 53.5243 166.278V265.278C53.5243 265.278 783.025 267.611 788.525 264.278V165.278Z"
        fill={`url(#${id("front")})`}
      />

      {/* Top lid + sheen overlay. */}
      <path
        d="M71.5241 29.7778C60.5236 43.7778 0.523602 122.278 1.52363 134.278L1.52363 135.617C1.98773 142.794 9.79505 157.568 44.3881 164.68C47.2469 165.268 50.2887 165.803 53.5243 166.278C53.5243 166.278 783.025 168.611 788.525 165.278C788.525 165.278 793.43 165.278 800.353 164.414C816.344 162.418 843.101 155.812 845.025 133.944V128.778C842.525 117.778 774.524 28.7778 774.524 28.7778C755.024 3.278 701.024 3.27779 701.024 3.27779C701.024 3.27779 185.524 -0.722237 141.524 3.27779C97.5241 7.27781 83.0242 18.2781 71.5241 29.7778Z"
        fill={`url(#${id("top")})`}
      />
      <path
        d="M71.5241 29.7778C60.5236 43.7778 0.523602 122.278 1.52363 134.278L1.52363 135.617C1.98773 142.794 9.79505 157.568 44.3881 164.68C47.2469 165.268 50.2887 165.803 53.5243 166.278C53.5243 166.278 783.025 168.611 788.525 165.278C788.525 165.278 793.43 165.278 800.353 164.414C816.344 162.418 843.101 155.812 845.025 133.944V128.778C842.525 117.778 774.524 28.7778 774.524 28.7778C755.024 3.278 701.024 3.27779 701.024 3.27779C701.024 3.27779 185.524 -0.722237 141.524 3.27779C97.5241 7.27781 83.0242 18.2781 71.5241 29.7778Z"
        fill={`url(#${id("sheen")})`}
      />

      {/* Debossed "hue" wordmark, foreshortened onto the lid surface. Nudged
          up and slightly right to sit at the optical center of the
          perspective-narrowed top, and sized down to match the hardware. */}
      <g transform="translate(431 80) scale(0.9 0.5)">
        <text
          x="0"
          y="3"
          textAnchor="middle"
          dominantBaseline="central"
          fontSize="78"
          className="font-heading lowercase"
          fontWeight="600"
          fill="white"
          fillOpacity="0.08"
        >
          hue
        </text>
        <text
          x="0"
          y="0"
          textAnchor="middle"
          dominantBaseline="central"
          fontSize="78"
          className="font-heading lowercase"
          fontWeight="500"
          fill="#0c0c0d"
          fillOpacity="0.55"
        >
          hue
        </text>
      </g>

      {/* Faint highlight tracing the whole top fold — left side, front, then
          right side — as one continuous line so every face shares the same
          lit edge instead of the front edge alone catching the light. */}
      <path
        d="M1.52363 135.617C1.98773 142.794 9.79505 157.568 44.3881 164.68C47.2469 165.268 50.2887 165.803 53.5243 166.278C53.5243 166.278 783.025 168.611 788.525 165.278C788.525 165.278 793.43 165.278 800.353 164.414C816.344 162.418 843.101 155.812 845.025 133.944"
        stroke="white"
        strokeOpacity="0.06"
        strokeWidth="2"
        fill="none"
      />

      {/* Status LED: a small white dot, matching the hardware (bright white
          core). While pairing it blinks green like the real Sync Box LED. */}
      <circle
        cx="620"
        cy="220"
        r="2.5"
        fill={pulse ? "#4ade80" : "white"}
        fillOpacity="0.85"
        className={pulse ? "animate-pulse" : undefined}
        style={
          pulse
            ? { filter: "drop-shadow(0 0 6px rgba(74,222,128,0.9))" }
            : undefined
        }
      />

      {/* Oval power button, inset into the front face. */}
      <rect
        x="680"
        y="200"
        width="68"
        height="38"
        rx="21"
        fill="#0a0a0b"
        stroke={`url(#${id("button")})`}
        strokeWidth="1.5"
      />
    </svg>
  );
};

export const HueSyncBoxIllustration: React.FC<{ pulse?: boolean }> = ({
  pulse,
}) => (
  <div className="relative flex items-center justify-center py-6">
    <HueSyncBoxBody pulse={pulse} width={480} />
  </div>
);

// The Sync Box scaled down to sit inside a selection card, mirroring
// BridgeThumb. Rendered at a smaller intrinsic size (rather than CSS-scaled) so
// its layout box matches the device and the drop-shadow has room to breathe
// instead of being clipped.
export const SyncBoxThumb: React.FC = () => (
  <div className="flex items-center justify-center py-6">
    <HueSyncBoxBody width={240} />
  </div>
);
