import { useEffect, useRef, useState } from "react";

/**
 * Detects whether a container-query label has collapsed to `display: none`,
 * i.e. the control has dropped to its icon-only layout below the breakpoint.
 *
 * Attach `containerRef` to an element that resizes with the `@container`, and
 * `labelRef` to a representative label styled with the matching query (e.g.
 * `hidden @5xl:inline`). Returns `true` while that label is hidden — the cue to
 * switch on tooltips, which only earn their keep once the visible label is gone.
 */
export const useIconOnly = <
  TContainer extends HTMLElement = HTMLElement,
  TLabel extends HTMLElement = HTMLElement,
>() => {
  const containerRef = useRef<TContainer>(null);
  const labelRef = useRef<TLabel>(null);
  const [iconOnly, setIconOnly] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const update = () => {
      const label = labelRef.current;
      if (label) setIconOnly(getComputedStyle(label).display === "none");
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  return { containerRef, labelRef, iconOnly };
};
