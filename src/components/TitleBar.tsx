import { getCurrentWindow } from "@tauri-apps/api/window";
import { ArrowLeft, Minus, X } from "lucide-react";
import React from "react";
import logo from "../assets/logo.svg";

interface TitleBarProps {
  /** Dev-only: when set, shows a "back to wizard" control in the title bar. */
  onDevBack?: () => void;
}

export const TitleBar: React.FC<TitleBarProps> = ({ onDevBack }) => {
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
      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        {onDevBack && (
          <button
            type="button"
            aria-label="Back to setup wizard"
            onClick={(e) => {
              e.stopPropagation();
              onDevBack();
            }}
            className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <ArrowLeft size={14} strokeWidth={2.2} />
            Wizard
          </button>
        )}
        <img src={logo} alt="Hue Desktop logo" className="h-5 w-5" />
        Hue Desktop
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
