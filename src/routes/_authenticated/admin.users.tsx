import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { adminListUsers } from "@/lib/admin.stats.functions";
import { promoteUser } from "@/lib/admin.functions";
import { banUser } from "@/lib/moderation.functions";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/users")({
  component: UsersPage,
});

type UserRow = Awaited<ReturnType<typeof adminListUsers>>[number];

function UsersPage() {
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [banTarget, setBanTarget] = useState<UserRow | null>(null);
  const [banReason, setBanReason] = useState("");
  const [banDuration, setBanDuration] = useState<"1d" | "7d" | "30d" | "permanent">("permanent");
  const [banSubmitting, setBanSubmitting] = useState(false);
  const [promotingId, setPromotingId] = useState<string | null>(null);

  async function reload() {
    setLoading(true);
    try {
      const rs = await adminListUsers({ data: { search: search || undefined } });
      setRows(rs);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void reload();
  }, []);

  async function handlePromote(u: UserRow) {
    if (u.roles.includes("coordinator")) {
      toast("Already a coordinator");
      return;
    }
    setPromotingId(u.id);
    try {
      await promoteUser({ data: { user_id: u.id, role: "coordinator" } });
      toast.success(`${u.email} promoted to coordinator`);
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Promotion failed");
    } finally {
      setPromotingId(null);
    }
  }

  function openBan(u: UserRow) {
    setBanTarget(u);
    setBanReason("");
    setBanDuration("permanent");
  }

  async function submitBan() {
    if (!banTarget) return;
    if (!banReason.trim()) {
      toast.error("Please provide a reason");
      return;
    }
    setBanSubmitting(true);
    try {
      const expires_at =
        banDuration === "permanent"
          ? null
          : new Date(
              Date.now() +
                (banDuration === "1d" ? 1 : banDuration === "7d" ? 7 : 30) * 24 * 60 * 60 * 1000,
            ).toISOString();
      await banUser({ data: { user_id: banTarget.id, reason: banReason.trim(), expires_at } });
      toast.success(`${banTarget.email} has been banned`);
      setBanTarget(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ban failed");
    } finally {
      setBanSubmitting(false);
    }
  }

  return (
    <Card>
      <CardContent className="p-4">
        <form
          className="mb-4 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void reload();
          }}
        >
          <Input placeholder="Search by email" value={search} onChange={(e) => setSearch(e.target.value)} />
          <Button type="submit" disabled={loading}>
            Search
          </Button>
        </form>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>Roles</TableHead>
              <TableHead>Joined</TableHead>
              <TableHead>Last sign-in</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((u) => (
              <TableRow key={u.id}>
                <TableCell className="font-medium">{u.email}</TableCell>
                <TableCell className="flex gap-1">
                  {u.roles.map((r) => (
                    <Badge key={r} variant="outline" className="capitalize">
                      {r}
                    </Badge>
                  ))}
                </TableCell>
                <TableCell>{new Date(u.created_at).toLocaleDateString()}</TableCell>
                <TableCell>{u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleDateString() : "—"}</TableCell>
                <TableCell className="space-x-2 text-right">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={promotingId === u.id}
                    onClick={() => handlePromote(u)}
                  >
                    Promote to coordinator
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => openBan(u)}>
                    Ban user
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
      <Dialog open={!!banTarget} onOpenChange={(o) => !o && setBanTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ban {banTarget?.email}</DialogTitle>
            <DialogDescription>
              The user will be blocked from creating events and other actions until the ban expires.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Duration</Label>
              <Select value={banDuration} onValueChange={(v) => setBanDuration(v as typeof banDuration)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1d">24 hours</SelectItem>
                  <SelectItem value="7d">7 days</SelectItem>
                  <SelectItem value="30d">30 days</SelectItem>
                  <SelectItem value="permanent">Permanent</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Reason</Label>
              <Textarea
                value={banReason}
                onChange={(e) => setBanReason(e.target.value)}
                placeholder="Explain why this user is being banned"
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBanTarget(null)} disabled={banSubmitting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={submitBan} disabled={banSubmitting}>
              {banSubmitting ? "Banning…" : "Confirm ban"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}