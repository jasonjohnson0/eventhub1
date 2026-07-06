import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Camera, Trash2, ChevronLeft, ChevronRight } from "lucide-react";
import { getEventPhotos, uploadEventPhoto, deleteEventPhoto } from "@/lib/monetization.functions";

type Photo = Awaited<ReturnType<typeof getEventPhotos>>[number];

export function PhotoGallery({ eventId, canManage }: { eventId: string; canManage: boolean }) {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [idx, setIdx] = useState(0);
  const [showForm, setShowForm] = useState(false);
  const [url, setUrl] = useState("");
  const [caption, setCaption] = useState("");

  async function refresh() {
    try {
      const rows = await getEventPhotos({ data: { event_id: eventId } });
      setPhotos(rows);
      setIdx(0);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load photos");
    }
  }
  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  async function upload(e: React.FormEvent) {
    e.preventDefault();
    try {
      await uploadEventPhoto({
        data: { event_id: eventId, photo_url: url, caption: caption || null },
      });
      toast.success("Photo added");
      setUrl("");
      setCaption("");
      setShowForm(false);
      void refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    }
  }

  async function del(id: string) {
    if (!confirm("Delete this photo?")) return;
    try {
      await deleteEventPhoto({ data: { photo_id: id } });
      void refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  }

  if (photos.length === 0 && !canManage) return null;

  const current = photos[idx];
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Camera className="h-4 w-4" /> Event gallery
        </CardTitle>
        {canManage && (
          <Button size="sm" variant="outline" onClick={() => setShowForm((s) => !s)}>
            {showForm ? "Cancel" : "Upload photo"}
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {showForm && (
          <form onSubmit={upload} className="grid gap-2 rounded-md border p-3">
            <Input
              required
              type="url"
              placeholder="https://…/photo.jpg"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
            <Input
              placeholder="Caption (optional)"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
            />
            <Button type="submit" size="sm">Add photo</Button>
          </form>
        )}
        {photos.length === 0 && (
          <p className="text-sm text-muted-foreground">No photos yet.</p>
        )}
        {current && (
          <div className="space-y-2">
            <div className="relative overflow-hidden rounded-md border bg-muted">
              <img
                src={current.photo_url}
                alt={current.caption ?? "Event photo"}
                className="aspect-video w-full object-cover"
              />
              {photos.length > 1 && (
                <>
                  <Button
                    size="icon"
                    variant="secondary"
                    className="absolute left-2 top-1/2 -translate-y-1/2"
                    onClick={() => setIdx((i) => (i - 1 + photos.length) % photos.length)}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="secondary"
                    className="absolute right-2 top-1/2 -translate-y-1/2"
                    onClick={() => setIdx((i) => (i + 1) % photos.length)}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </>
              )}
              {canManage && (
                <Button
                  size="icon"
                  variant="destructive"
                  className="absolute right-2 top-2"
                  onClick={() => del(current.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{current.caption ?? ""}</span>
              <span>{idx + 1} / {photos.length}</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}