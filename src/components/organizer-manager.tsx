import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Pencil, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  createOrganizer,
  deleteOrganizer,
  listOrganizers,
  updateOrganizer,
  type Organizer,
  type PersonKind,
} from "@/lib/organizers.functions";

const KIND_LABEL: Record<PersonKind, string> = {
  organizer: "Organizer",
  speaker: "Speaker",
  both: "Both",
};

const EMPTY = {
  name: "",
  title: "",
  bio: "",
  credentials: "",
  photo_url: "",
  linkedin: "",
  twitter: "",
  website: "",
  kind: "organizer" as PersonKind,
};

export function OrganizerManager() {
  const [rows, setRows] = useState<Organizer[]>([]);
  const [form, setForm] = useState({ ...EMPTY });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<"all" | PersonKind>("all");

  const filtered = useMemo(
    () => (filter === "all" ? rows : rows.filter((o) => o.kind === filter)),
    [rows, filter],
  );

  const load = async () => {
    try {
      setRows(await listOrganizers());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not load organizers");
    }
  };
  useEffect(() => {
    void load();
  }, []);

  const save = async () => {
    if (form.name.trim().length < 2) return toast.error("Name is required");
    setBusy(true);
    try {
      const social: Record<string, string> = {};
      if (form.linkedin) social.linkedin = form.linkedin;
      if (form.twitter) social.twitter = form.twitter;
      if (form.website) social.website = form.website;
      const payload = {
        name: form.name.trim(),
        title: form.title || null,
        bio: form.bio || null,
        credentials: form.credentials || null,
        photo_url: form.photo_url || null,
        social_links: social,
        kind: form.kind,
      };
      if (editingId) await updateOrganizer({ data: { id: editingId, ...payload } as never });
      else await createOrganizer({ data: payload as never });
      toast.success(editingId ? "Organizer updated" : "Organizer added");
      setForm({ ...EMPTY });
      setEditingId(null);
      setOpen(false);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    } finally {
      setBusy(false);
    }
  };

  const startEdit = (o: Organizer) => {
    setEditingId(o.id);
    setOpen(true);
    setForm({
      name: o.name,
      title: o.title ?? "",
      bio: o.bio ?? "",
      credentials: o.credentials ?? "",
      photo_url: o.photo_url ?? "",
      linkedin: o.social_links?.linkedin ?? "",
      twitter: o.social_links?.twitter ?? "",
      website: o.social_links?.website ?? "",
      kind: o.kind,
    });
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2">
          <Users className="h-4 w-4" /> Organizers & speakers
        </CardTitle>
        <Button
          size="sm"
          onClick={() => {
            setEditingId(null);
            setForm({ ...EMPTY });
            setOpen((o) => !o);
          }}
        >
          <Plus className="mr-1 h-4 w-4" /> New profile
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {open && (
          <div className="space-y-3 rounded-lg border p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Name</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Title / role</Label>
                <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Kind</Label>
                <Select
                  value={form.kind}
                  onValueChange={(v) => setForm({ ...form, kind: v as PersonKind })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="organizer">Organizer</SelectItem>
                    <SelectItem value="speaker">Speaker</SelectItem>
                    <SelectItem value="both">Both</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Default when assigning to an event -- overridable per event.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label>Credentials</Label>
                <Input
                  value={form.credentials}
                  onChange={(e) => setForm({ ...form, credentials: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Photo URL</Label>
                <Input
                  value={form.photo_url}
                  onChange={(e) => setForm({ ...form, photo_url: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>LinkedIn</Label>
                <Input
                  value={form.linkedin}
                  onChange={(e) => setForm({ ...form, linkedin: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Website</Label>
                <Input
                  value={form.website}
                  onChange={(e) => setForm({ ...form, website: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Bio</Label>
              <Textarea rows={3} value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} />
            </div>
            <div className="flex gap-2">
              <Button onClick={save} disabled={busy}>
                {editingId ? "Save changes" : "Add organizer"}
              </Button>
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        <div className="flex gap-1 rounded-full bg-muted p-1 text-xs font-medium w-fit">
          {(["all", "organizer", "speaker", "both"] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`rounded-full px-3 py-1 capitalize transition-colors ${
                filter === f ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {f}
            </button>
          ))}
        </div>

        <div className="divide-y rounded-lg border">
          {filtered.length === 0 && (
            <p className="p-4 text-sm text-muted-foreground">
              {rows.length === 0 ? "No organizers yet." : "No profiles match this filter."}
            </p>
          )}
          {filtered.map((o) => (
            <div key={o.id} className="flex items-center gap-3 p-3">
              <Avatar className="h-9 w-9">
                {o.photo_url ? <AvatarImage src={o.photo_url} alt={o.name} /> : null}
                <AvatarFallback>{o.name.slice(0, 2).toUpperCase()}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate font-medium">{o.name}</span>
                  <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {KIND_LABEL[o.kind]}
                  </span>
                </div>
                <p className="truncate text-xs text-muted-foreground">
                  {[o.title, o.credentials].filter(Boolean).join(" · ") || "—"}
                </p>
              </div>
              <Button size="sm" variant="ghost" onClick={() => startEdit(o)}>
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={async () => {
                  try {
                    await deleteOrganizer({ data: { id: o.id } });
                    toast.success("Removed");
                    await load();
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : "Could not delete");
                  }
                }}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}