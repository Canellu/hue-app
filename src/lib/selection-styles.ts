import { cva } from "class-variance-authority";

/**
 * Shared state treatment for persistent selection. Consumers set
 * `data-selected` when selected so semantics remain with the owning control.
 */
export const selectableVariants = cva("transition-colors", {
  variants: {
    treatment: {
      outlined:
        "border border-border/70 hover:bg-interactive-hover data-[selected]:border-2 data-[selected]:border-selection-border data-[selected]:bg-selection-surface data-[selected]:hover:bg-selection-surface",
      row: "hover:bg-interactive-hover data-[selected]:bg-selection-surface",
      navigation:
        "hover:bg-interactive-hover aria-[current=page]:bg-selection-surface",
    },
  },
  defaultVariants: {
    treatment: "outlined",
  },
});

/**
 * Selection that must sit over a variable or live-color surface. Backed by the
 * unlayered `.overlay-selected` rule in `App.css` (not Tailwind `ring-*`
 * utilities) so it reliably replaces a lit tile's base card ring instead of
 * fighting it — see the note there.
 */
export const overlaySelectionClassName = "overlay-selected";
