import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Lock, Mail, RotateCw, UserCheck, UserX, Ban } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { inviteGuests, listGuests, updateGuest } from "@/lib/private-events.functions";

type Guest = Awaited<ReturnType<typeof listGuests>>[number];
type Action = "approve" | "decline" | "revoke" | "resend";

const STATUS_LABEL: Record<Guest["status"], string> = {
  requested: "Requested access",
  pending: "Invited",
  accepted: "Accepted",
  declined: "Declined",
  revoked: "Revoked",
};
const STATUS_VARIANT: Record<Guest["status"], "default" | "secondary" | "outline" | "destructive"> = {
  requested: "default",
  pending: "secondary",
  accepted: "outline",
  declined: "outline",
  revoked: "destructive",
};

/** Which buttons each row offers -- mirrors coordinatorTransition() in
 *  lib/private-invites.ts, which the server enforces regardless. */
function actionsFor(g: Guest): Action[] {
  switch (g.status) {
    case "requested":
      return ["approve", "decline"];
    case "pending":
      return ["resend", "revoke"];
    case "accepted":
      return ["revoke"];
    case "declined":
    case "revoked":
      return g.email ? ["resend"] : [];
  }
}

const ACTION_UI: Record<Action, { label: string; icon: typeof Mail }> = {
  approve: { label: "Approve", icon: UserCheck },
  decline: { label: "Decline", icon: UserX },
  revoke: { label: "Revoke", icon: Ban },
  resend: { label: "Resend", icon: RotateCw },
};

/**
 * Coordinator's guest list for a PRIVATE event: invite by email, see who has
 * accepted / is pending / asked for access, and approve, decline, resend or
 * revoke. Only accepted guests (plus the workspace) can see the event --
 * that is enforced by RLS, not by this component.
 */
export function GuestListCard({ eventId }: { eventId: string }) {
  const [guests, setGuests] = useState<Guest[] | null>(null);
  const [emails, setEmails] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setGuests(await listGuests({ data: { event_id: eventId } }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not load the guest list");
      setGuests([]);
    }
  }, [eventId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function send() {
    const list = emails.split(/[\s,;]+/).filter(Boolean);
    if (list.length === 0) return;
    setSending(true);
    try {
      const res = await inviteGuests({ data: { event_id: eventId, emails: list, message: message.trim() || null } });
      const invited = res.results.filter((r) => r.outcome === "invited").length;
      const approved = res.results.filter((r) => r.outcome === "approved_request").length;
      const already = res.results.filter((r) => r.outcome === "already_guest").length;
      const parts = [
        invited && `${invited} invited`,
        approved && `${approved} request${approved === 1 ? "" : "s"} approved`,
        already && `${already} already on the list`,
      ].filter(Boolean);
      toast.success(parts.join(" · ") || "Nothing to send");
      if (res.invalid.length) toast.error(`Skipped invalid address${res.invalid.length === 1 ? "" : "es"}: ${res.invalid.join(", ")}`);
      if (res.failed) toast.error(`${res.failed} email${res.failed === 1 ? "" : "s"} failed to send -- check the email log`);
      setEmails("");
      setMessage("");
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not send invites");
    } finally {
      setSending(false);
    }
  }

  async function act(g: Guest, action: Action) {
    setBusyId(g.id);
    try {
      await updateGuest({ data: { invite_id: g.id, action } });
      toast.success(
        action === "resend" ? "Invite re-sent (the old link no longer works)" : `${ACTION_UI[action].label}d`,
      );
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update");
    } finally {
      setBusyId(null);
    }
  }

  const requests = (guests ?? []).filter((g) => g.status === "requested");
  const accepted = (guests ?? []).filter((g) => g.status === "accepted").length;

  return (
    <Card data-guest-list="">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Lock className="h-4 w-4" /> Guest list
          {guests && (
            <span className="text-sm font-normal text-muted-foreground">
              {accepted} accepted · {guests.length} total
            </span>
          )}
        </CardTitle>
        <CardDescription>
          This event is private. Only your team and guests who accept an invite can see it. Invites are
          personal: guests sign in with the address you invite to accept.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="guest-emails">Invite by email</Label>
          <Textarea
            id="guest-emails"
            placeholder="pat@example.com, sam@example.org"
            value={emails}
            onChange={(e) => setEmails(e.target.value)}
            rows={2}
          />
          <Textarea
            aria-label="Optional note to include"
            placeholder="Optional note to include in the invitation"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={2}
          />
          <Button size="sm" onClick={send} disabled={sending || !emails.trim()}>
            <Mail className="mr-1 h-4 w-4" /> {sending ? "Sending…" : "Send invites"}
          </Button>
        </div>

        {requests.length > 0 && (
          <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900" data-access-requests={requests.length}>
            {requests.length} {requests.length === 1 ? "person has" : "people have"} asked for access.
          </p>
        )}

        {guests === null ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : guests.length === 0 ? (
          <p className="text-sm text-muted-foreground">No one invited yet.</p>
        ) : (
          <ul className="divide-y rounded-md border">
            {guests.map((g) => (
              <li key={g.id} data-guest={g.email ?? g.user_id ?? g.id} data-guest-status={g.status} className="flex flex-wrap items-center gap-2 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{g.name ?? g.email ?? "Unknown"}</p>
                  {g.name && g.email && <p className="truncate text-xs text-muted-foreground">{g.email}</p>}
                  {g.status === "requested" && g.message && (
                    <p className="mt-0.5 line-clamp-2 text-xs italic text-muted-foreground">“{g.message}”</p>
                  )}
                </div>
                <Badge variant={STATUS_VARIANT[g.status]}>{STATUS_LABEL[g.status]}</Badge>
                <div className="flex gap-1">
                  {actionsFor(g).map((a) => {
                    const Icon = ACTION_UI[a].icon;
                    return (
                      <Button
                        key={a}
                        size="sm"
                        variant={a === "approve" ? "default" : "ghost"}
                        disabled={busyId === g.id}
                        onClick={() => act(g, a)}
                        data-guest-action={a}
                      >
                        <Icon className="mr-1 h-3.5 w-3.5" />
                        {ACTION_UI[a].label}
                      </Button>
                    );
                  })}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
