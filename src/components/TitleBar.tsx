import { getCurrentWindow } from "@tauri-apps/api/window";
import { Minus, X } from "lucide-react";
import React from "react";

export const TitleBar: React.FC = () => {
  const handleMinimize = async () => {
    try {
      await getCurrentWindow().minimize();
    } catch {
      // Running in a plain browser during Vite previews.
    }
  };

  const handleClose = async () => {
    try {
      await getCurrentWindow().close();
    } catch {
      // Running in a plain browser during Vite previews.
    }
  };

  const handleMouseDown = async (e: React.MouseEvent) => {
    if (!(e.target as HTMLElement).closest("button")) {
      try {
        await getCurrentWindow().startDragging();
      } catch {
        // Running in a plain browser during Vite previews.
      }
    }
  };

  return (
    <div
      data-tauri-drag-region
      onMouseDown={handleMouseDown}
      className="fixed top-0 right-0 left-0 z-50 flex h-10 items-stretch justify-between  bg-background/80 pl-4 backdrop-blur supports-backdrop-filter:bg-background/60"
    >
      <div className="flex items-center text-sm font-medium text-muted-foreground">
        Hue Controller
      </div>
      <div className="flex items-stretch">
        <button
          type="button"
          aria-label="Minimize window"
          onClick={async (e) => {
            e.stopPropagation();
            await handleMinimize();
          }}
          className="flex aspect-square h-full items-center justify-center text-muted-foreground transition-colors hover:bg-muted hover:text-muted-foreground"
        >
          <Minus size={16} strokeWidth={2.2} />
        </button>
        <button
          type="button"
          aria-label="Close window"
          onClick={async (e) => {
            e.stopPropagation();
            await handleClose();
          }}
          className="flex aspect-square h-full items-center justify-center text-muted-foreground transition-colors hover:bg-muted hover:text-muted-foreground "
        >
          <X size={16} strokeWidth={2.2} />
        </button>
      </div>
    </div>
  );
};
