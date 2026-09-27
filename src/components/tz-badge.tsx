import { safeTimeZone, zoneAbbr } from "@/lib/timezone";
import { useViewerTimeZone, zoneDiffers } from "@/hooks/use-viewer-timezone";

/**
 * A small zone label ("CDT") shown next to an event time only when the viewer
 * is somewhere whose clock reads differently -- the "this 6 PM is not your
 * 6 PM" cue. Times are always displayed in the event's own zone; this badge
 * never converts, it only flags. Renders nothing on the server.
 */
export function TzBadge({
  iso,
  timeZone,
  className = "",
}: {
  iso: string | Date;
  timeZone: string | null | undefined;
  className?: string;
}) {
  const viewer = useViewerTimeZone();
  if (!viewer || !timeZone || !zoneDiffers(iso, timeZone, viewer)) return null;
  const abbr = zoneAbbr(iso, timeZone);
  return (
    <span
      data-tz-badge={abbr}
      title={`Shown in the event's timezone (${safeTimeZone(timeZone)}), not yours (${viewer})`}
      className={`ml-1 inline-flex shrink-0 items-center rounded border border-current/30 px-1 text-[10px] font-bold uppercase leading-4 tracking-wide opacity-80 ${className}`}
    >
      {abbr}
    </span>
  );
}
