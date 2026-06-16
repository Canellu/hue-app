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
      className="glass-titlebar fixed top-0 left-0 right-0 z-50 flex h-10 items-stretch justify-between pl-4 pr-0"
    >
      <div className="text-secondary flex items-center text-sm font-medium">
        Hue Controller
      </div>
      <div className="flex h-full items-stretch">
        <button
          type="button"
          aria-label="Minimize window"
          onClick={async (e) => {
            e.stopPropagation();
            await handleMinimize();
          }}
          className="window-control flex h-full aspect-square items-center justify-center"
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
          className="window-control flex h-full aspect-square items-center justify-center "
        >
          <X size={16} strokeWidth={2.2} />
        </button>
      </div>
    </div>
  );
};
