/** Pure pricing and ad-key helpers for sponsor campaigns. Browser- and
 *  server-safe; the server re-runs the same math so the client never sets a
 *  price. */

export type SponsorScope = "event" | "calendars" | "network" | "geo";

export type PricingRow = {
  scope: SponsorScope;
  unit_cents: number;
  period: "week" | "month";
  unit: "flat" | "per_calendar";
};

/** Inclusive day count between two YYYY-MM-DD dates. */
export function daysInclusive(startsOn: string, endsOn: string): number {
  const a = Date.parse(`${startsOn}T00:00:00Z`);
  const b = Date.parse(`${endsOn}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return 0;
  return Math.round((b - a) / 86_400_000) + 1;
}

/** Periods billed: any part of a week/month counts as a whole one. Months are
 *  30-day blocks so the price never depends on which month it is. */
export function periodsFor(days: number, period: "week" | "month"): number {
  if (days <= 0) return 0;
  return Math.ceil(days / (period === "week" ? 7 : 30));
}

export function quotePrice(
  row: PricingRow,
  startsOn: string,
  endsOn: string,
  calendarsReached: number,
): { cents: number; periods: number; units: number } {
  const periods = periodsFor(daysInclusive(startsOn, endsOn), row.period);
  const units = row.unit === "flat" ? 1 : Math.max(1, calendarsReached);
  return { cents: row.unit_cents * units * periods, periods, units };
}

export function formatCents(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

/** Ad keys used in /api/ad/i|c/<key>: "c_<uuid>" is a campaign, "s_<uuid>" or
 *  a bare uuid is a legacy slot. Anything else is rejected. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function parseAdKey(key: string): { kind: "slot" | "campaign"; id: string } | null {
  if (UUID.test(key)) return { kind: "slot", id: key };
  const m = /^([sc])_(.+)$/.exec(key);
  if (!m || !UUID.test(m[2]!)) return null;
  return { kind: m[1] === "c" ? "campaign" : "slot", id: m[2]! };
}

export function parseZipList(text: string): string[] {
  return Array.from(new Set(text.split(/[\s,;]+/).map((z) => z.trim()).filter(Boolean)));
}
export const isZip = (z: string) => /^[0-9]{5}$/.test(z);

export const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  pending_payment: "Awaiting payment",
  pending_review: "Paid — awaiting review",
  active: "Live",
  paused: "Paused",
  ended: "Ended",
  refunded: "Refunded",
  rejected: "Declined (refunded)",
};
