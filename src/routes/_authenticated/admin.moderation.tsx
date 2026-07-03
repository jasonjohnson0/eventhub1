import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { adminListEvents, adminRemoveEvent } from "@/lib/admin.stats.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/moderation")({
  component: ModerationPage,
});

type EventRow = Awaited<ReturnType<typeof adminListEvents>>[number];

function ModerationPage() {
  const [status, setStatus] = useState<"all" | "approved" | "removed">("all");
  const [rows, setRows] = useState<EventRow[]>([]);
  const [removing, setRemoving] = useState<EventRow | null>(null);
  const [reason, setReason] = useState("");

  async function reload() {
    const rs = await adminListEvents({ data: { status } });
    setRows(rs);
  }
  useEffect(() => {
    void reload();
  }, [status]);

  async function confirmRemove() {
    if (!removing) return;
    try {
      await adminRemoveEvent({ data: { id: removing.id, reason } });
      toast.success("Event removed");
      setRemoving(null);
      setReason("");
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove");
    }
  }

  return (
    <Card>
      <CardContent className="p-4">
        <div className="mb-4 flex gap-1">
          {(["all", "approved", "removed"] as const).map((s) => (
            <Button
              key={s}
              variant={status === s ? "default" : "outline"}
              size="sm"
              onClick={() => setStatus(s)}
              className="capitalize"
            >
              {s}
            </Button>
          ))}
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Coordinator</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                  No events found.
                </TableCell>
              </TableRow>
            )}
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{r.title}</TableCell>
                <TableCell>{r.coordinator_name}</TableCell>
                <TableCell>
                  <Badge variant={r.status === "removed" ? "destructive" : "default"}>{r.status}</Badge>
                </TableCell>
                <TableCell>{new Date(r.created_at).toLocaleDateString()}</TableCell>
                <TableCell className="text-right">
                  {r.status !== "removed" && (
                    <Button size="sm" variant="destructive" onClick={() => setRemoving(r)}>
                      Remove
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>

      <Dialog open={!!removing} onOpenChange={(o) => !o && setRemoving(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove event</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">"{removing?.title}" will be hidden from public listings.</p>
            <Label htmlFor="reason">Reason (audit-logged)</Label>
            <Textarea id="reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRemoving(null)}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={!reason.trim()} onClick={confirmRemove}>
              Remove event
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}