import { useSyncExternalStore } from "react";
import { safeTimeZone, tzOffsetMs, viewerTimeZone } from "@/lib/timezone";

/**
 * The viewer's browser zone, or null until after hydration.
 *
 * The server can't know where the viewer is (and on Vercel it runs in UTC),
 * so anything that depends on the viewer's zone must render nothing on the
 * server and on the hydration pass, then appear on the client's next render.
 * useSyncExternalStore does exactly that with a null server snapshot, and --
 * unlike a per-component useState+useEffect -- costs no extra effect per
 * badge, which matters on a timeline with hundreds of bars.
 */
const noopSubscribe = () => () => {};
export function useViewerTimeZone(): string | null {
  return useSyncExternalStore(noopSubscribe, viewerTimeZone, () => null);
}

/** True when the viewer's wall clock and the event's disagree at that instant.
 *  Compares UTC offsets, not zone names: America/Winnipeg viewing an
 *  America/Chicago event shows the same clock time, so it isn't ambiguous and
 *  gets no badge. Compared at the event's own instant, so a Chicago event
 *  viewed from Phoenix correctly differs in summer and matches in winter. */
export function zoneDiffers(iso: string | Date, eventZone: string, viewerZone: string): boolean {
  const at = new Date(iso);
  return tzOffsetMs(at, safeTimeZone(eventZone)) !== tzOffsetMs(at, safeTimeZone(viewerZone));
}
