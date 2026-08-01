import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { CalendarPlus, Loader2, PartyPopper } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { submitEvent, CATEGORIES } from "@/lib/submissions.functions";

export const Route = createFileRoute("/submit-event")({
  component: SubmitEventPage,
  head: () => ({
    meta: [
      { title: "Submit a community event — EventHub Jackson County" },
      {
        name: "description",
        content:
          "Share your Jackson County, FL event with the community calendar. Submit the details and our coordinators will review it.",
      },
      { property: "og:title", content: "Submit a community event — EventHub" },
      {
        property: "og:description",
        content: "Tell us about your event and we'll add it to the Jackson County community calendar.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

function SubmitEventPage() {
  const [form, setForm] = useState({
    submitted_by_email: "",
    contact_name: "",
    title: "",
    description: "",
    location: "",
    category: "other" as (typeof CATEGORIES)[number],
    date: "",
    start: "",
    end: "",
  });
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const upload = async (file: File) => {
    setUploading(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
      const path = `submissions/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from("event-photos").upload(path, file);
      if (error) throw error;
      const { data } = supabase.storage.from("event-photos").getPublicUrl(path);
      setImageUrl(data.publicUrl);
      toast.success("Image attached");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed — you can submit without an image");
    } finally {
      setUploading(false);
    }
  };

  const submit = async () => {
    if (!form.date || !form.start || !form.end) return toast.error("Add a date and time");
    setBusy(true);
    try {
      await submitEvent({
        data: {
          submitted_by_email: form.submitted_by_email,
          contact_name: form.contact_name || null,
          title: form.title,
          description: form.description || null,
          location: form.location || null,
          category: form.category,
          start_time: new Date(`${form.date}T${form.start}`).toISOString(),
          end_time: new Date(`${form.date}T${form.end}`).toISOString(),
          image_url: imageUrl,
        } as never,
      });
      setSent(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not submit");
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/30 p-6">
        <Card className="w-full max-w-lg text-center">
          <CardContent className="space-y-4 p-10">
            <PartyPopper className="mx-auto h-10 w-10 text-primary" />
            <h1 className="text-2xl font-bold">Thanks — we got it! 🎉</h1>
            <p className="text-muted-foreground">
              A coordinator will review your event and email {form.submitted_by_email} once it's
              approved.
            </p>
            <Button asChild>
              <Link to="/events">Browse the calendar</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30 py-10">
      <div className="mx-auto max-w-2xl px-4">
        <div className="mb-6 text-center">
          <CalendarPlus className="mx-auto mb-2 h-10 w-10 text-primary" />
          <h1 className="text-3xl font-bold tracking-tight">Submit a community event</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            No account needed — tell us the details and we'll review it for the calendar.
          </p>
        </div>
        <Card>
          <CardContent className="space-y-4 p-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Your name</Label>
                <Input
                  value={form.contact_name}
                  onChange={(e) => setForm({ ...form, contact_name: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Your email</Label>
                <Input
                  type="email"
                  required
                  value={form.submitted_by_email}
                  onChange={(e) => setForm({ ...form, submitted_by_email: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Event title</Label>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label>Date</Label>
                <Input
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Start time</Label>
                <Input
                  type="time"
                  value={form.start}
                  onChange={(e) => setForm({ ...form, start: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>End time</Label>
                <Input
                  type="time"
                  value={form.end}
                  onChange={(e) => setForm({ ...form, end: e.target.value })}
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Location</Label>
                <Input
                  value={form.location}
                  onChange={(e) => setForm({ ...form, location: e.target.value })}
                  placeholder="Madison Street Park, Marianna"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Category</Label>
                <Select
                  value={form.category}
                  onValueChange={(v) => setForm({ ...form, category: v as typeof form.category })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea
                rows={5}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Event image (optional)</Label>
              <Input
                type="file"
                accept="image/*"
                disabled={uploading}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void upload(f);
                }}
              />
              {imageUrl ? (
                <img src={imageUrl} alt="Event preview" className="mt-2 h-28 rounded object-cover" />
              ) : null}
            </div>
            <Button className="w-full" size="lg" onClick={submit} disabled={busy || uploading}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Submit for review
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}