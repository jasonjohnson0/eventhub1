export const EVENT_COLORS = [
  { name: "fuchsia", hex: "#ec4899" },
  { name: "cyan", hex: "#06b6d4" },
  { name: "lime", hex: "#84cc16" },
  { name: "orange", hex: "#f97316" },
  { name: "violet", hex: "#a855f7" },
  { name: "blue", hex: "#3b82f6" },
] as const;

export function colorForEvent(eventId: string): { name: string; hex: string } {
  let hash = 0;
  for (let i = 0; i < eventId.length; i++) hash = (hash * 31 + eventId.charCodeAt(i)) >>> 0;
  return EVENT_COLORS[hash % EVENT_COLORS.length];
}