import { useEffect, useState } from "react";
import { toast } from "sonner";
import { MapPin, Plus, Trash2, Pencil, Search } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  createVenue,
  deleteVenue,
  listVenues,
  updateVenue,
  type Venue,
} from "@/lib/venues.functions";

const EMPTY = {
  name: "",
  address: "",
  capacity: "",
  phone: "",
  website: "",
  parking_info: "",
  accessibility_info: "",
  lat: "",
  lng: "",
};

export function VenueManager() {
  const [venues, setVenues] = useState<Venue[]>([]);
  const [q, setQ] = useState("");
  const [form, setForm] = useState({ ...EMPTY });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      setVenues(await listVenues());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not load venues");
    }
  };
  useEffect(() => {
    void load();
  }, []);

  const save = async () => {
    if (form.name.trim().length < 2) return toast.error("Venue name is required");
    setBusy(true);
    try {
      const payload = {
        name: form.name.trim(),
        address: form.address || null,
        capacity: form.capacity ? Number(form.capacity) : null,
        phone: form.phone || null,
        website: form.website || null,
        parking_info: form.parking_info || null,
        accessibility_info: form.accessibility_info || null,
        lat: form.lat ? Number(form.lat) : null,
        lng: form.lng ? Number(form.lng) : null,
      };
      if (editingId) await updateVenue({ data: { id: editingId, ...payload } as never });
      else await createVenue({ data: payload as never });
      toast.success(editingId ? "Venue updated" : "Venue added");
      setForm({ ...EMPTY });
      setEditingId(null);
      setOpen(false);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save venue");
    } finally {
      setBusy(false);
    }
  };

  const startEdit = (v: Venue) => {
    setEditingId(v.id);
    setOpen(true);
    setForm({
      name: v.name,
      address: v.address ?? "",
      capacity: v.capacity?.toString() ?? "",
      phone: v.phone ?? "",
      website: v.website ?? "",
      parking_info: v.parking_info ?? "",
      accessibility_info: v.accessibility_info ?? "",
      lat: v.lat?.toString() ?? "",
      lng: v.lng?.toString() ?? "",
    });
  };

  const remove = async (id: string) => {
    try {
      await deleteVenue({ data: { id } });
      toast.success("Venue removed");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete");
    }
  };

  const filtered = venues.filter((v) =>
    q ? `${v.name} ${v.address ?? ""}`.toLowerCase().includes(q.toLowerCase()) : true,
  );

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2">
          <MapPin className="h-4 w-4" /> Venues
        </CardTitle>
        <Button
          size="sm"
          onClick={() => {
            setEditingId(null);
            setForm({ ...EMPTY });
            setOpen((o) => !o);
          }}
        >
          <Plus className="mr-1 h-4 w-4" /> New venue
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="relative">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Search venues"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>

        {open && (
          <div className="space-y-3 rounded-lg border p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Name</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Address</Label>
                <Input
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Capacity</Label>
                <Input
                  type="number"
                  value={form.capacity}
                  onChange={(e) => setForm({ ...form, capacity: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Phone</Label>
                <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Website</Label>
                <Input
                  value={form.website}
                  onChange={(e) => setForm({ ...form, website: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label>Latitude</Label>
                  <Input value={form.lat} onChange={(e) => setForm({ ...form, lat: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Longitude</Label>
                  <Input value={form.lng} onChange={(e) => setForm({ ...form, lng: e.target.value })} />
                </div>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Parking info</Label>
              <Textarea
                rows={2}
                value={form.parking_info}
                onChange={(e) => setForm({ ...form, parking_info: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Accessibility info</Label>
              <Textarea
                rows={2}
                value={form.accessibility_info}
                onChange={(e) => setForm({ ...form, accessibility_info: e.target.value })}
              />
            </div>
            <div className="flex gap-2">
              <Button onClick={save} disabled={busy}>
                {editingId ? "Save changes" : "Add venue"}
              </Button>
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        <div className="divide-y rounded-lg border">
          {filtered.length === 0 && (
            <p className="p-4 text-sm text-muted-foreground">No venues yet.</p>
          )}
          {filtered.map((v) => (
            <div key={v.id} className="flex flex-wrap items-center gap-3 p-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate font-medium">{v.name}</span>
                  {v.capacity ? <Badge variant="secondary">cap {v.capacity}</Badge> : null}
                </div>
                <p className="truncate text-xs text-muted-foreground">{v.address ?? "No address"}</p>
              </div>
              <Button size="sm" variant="ghost" onClick={() => startEdit(v)}>
                <Pencil className="h-4 w-4" />
              </Button>
              <Button size="sm" variant="ghost" onClick={() => remove(v.id)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}