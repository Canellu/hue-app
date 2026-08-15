import { useCallback, useEffect, useState } from "react";

export type FeedbackButtonMode = "full" | "icon" | "hidden";

export interface FeedbackPreferences {
  buttonMode: FeedbackButtonMode;
}

const STORAGE_KEY = "feedbackPreferences";
const CHANGE_EVENT = "feedback-preferences-change";

const defaults: FeedbackPreferences = {
  buttonMode: "full",
};

const readFeedbackPreferences = (): FeedbackPreferences => {
  try {
    const saved = JSON.parse(
      localStorage.getItem(STORAGE_KEY) ?? "null",
    ) as Partial<FeedbackPreferences> | null;
    const buttonMode =
      saved?.buttonMode === "icon" || saved?.buttonMode === "hidden"
        ? saved.buttonMode
        : "full";

    return { buttonMode };
  } catch {
    return defaults;
  }
};

export const useFeedbackPreferences = () => {
  const [preferences, setPreferences] = useState(readFeedbackPreferences);

  useEffect(() => {
    const syncPreferences = () => setPreferences(readFeedbackPreferences());
    window.addEventListener(CHANGE_EVENT, syncPreferences);
    window.addEventListener("storage", syncPreferences);
    return () => {
      window.removeEventListener(CHANGE_EVENT, syncPreferences);
      window.removeEventListener("storage", syncPreferences);
    };
  }, []);

  const updatePreferences = useCallback(
    (patch: Partial<FeedbackPreferences>) => {
      const next = { ...readFeedbackPreferences(), ...patch };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      window.dispatchEvent(new Event(CHANGE_EVENT));
    },
    [],
  );

  return [preferences, updatePreferences] as const;
};
