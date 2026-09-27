import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ALL_TIMEZONES, COMMON_TIMEZONES, safeTimeZone, tzOffsetMs, zoneAbbr } from "@/lib/timezone";
import { cn } from "@/lib/utils";

function offsetLabel(zone: string, at: Date): string {
  const mins = Math.round(tzOffsetMs(at, zone) / 60_000);
  const sign = mins < 0 ? "−" : "+";
  const h = Math.floor(Math.abs(mins) / 60);
  const m = Math.abs(mins) % 60;
  return `UTC${sign}${h}${m ? `:${String(m).padStart(2, "0")}` : ""}`;
}

/**
 * Searchable IANA timezone picker for event and series forms.
 *
 * Replaces a <Select> that offered only seven US-centric zones: an event in
 * London or Tokyo couldn't be entered at all, and editing an event whose zone
 * wasn't one of the seven showed a blank trigger. Every zone the runtime knows
 * is searchable here, by IANA name or by abbreviation ("CDT", "GMT+5:30"),
 * with the seven common ones listed first. Each option shows its abbreviation
 * and offset *at the event's own start time* (`at`), so a summer event shows
 * CDT/UTC−5 even when it's picked in December.
 */
export function TimezonePicker({
  value,
  onChange,
  at,
  id,
}: {
  value: string;
  onChange: (zone: string) => void;
  /** The moment whose offset/abbreviation to show -- the event's start. */
  at?: Date;
  id?: string;
}) {
  const [open, setOpen] = useState(false);
  const momentMs = at && !Number.isNaN(at.getTime()) ? at.getTime() : Date.now();
  const moment = new Date(momentMs);
  const current = safeTimeZone(value);

  // Label every zone once per open/moment; ~420 zones, cheap with the
  // per-zone formatter cache in lib/timezone.
  const options = useMemo(() => {
    if (!open) return [];
    const m = new Date(momentMs);
    return ALL_TIMEZONES.map((zone) => ({
      zone,
      label: zone.replace(/_/g, " "),
      hint: `${zoneAbbr(m, zone)} · ${offsetLabel(zone, m)}`,
      common: (COMMON_TIMEZONES as readonly string[]).includes(zone),
    }));
  }, [open, momentMs]);

  const renderItem = (o: (typeof options)[number]) => (
    <CommandItem
      key={o.zone}
      // cmdk filters on `value` + keywords; include the abbreviation/offset
      // so "CDT" or "+5:30" finds the zone too.
      value={o.zone}
      keywords={[o.label, o.hint]}
      onSelect={() => {
        onChange(o.zone);
        setOpen(false);
      }}
    >
      <Check className={cn("mr-2 h-4 w-4", o.zone === current ? "opacity-100" : "opacity-0")} />
      <span className="truncate">{o.label}</span>
      <span className="ml-auto pl-2 text-xs text-muted-foreground">{o.hint}</span>
    </CommandItem>
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          data-timezone-picker={current}
          className="w-full justify-between font-normal"
        >
          <span className="flex min-w-0 items-center gap-2">
            <Globe className="h-4 w-4 shrink-0 opacity-60" />
            <span className="truncate">{current.replace(/_/g, " ")}</span>
            <span className="shrink-0 text-xs text-muted-foreground">
              {zoneAbbr(moment, current)} · {offsetLabel(current, moment)}
            </span>
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] min-w-[320px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search timezones (e.g. London, CDT)…" />
          <CommandList className="max-h-72">
            <CommandEmpty>No timezone found.</CommandEmpty>
            <CommandGroup heading="Common">{options.filter((o) => o.common).map(renderItem)}</CommandGroup>
            <CommandGroup heading="All timezones">{options.filter((o) => !o.common).map(renderItem)}</CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
