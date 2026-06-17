import { useEffect, useRef } from "react";

interface GlobalKeyboardShortcutOptions {
  key: string;
  mod?: boolean;
  shift?: boolean;
  alt?: boolean;
  preventDefault?: boolean;
  enabled?: boolean;
}

const isTextInput = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) return false;

  const tagName = target.tagName.toLowerCase();
  return (
    target.isContentEditable ||
    tagName === "input" ||
    tagName === "textarea" ||
    tagName === "select"
  );
};

export const useGlobalKeyboardShortcut = (
  options: GlobalKeyboardShortcutOptions,
  callback: (event: KeyboardEvent) => void,
) => {
  const callbackRef = useRef(callback);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    if (options.enabled === false) return;

    const onKeyDown = (event: KeyboardEvent) => {
      const keyMatches =
        event.key.toLowerCase() === options.key.toLowerCase();
      const modMatches =
        options.mod === undefined ||
        (event.metaKey || event.ctrlKey) === options.mod;
      const shiftMatches =
        options.shift === undefined || event.shiftKey === options.shift;
      const altMatches =
        options.alt === undefined || event.altKey === options.alt;

      if (!keyMatches || !modMatches || !shiftMatches || !altMatches) return;
      if (isTextInput(event.target)) return;

      if (options.preventDefault !== false) {
        event.preventDefault();
      }
      callbackRef.current(event);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    options.alt,
    options.enabled,
    options.key,
    options.mod,
    options.preventDefault,
    options.shift,
  ]);
};
