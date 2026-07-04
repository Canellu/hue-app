import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useCallback } from "react";

export type InspectKind = "light" | "scene" | "group";

export interface InspectSelection {
  kind: InspectKind;
  id: string;
}

const parseInspect = (raw: string | undefined): InspectSelection | null => {
  if (!raw) return null;
  const separator = raw.indexOf(":");
  if (separator < 1) return null;
  const kind = raw.slice(0, separator);
  const id = raw.slice(separator + 1);
  if (!id) return null;
  if (kind === "light" || kind === "scene" || kind === "group") {
    return { kind, id };
  }
  return null;
};

/**
 * Reads and drives the inspector pane through the `?inspect=<kind>:<id>` search
 * param, so the pane participates in browser history and mouse Back/Forward.
 *
 * History discipline (so Back unwinds one meaningful step at a time):
 * - {@link open} pushes a new entry — mouse Back closes the pane.
 * - {@link toggle} swaps content in place while the pane is already open
 *   (replace), so clicking through tiles doesn't stack up history entries.
 * - {@link close} replaces-clears the param, so a closed pane never reopens on
 *   Forward and leaves no dangling entry.
 */
export function useInspector() {
  const navigate = useNavigate();
  const raw = useRouterState({
    select: (state) => (state.location.search as { inspect?: string }).inspect,
  });
  const selection = parseInspect(raw);

  const open = useCallback(
    (kind: InspectKind, id: string) => {
      void navigate({
        to: ".",
        search: (prev) => ({ ...prev, inspect: `${kind}:${id}` }),
      });
    },
    [navigate],
  );

  const close = useCallback(() => {
    void navigate({
      to: ".",
      search: (prev) => ({ ...prev, inspect: undefined }),
      replace: true,
    });
  }, [navigate]);

  const toggle = useCallback(
    (kind: InspectKind, id: string) => {
      if (selection && selection.kind === kind && selection.id === id) {
        close();
      } else if (selection) {
        // Pane already open: swap its content without a new history entry.
        void navigate({
          to: ".",
          search: (prev) => ({ ...prev, inspect: `${kind}:${id}` }),
          replace: true,
        });
      } else {
        open(kind, id);
      }
    },
    [selection, close, open, navigate],
  );

  return { selection, isOpen: selection != null, open, toggle, close };
}
