import { useCallback, useEffect, useState } from "react";

export const VIEW_KEYS = [
  "grid",
  "month",
  "week",
  "day",
  "list",
  "map",
  "agenda",
  "photo",
  "summary",
] as const;
export type ViewPreference = (typeof VIEW_KEYS)[number];

const KEY = "eventhub:view";

/** Persist the user's preferred calendar view across sessions. */
export function useViewPreferences(fallbackView: ViewPreference = "grid") {
  const [view, setViewState] = useState<ViewPreference>(fallbackView);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(KEY);
      if (stored && (VIEW_KEYS as readonly string[]).includes(stored)) {
        setViewState(stored as ViewPreference);
      }
    } catch {
      /* storage unavailable */
    }
    setHydrated(true);
  }, []);

  const setView = useCallback((next: ViewPreference) => {
    setViewState(next);
    try {
      window.localStorage.setItem(KEY, next);
    } catch {
      /* storage unavailable */
    }
  }, []);

  const toggle = useCallback(
    (a: ViewPreference, b: ViewPreference) => setView(view === a ? b : a),
    [view, setView],
  );

  return { view, setView, toggle, hydrated };
}