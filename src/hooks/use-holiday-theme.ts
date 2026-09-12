import { useCallback, useSyncExternalStore } from "react";
import { HOLIDAY_THEMES, type ChristmasVariantChoice, type HolidayId } from "@/lib/holiday-themes";

const STORAGE_KEY = "eh:holiday-theme";
const VARIANT_KEY = "eh:christmas-variant";
const CHANGE_EVENT = "eh:holiday-theme-change";

function isHolidayId(v: string | null): v is HolidayId {
  return !!v && v in HOLIDAY_THEMES;
}

function isChristmasVariantChoice(v: string | null): v is ChristmasVariantChoice {
  return v === "emerald" || v === "ruby" || v === "alternate";
}

function readStored(): HolidayId | null {
  const v = window.localStorage.getItem(STORAGE_KEY);
  return isHolidayId(v) ? v : null;
}

function readStoredVariant(): ChristmasVariantChoice | null {
  const v = window.localStorage.getItem(VARIANT_KEY);
  return isChristmasVariantChoice(v) ? v : null;
}

/** Sets both the holiday and, for Christmas, which variant -- one write, one
 *  re-render, rather than two separate hook calls racing each other. */
export function selectChristmasVariant(choice: ChristmasVariantChoice) {
  window.localStorage.setItem(STORAGE_KEY, "christmas");
  window.localStorage.setItem(VARIANT_KEY, choice);
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

const getServerSnapshot = () => null;

/**
 * Every visitor's own holiday theme for the public discovery page -- picked
 * whenever they like, saved on their device, and never shared with anyone
 * else. Backed by localStorage plus a same-tab custom event (so every
 * component using this hook re-renders together) and the native `storage`
 * event (so other tabs pick it up too). There is no server round trip and no
 * account requirement, on purpose: this is a decoration, not a setting worth
 * a database column.
 */
export function useHolidayTheme() {
  const theme = useSyncExternalStore(subscribe, readStored, getServerSnapshot);

  const setTheme = useCallback((next: HolidayId | null) => {
    if (next) window.localStorage.setItem(STORAGE_KEY, next);
    else window.localStorage.removeItem(STORAGE_KEY);
    if (next !== "christmas") window.localStorage.removeItem(VARIANT_KEY);
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, []);

  return [theme, setTheme] as const;
}

/** Which Christmas look is stored -- a fixed variant, or "alternate" to let
 *  ChristmasHero pick differently from one visit to the next. Only
 *  meaningful when useHolidayTheme() returns "christmas". */
export function useChristmasVariant() {
  const variant = useSyncExternalStore(subscribe, readStoredVariant, getServerSnapshot);
  return variant;
}
