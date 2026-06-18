import { ScrollArea as ScrollAreaPrimitive } from "@base-ui/react/scroll-area";

import { cn } from "@/lib/utils";

function ScrollArea({
  className,
  viewportClassName,
  children,
  fade = false,
  orientation = "vertical",
  hideScrollbar = false,
  viewportRef,
  ...props
}: ScrollAreaPrimitive.Root.Props & {
  /** Classes applied to the scrollable viewport (where the overflow lives). */
  viewportClassName?: string;
  /** Ref to the scrollable viewport element (e.g. to reset scroll position). */
  viewportRef?: React.Ref<HTMLDivElement>;
  /**
   * Fade the content out at the scrollable edges with a gradient mask.
   * `true` fades both edges; `"top"`/`"bottom"` fades only that edge.
   */
  fade?: boolean | "top" | "bottom";
  /** Which scrollbars to render. */
  orientation?: "vertical" | "horizontal" | "both";
  /** Hide the scrollbar(s) while keeping the content scrollable. */
  hideScrollbar?: boolean;
}) {
  const fadeTop = fade === true || fade === "top";
  const fadeBottom = fade === true || fade === "bottom";
  return (
    <ScrollAreaPrimitive.Root
      data-slot="scroll-area"
      className={cn("group/scroll-area relative", className)}
      {...props}
    >
      <ScrollAreaPrimitive.Viewport
        ref={viewportRef}
        data-slot="scroll-area-viewport"
        className={cn(
          "size-full overscroll-contain rounded-[inherit] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
          // Only fades an edge once there's content to scroll toward, driven by
          // the Root's data-overflow-y-{start,end} attributes.
          (fadeTop || fadeBottom) &&
            "[--sa-fade:0px] [mask-image:linear-gradient(to_bottom,transparent,black_var(--sa-fade-top,var(--sa-fade)),black_calc(100%_-_var(--sa-fade-bottom,var(--sa-fade))),transparent)]",
          fadeTop &&
            "group-data-[overflow-y-start]/scroll-area:[--sa-fade-top:2rem]",
          fadeBottom &&
            "group-data-[overflow-y-end]/scroll-area:[--sa-fade-bottom:2rem]",
          viewportClassName,
        )}
      >
        {children}
      </ScrollAreaPrimitive.Viewport>
      {!hideScrollbar &&
        (orientation === "vertical" || orientation === "both") && (
          <ScrollAreaScrollbar orientation="vertical" />
        )}
      {!hideScrollbar &&
        (orientation === "horizontal" || orientation === "both") && (
          <ScrollAreaScrollbar orientation="horizontal" />
        )}
      <ScrollAreaPrimitive.Corner />
    </ScrollAreaPrimitive.Root>
  );
}

function ScrollAreaScrollbar({
  className,
  orientation = "vertical",
  ...props
}: ScrollAreaPrimitive.Scrollbar.Props) {
  return (
    <ScrollAreaPrimitive.Scrollbar
      data-slot="scroll-area-scrollbar"
      orientation={orientation}
      className={cn(
        "z-10 flex touch-none select-none p-0.5 opacity-0 transition-opacity delay-300 data-hovering:opacity-100 data-hovering:delay-0 data-scrolling:opacity-100 data-scrolling:delay-0",
        orientation === "vertical" && "h-full w-2.5",
        orientation === "horizontal" && "w-full flex-col-reverse h-2.5",
        className,
      )}
      {...props}
    >
      <ScrollAreaPrimitive.Thumb
        data-slot="scroll-area-thumb"
        className="relative flex-1 rounded-full bg-border before:absolute before:inset-[-2px] before:content-['']"
      />
    </ScrollAreaPrimitive.Scrollbar>
  );
}

export { ScrollArea, ScrollAreaScrollbar };
