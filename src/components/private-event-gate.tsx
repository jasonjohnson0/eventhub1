import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Lock, MailCheck, Hourglass, Ban } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { getMyEventAccess, requestEventAccess } from "@/lib/private-events.functions";

type GateState =
  | "checking"
  | "signed_out"
  | "not_found"
  | "invited_pending"
  | "requested"
  | "closed"
  | "can_request";

/**
 * Shown by /events/$id when the event row isn't readable by the viewer.
 *
 * The page's data comes from the browser client under the viewer's own RLS,
 * so an unauthorized viewer never receives the event's details at all --
 * this component only decides what to SAY about that:
 *  - signed out: one message for "doesn't exist" and "private" alike, so an
 *    anonymous visitor can't probe whether an id is someone's private event;
 *  - signed in: the server (getMyEventAccess) reports only the caller's own
 *    relationship to the event -- invited, requested, closed, or may ask.
 */
export function PrivateEventGate({
  eventId,
  authReady,
  signedIn,
  onGranted,
}: {
  eventId: string;
  authReady: boolean;
  signedIn: boolean;
  onGranted: () => void;
}) {
  const [state, setState] = useState<GateState>("checking");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!authReady) return;
    if (!signedIn) {
      setState("signed_out");
      return;
    }
    let cancelled = false;
    getMyEventAccess({ data: { event_id: eventId } })
      .then((r) => {
        if (cancelled) return;
        if (r.state === "granted") onGranted();
        else setState(r.state);
      })
      .catch(() => !cancelled && setState("not_found"));
    return () => {
      cancelled = true;
    };
  }, [authReady, signedIn, eventId, onGranted]);

  async function request() {
    setBusy(true);
    try {
      const r = await requestEventAccess({ data: { event_id: eventId, message: note.trim() || null } });
      setState(r.state === "requested" ? "requested" : r.state === "pending" ? "invited_pending" : "closed");
      if (r.state === "requested") toast.success("Request sent to the organizer");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not send the request");
    } finally {
      setBusy(false);
    }
  }

  const next = `/events/${eventId}`;
  const shell = (icon: React.ReactNode, title: string, body: React.ReactNode, extra?: React.ReactNode) => (
    <div
      className="flex min-h-screen items-center justify-center bg-gradient-to-b from-amber-50 to-white px-4"
      data-private-gate={state}
    >
      <div className="w-full max-w-md text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-white text-slate-700 shadow">
          {icon}
        </div>
        <h1 className="mt-4 text-2xl font-bold">{title}</h1>
        <div className="mt-2 text-slate-500">{body}</div>
        {extra}
        <Button asChild variant="ghost" className="mt-6 rounded-full">
          <Link to="/events">Back to events</Link>
        </Button>
      </div>
    </div>
  );

  switch (state) {
    case "checking":
      return (
        <div className="min-h-screen bg-gradient-to-b from-amber-50 to-white p-8" data-private-gate="checking">
          <div className="mx-auto h-40 max-w-md animate-pulse rounded-3xl bg-slate-100" />
        </div>
      );
    case "signed_out":
      return shell(
        <Lock className="h-6 w-6" />,
        "Event not found — or it's private",
        <p>
          It may have been removed, or it's an invite-only event. If you were invited, sign in with the email address
          the invitation was sent to.
        </p>,
        <Button asChild className="mt-6 rounded-full">
          <Link to="/auth" search={{ next }}>
            Sign in
          </Link>
        </Button>,
      );
    case "not_found":
      return shell(<span className="text-2xl">🎈</span>, "Event not found", <p>It may have been removed or is no longer available.</p>);
    case "invited_pending":
      return shell(
        <MailCheck className="h-6 w-6" />,
        "You've been invited",
        <p>
          This is a private event. Open the invitation email and use its <strong>Accept invitation</strong> link to
          join — it has to come from the invited address.
        </p>,
      );
    case "requested":
      return shell(
        <Hourglass className="h-6 w-6" />,
        "Request sent",
        <p>This is a private event. The organizer has your request and will let you know by email.</p>,
      );
    case "closed":
      return shell(
        <Ban className="h-6 w-6" />,
        "This invitation is no longer active",
        <p>This is a private event. If you think that's a mistake, contact the organizer.</p>,
      );
    case "can_request":
      return shell(
        <Lock className="h-6 w-6" />,
        "This event is private",
        <p>Only invited guests can see it. You can ask the organizer for access.</p>,
        <div className="mt-6 space-y-3 text-left">
          <Textarea
            aria-label="Note to the organizer (optional)"
            placeholder="Optional: a note to the organizer"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            maxLength={2000}
          />
          <Button onClick={request} disabled={busy} className="w-full rounded-full" data-request-access="">
            {busy ? "Sending…" : "Request access"}
          </Button>
        </div>,
      );
  }
}
