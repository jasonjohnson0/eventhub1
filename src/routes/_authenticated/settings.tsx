import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { inviteStaff, listStaff, revokeStaff } from "@/lib/workspace.functions";
import { bootstrapFirstAdmin } from "@/lib/admin.functions";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsPage,
  head: () => ({ meta: [{ title: "Settings — EventHub" }] }),
});

type StaffRow = {
  id: string;
  invited_email: string;
  role: string;
  invited_at: string;
  accepted_at: string | null;
  staff_user_id: string | null;
};

function SettingsPage() {
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);

  async function reload() {
    try {
      const rows = await listStaff();
      setStaff(rows as StaffRow[]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load staff");
    }
  }
  useEffect(() => {
    void reload();
  }, []);

  async function onInvite(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await inviteStaff({ data: { email, role: "staff" } });
      await navigator.clipboard.writeText(`${window.location.origin}${res.invite_url}`).catch(() => {});
      toast.success("Invite link copied to clipboard");
      setEmail("");
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Invite failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Workspace staff, billing, and admin bootstrapping.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Invite workspace staff</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={onInvite} className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="flex-1">
                <Label htmlFor="staff-email">Staff email</Label>
                <Input
                  id="staff-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="staff@company.com"
                />
              </div>
              <Button type="submit" disabled={loading}>
                {loading ? "Sending…" : "Invite"}
              </Button>
            </form>

            <div className="mt-6 divide-y rounded-md border">
              {staff.length === 0 && (
                <p className="p-4 text-sm text-muted-foreground">No staff invited yet.</p>
              )}
              {staff.map((s) => (
                <div key={s.id} className="flex items-center justify-between p-3">
                  <div>
                    <div className="font-medium">{s.invited_email}</div>
                    <div className="text-xs text-muted-foreground">
                      Invited {new Date(s.invited_at).toLocaleDateString()}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={s.accepted_at ? "default" : "secondary"}>
                      {s.accepted_at ? "Active" : "Pending"}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={async () => {
                        await revokeStaff({ data: { id: s.id } });
                        await reload();
                      }}
                    >
                      Remove
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Admin bootstrap</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Promotes the current user to admin — works only if no admin exists yet.
            </p>
            <Button
              variant="outline"
              onClick={async () => {
                try {
                  await bootstrapFirstAdmin();
                  toast.success("You are now the admin. Reloading…");
                  setTimeout(() => window.location.reload(), 800);
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "Bootstrap failed");
                }
              }}
            >
              Claim admin
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}