import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { createEvent } from "@/lib/events.functions";
import { createSeries } from "@/lib/series.functions";
import { CATEGORIES, categoryLabel, type EventCategory } from "@/lib/categories";
import { listVenues, type Venue } from "@/lib/venues.functions";
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

function toLocalInput(d: Date): string {
  const off = d.getTimezoneOffset();
  const local = new Date(d.getTime() - off * 60_000);
  return local.toISOString().slice(0, 16);
}

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
  const [organizers, setOrganizers] = useState<Organizer[]>([]);
  const [selectedOrganizers, setSelectedOrganizers] = useState<string[]>([]);
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open) {
      const s = initialStart ?? new Date();
      const e = new Date(s.getTime() + 60 * 60_000);
      setStart(toLocalInput(s));
      setEnd(toLocalInput(e));
    }
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
    setLat(v.lat != null ? String(v.lat) : "");
    setLng(v.lng != null ? String(v.lng) : "");
  }

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
      const startIso = new Date(start).toISOString();
      const endIso = new Date(end).toISOString();
      if (new Date(endIso) <= new Date(startIso)) {
        toast.error("End time must be after start time");
        setLoading(false);
        return;
      }
      const tags = tagsText.split(",").map((t) => t.trim()).filter(Boolean);
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
            location: location || null,
            start_time: startIso,
            end_time: endIso,
            category,
            tags,
            latitude: lat ? Number(lat) : null,
            longitude: lng ? Number(lng) : null,
            event_format: format,
            virtual_link: format === "in_person" ? null : virtualLink || null,
            livestream_provider: format === "in_person" ? "none" : provider,
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
            location: location || null,
            category,
            tags,
            dtstart: startIso,
            duration_minutes: durationMin,
            rrule,
            until: repeatUntil ? new Date(repeatUntil).toISOString() : null,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          },
        });
        toast.success(`Series created — ${res.count} occurrences`);
      }
      if (imageUrl) toast("Media upload wiring lands in Phase 1d");
      setTitle("");
      setDescription("");
      setLocation("");
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
        <DialogHeader>
          <DialogTitle>New event</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label htmlFor="title">Title</Label>
            <Input id="title" required value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="desc">Description</Label>
            <Textarea id="desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          </div>
          <div>
            <Label htmlFor="loc">Location</Label>
            <Input id="loc" value={location} onChange={(e) => setLocation(e.target.value)} />
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
            <Label htmlFor="img">Cover image URL (landscape)</Label>
            <Input
              id="img"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="https://…"
            />
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