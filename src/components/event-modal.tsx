import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { createEvent } from "@/lib/events.functions";
import { createSeries } from "@/lib/series.functions";
import { getCoordinatorProfile } from "@/lib/onboarding.functions";
import { CATEGORIES, categoryLabel, type EventCategory } from "@/lib/categories";
import { listVenues, searchVenuesPublic, type Venue } from "@/lib/venues.functions";
import {
  COMMON_TIMEZONES,
  DEFAULT_TIMEZONE,
  instantToWallTimeInput,
  zonedWallTimeToInstant,
} from "@/lib/timezone";
import {
  assignToEvent,
  listOrganizers,
  MAX_ORGANIZERS_PER_EVENT,
  type Organizer,
} from "@/lib/organizers.functions";
import {
  listCustomFields,
  saveEventFieldValues,
  type CustomField,
} from "@/lib/custom-fields.functions";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function EventModal({
  open,
  onOpenChange,
  initialStart,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initialStart?: Date;
  onCreated?: () => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [timezone, setTimezone] = useState(DEFAULT_TIMEZONE);
  const [visibility, setVisibility] = useState<"public" | "unlisted">("public");
  const [imageUrl, setImageUrl] = useState("");
  const [category, setCategory] = useState<EventCategory>("other");
  const [tagsText, setTagsText] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [repeat, setRepeat] = useState<"none" | "daily" | "weekly" | "monthly">("none");
  const [repeatUntil, setRepeatUntil] = useState("");
  const [format, setFormat] = useState<"in_person" | "virtual" | "hybrid">("in_person");
  const [virtualLink, setVirtualLink] = useState("");
  const [provider, setProvider] = useState<"zoom" | "google_meet" | "youtube" | "none">("none");
  const [loading, setLoading] = useState(false);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [venueId, setVenueId] = useState<string>("custom");
  const [unit, setUnit] = useState("");
  const [suggestions, setSuggestions] = useState<Venue[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [organizers, setOrganizers] = useState<Organizer[]>([]);
  const [selectedOrganizers, setSelectedOrganizers] = useState<string[]>([]);
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});

  // Defaults the picker to the coordinator's own profile timezone (spec 03),
  // not the browser's -- a coordinator traveling with a laptop shouldn't
  // silently stamp their event in hotel-time. Start/end are then composed as
  // wall-clock time in that zone, so they need the zone resolved first.
  useEffect(() => {
    if (!open) return;
    void (async () => {
      let tz = DEFAULT_TIMEZONE;
      try {
        const profile = await getCoordinatorProfile();
        if (profile.timezone) tz = profile.timezone;
      } catch {
        // Not signed in as a coordinator yet, or the profile fetch failed --
        // fall back to the platform default rather than blocking the modal.
      }
      setTimezone(tz);
      const s = initialStart ?? new Date();
      const e = new Date(s.getTime() + 60 * 60_000);
      setStart(instantToWallTimeInput(s, tz));
      setEnd(instantToWallTimeInput(e, tz));
    })();
  }, [open, initialStart]);

  useEffect(() => {
    if (!open) return;
    void (async () => {
      const [v, o, f] = await Promise.allSettled([
        listVenues(),
        listOrganizers(),
        listCustomFields(),
      ]);
      if (v.status === "fulfilled") setVenues(v.value);
      if (o.status === "fulfilled") setOrganizers(o.value);
      if (f.status === "fulfilled") setCustomFields(f.value);
    })();
  }, [open]);

  function pickVenue(id: string) {
    setVenueId(id);
    const v = venues.find((x) => x.id === id);
    if (!v) return;
    setLocation(v.address ? `${v.name}, ${v.address}` : v.name);
    setUnit(v.unit ?? "");
    setLat(v.lat != null ? String(v.lat) : "");
    setLng(v.lng != null ? String(v.lng) : "");
    setShowSuggestions(false);
  }

  function pickSuggestion(v: Venue) {
    setVenueId("custom");
    setLocation(v.address ? `${v.name}, ${v.address}` : v.name);
    setUnit(v.unit ?? "");
    setLat(v.lat != null ? String(v.lat) : "");
    setLng(v.lng != null ? String(v.lng) : "");
    setSuggestions([]);
    setShowSuggestions(false);
  }

  // Cross-coordinator autosuggest: a venue someone else already saved is a
  // venue this coordinator shouldn't have to re-enter (and re-verify) from
  // scratch. Only searches free-typed locations, not one already tied to a
  // saved venue from the picker above.
  useEffect(() => {
    if (venueId !== "custom" || location.trim().length < 3) {
      setSuggestions([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const rows = await searchVenuesPublic({ data: { q: location.trim() } });
        setSuggestions(rows);
      } catch {
        setSuggestions([]);
      }
    }, 400);
    return () => clearTimeout(t);
  }, [location, venueId]);

  function toggleOrganizer(id: string) {
    setSelectedOrganizers((prev) => {
      if (prev.includes(id)) return prev.filter((p) => p !== id);
      if (prev.length >= MAX_ORGANIZERS_PER_EVENT) {
        toast.error(`Up to ${MAX_ORGANIZERS_PER_EVENT} organizers per event`);
        return prev;
      }
      return [...prev, id];
    });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const startComposed = zonedWallTimeToInstant(start, timezone);
      const endComposed = zonedWallTimeToInstant(end, timezone);
      if (startComposed.snapped || endComposed.snapped) {
        toast.warning(
          "That time falls in a daylight-saving gap in the selected zone -- snapped forward an hour.",
        );
      }
      const startIso = startComposed.instant.toISOString();
      const endIso = endComposed.instant.toISOString();
      if (new Date(endIso) <= new Date(startIso)) {
        toast.error("End time must be after start time");
        setLoading(false);
        return;
      }
      const tags = tagsText.split(",").map((t) => t.trim()).filter(Boolean);
      const fullLocation = unit.trim()
        ? `${location}${location ? ", " : ""}${unit.trim()}`
        : location;
      const missing = customFields.filter((f) => f.is_required && !fieldValues[f.id]);
      if (missing.length > 0) {
        toast.error(`Required: ${missing.map((f) => f.field_name).join(", ")}`);
        setLoading(false);
        return;
      }
      if (repeat === "none") {
        const created = await createEvent({
          data: {
            title,
            description: description || null,
            location: fullLocation || null,
            start_time: startIso,
            end_time: endIso,
            category,
            tags,
            latitude: lat ? Number(lat) : null,
            longitude: lng ? Number(lng) : null,
            event_format: format,
            virtual_link: format === "in_person" ? null : virtualLink || null,
            livestream_provider: format === "in_person" ? "none" : provider,
            landscape_image_url: imageUrl.trim() || null,
            timezone,
            visibility,
          },
        });
        if (selectedOrganizers.length > 0) {
          await assignToEvent({
            data: { event_id: created.id, organizer_ids: selectedOrganizers },
          });
        }
        const values = Object.entries(fieldValues)
          .filter(([, v]) => v !== "")
          .map(([field_id, value]) => ({ field_id, value }));
        if (values.length > 0) {
          await saveEventFieldValues({ data: { event_id: created.id, values } });
        }
        toast.success("Event created");
      } else {
        const rrule =
          repeat === "daily"
            ? "FREQ=DAILY"
            : repeat === "weekly"
              ? "FREQ=WEEKLY"
              : "FREQ=MONTHLY";
        const durationMin = Math.round(
          (new Date(endIso).getTime() - new Date(startIso).getTime()) / 60_000,
        );
        const res = await createSeries({
          data: {
            title,
            description: description || null,
            location: fullLocation || null,
            category,
            tags,
            dtstart: startIso,
            duration_minutes: durationMin,
            rrule,
            until: repeatUntil ? new Date(repeatUntil).toISOString() : null,
            timezone,
            visibility,
          },
        });
        if (res.truncated) {
          toast.warning(
            `Series created with ${res.count} occurrences — the maximum per series. ` +
              `Set a "repeat until" date or create a second series to cover the rest.`,
          );
        } else {
          toast.success(`Series created — ${res.count} occurrences`);
        }
      }
      setTitle("");
      setDescription("");
      setTimezone(DEFAULT_TIMEZONE);
      setVisibility("public");
      setLocation("");
      setUnit("");
      setSuggestions([]);
      setImageUrl("");
      setTagsText("");
      setLat("");
      setLng("");
      setCategory("other");
      setRepeat("none");
      setRepeatUntil("");
      setFormat("in_person");
      setVirtualLink("");
      setProvider("none");
      setVenueId("custom");
      setSelectedOrganizers([]);
      setFieldValues({});
      onCreated?.();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create event");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {/* scrollable body keeps the extended form usable on laptops */}
        <DialogHeader>
          <DialogTitle>New event</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
          <div>
            <Label htmlFor="title">Title</Label>
            <Input id="title" required value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="desc">Description</Label>
            <Textarea id="desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          </div>
          {venues.length > 0 && (
            <div>
              <Label>Venue</Label>
              <Select value={venueId} onValueChange={pickVenue}>
                <SelectTrigger>
                  <SelectValue placeholder="Pick a saved venue" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="custom">Custom location</SelectItem>
                  {venues.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="relative">
            <Label htmlFor="loc">Location</Label>
            <Input
              id="loc"
              value={location}
              onChange={(e) => {
                setLocation(e.target.value);
                setVenueId("custom");
                setShowSuggestions(true);
              }}
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
              placeholder="A verifiable address, e.g. 123 Main St, City, FL"
              autoComplete="off"
            />
            {showSuggestions && suggestions.length > 0 && (
              <div className="absolute z-10 mt-1 w-full rounded-md border bg-popover shadow-md">
                <p className="border-b px-3 py-1.5 text-xs text-muted-foreground">
                  Already a saved venue — use it?
                </p>
                {suggestions.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => pickSuggestion(v)}
                    className="block w-full px-3 py-2 text-left text-sm hover:bg-accent"
                  >
                    <span className="font-medium">{v.name}</span>
                    {v.address && (
                      <span className="block text-xs text-muted-foreground">
                        {v.address}
                        {v.unit ? ` · ${v.unit}` : ""}
                        {v.address_verified ? " · verified" : ""}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div>
            <Label htmlFor="unit">Building / suite / unit (optional)</Label>
            <Input
              id="unit"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              placeholder="Suite 200, Building B, …"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Use this when the same address has more than one venue.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Category</Label>
              <Select value={category} onValueChange={(v) => setCategory(v as EventCategory)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {categoryLabel(c)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="tags">Tags (comma-separated)</Label>
              <Input id="tags" value={tagsText} onChange={(e) => setTagsText(e.target.value)} placeholder="outdoor, free" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="lat">Latitude (optional)</Label>
              <Input id="lat" type="number" step="any" value={lat} onChange={(e) => setLat(e.target.value)} placeholder="30.7744" />
            </div>
            <div>
              <Label htmlFor="lng">Longitude (optional)</Label>
              <Input id="lng" type="number" step="any" value={lng} onChange={(e) => setLng(e.target.value)} placeholder="-85.2264" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="start">Start</Label>
              <Input id="start" type="datetime-local" required value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="end">End</Label>
              <Input id="end" type="datetime-local" required value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Timezone</Label>
            <Select value={timezone} onValueChange={setTimezone}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {COMMON_TIMEZONES.map((tz) => (
                  <SelectItem key={tz} value={tz}>
                    {tz.replace(/_/g, " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-1 text-xs text-muted-foreground">
              The start/end times above are in this zone. Defaults to your profile's timezone --
              change it for an out-of-town event.
            </p>
          </div>
          <div>
            <Label>Visibility</Label>
            <Select value={visibility} onValueChange={(v) => setVisibility(v as "public" | "unlisted")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="public">Public</SelectItem>
                <SelectItem value="unlisted">Unlisted — hidden from your calendar, reachable by link</SelectItem>
              </SelectContent>
            </Select>
            <p className="mt-1 text-xs text-muted-foreground">
              Anyone with the link can view and RSVP. It will not appear on your public calendar,
              embed, or iCal feed.
            </p>
          </div>
          <div>
            <Label htmlFor="img">Header background image URL (optional)</Label>
            <Input
              id="img"
              type="url"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="https://…"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Shown behind the title on the event page. You can change this anytime after
              creating the event too.
            </p>
          </div>
          <div className="rounded-md border p-3 space-y-3">
            <div>
              <Label>Event format</Label>
              <div className="mt-1 flex gap-3 text-sm">
                {(["in_person", "virtual", "hybrid"] as const).map((f) => (
                  <label key={f} className="flex items-center gap-1">
                    <input
                      type="radio"
                      name="event-format"
                      checked={format === f}
                      onChange={() => setFormat(f)}
                    />
                    <span className="capitalize">{f.replace("_", " ")}</span>
                  </label>
                ))}
              </div>
            </div>
            {format !== "in_person" && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Label htmlFor="vlink">Virtual link</Label>
                  <Input
                    id="vlink"
                    type="url"
                    value={virtualLink}
                    onChange={(e) => setVirtualLink(e.target.value)}
                    placeholder="https://zoom.us/j/…"
                  />
                </div>
                <div>
                  <Label>Provider</Label>
                  <Select value={provider} onValueChange={(v) => setProvider(v as typeof provider)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="zoom">Zoom</SelectItem>
                      <SelectItem value="google_meet">Google Meet</SelectItem>
                      <SelectItem value="youtube">YouTube</SelectItem>
                      <SelectItem value="none">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
          </div>
          <div className="rounded-md border p-3">
            <div className="mb-2 grid grid-cols-2 gap-3">
              <div>
                <Label>Repeat</Label>
                <Select value={repeat} onValueChange={(v) => setRepeat(v as typeof repeat)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Does not repeat</SelectItem>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {repeat !== "none" && (
                <div>
                  <Label htmlFor="until">Until (optional)</Label>
                  <Input
                    id="until"
                    type="date"
                    value={repeatUntil}
                    onChange={(e) => setRepeatUntil(e.target.value)}
                  />
                </div>
              )}
            </div>
            {repeat !== "none" && (
              <p className="text-xs text-muted-foreground">
                Up to 100 occurrences will be generated. Each can be edited individually or as a series.
              </p>
            )}
          </div>
          {organizers.length > 0 && (
            <div className="rounded-md border p-3">
              <Label className="mb-2 block">
                Organizers & speakers{" "}
                <span className="text-xs font-normal text-muted-foreground">
                  ({selectedOrganizers.length}/{MAX_ORGANIZERS_PER_EVENT})
                </span>
              </Label>
              <div className="flex flex-wrap gap-2">
                {organizers.map((o) => {
                  const on = selectedOrganizers.includes(o.id);
                  return (
                    <button
                      key={o.id}
                      type="button"
                      onClick={() => toggleOrganizer(o.id)}
                      className="focus:outline-none"
                    >
                      <Badge variant={on ? "default" : "outline"} className="cursor-pointer">
                        {o.name}
                        {o.title ? ` · ${o.title}` : ""}
                      </Badge>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {customFields.length > 0 && (
            <div className="space-y-3 rounded-md border p-3">
              <Label className="block">Additional details</Label>
              {customFields.map((f) => (
                <div key={f.id}>
                  <Label htmlFor={`cf-${f.id}`} className="text-xs">
                    {f.field_name}
                    {f.is_required ? " *" : ""}
                  </Label>
                  {f.field_type === "dropdown" ? (
                    <Select
                      value={fieldValues[f.id] ?? ""}
                      onValueChange={(v) => setFieldValues({ ...fieldValues, [f.id]: v })}
                    >
                      <SelectTrigger id={`cf-${f.id}`}>
                        <SelectValue placeholder="Select…" />
                      </SelectTrigger>
                      <SelectContent>
                        {f.options.map((opt) => (
                          <SelectItem key={opt} value={opt}>
                            {opt}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : f.field_type === "checkbox" ? (
                    <div className="pt-1">
                      <Checkbox
                        id={`cf-${f.id}`}
                        checked={fieldValues[f.id] === "true"}
                        onCheckedChange={(v) =>
                          setFieldValues({ ...fieldValues, [f.id]: v === true ? "true" : "" })
                        }
                      />
                    </div>
                  ) : (
                    <Input
                      id={`cf-${f.id}`}
                      type={
                        f.field_type === "number" ? "number" : f.field_type === "date" ? "date" : "text"
                      }
                      value={fieldValues[f.id] ?? ""}
                      onChange={(e) => setFieldValues({ ...fieldValues, [f.id]: e.target.value })}
                    />
                  )}
                </div>
              ))}
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Creating…" : repeat === "none" ? "Create event" : "Create series"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}