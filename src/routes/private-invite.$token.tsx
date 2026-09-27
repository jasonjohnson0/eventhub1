import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Lock } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { acceptPrivateInvite, declinePrivateInvite } from "@/lib/private-events.functions";

/**
 * Landing page for a private-event invite link (gap-closure phase 3).
 *
 * Nothing happens on load: accepting and declining are explicit clicks,
 * because mail providers' link scanners fetch URLs and must not be able to
 * accept (or decline) on the recipient's behalf. The token in the URL is a
 * credential, so the page is noindex and sends no Referer anywhere.
 */
export const Route = createFileRoute("/private-invite/$token")({
  ssr: false,
  component: PrivateInvitePage,
  head: () => ({
    meta: [
      { title: "Private event invitation — EventHub" },
      { name: "robots", content: "noindex, nofollow" },
      { name: "referrer", content: "no-referrer" },
    ],
  }),
});

type State = "checking" | "needs_auth" | "ready" | "working" | "declined" | "error";

const REASONS: Record<string, string> = {
  invalid: "This invitation link isn't valid. It may have been replaced by a newer one -- check for a more recent email.",
  revoked: "The organizer has withdrawn this invitation.",
  claimed: "This invitation has already been accepted by another account.",
  wrong_account: "This invitation was sent to a different email address than the one you're signed in with.",
  no_email: "Your account has no email address, so it can't be matched to this invitation.",
};

function PrivateInvitePage() {
  const { token } = Route.useParams();
  const navigate = useNavigate();
  const [state, setState] = useState<State>("checking");
  const [error, setError] = useState("");
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setEmail(data.user?.email ?? null);
      setState(data.user ? "ready" : "needs_auth");
    });
  }, []);

  function fail(reason: string, hint?: string | null) {
    setError((REASONS[reason] ?? "Something went wrong.") + (hint ? ` (It was sent to ${hint}.)` : ""));
    setState("error");
  }

  async function run(kind: "accept" | "decline") {
    setState("working");
    try {
      if (kind === "decline") {
        const res = await declinePrivateInvite({ data: { token } });
        if (!res.ok) return fail(res.reason, "hint" in res ? res.hint : null);
        setState("declined");
        return;
      }
      const res = await acceptPrivateInvite({ data: { token } });
      if (!res.ok) return fail(res.reason, "hint" in res ? res.hint : null);
      toast.success("You're on the guest list");
      navigate({ to: "/events/$id", params: { id: res.event_id }, replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setState("error");
    }
  }

  const next = `/private-invite/${token}`;
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-amber-50 to-white px-4" data-invite-state={state}>
      <div className="w-full max-w-md rounded-3xl bg-white p-8 text-center shadow-sm ring-1 ring-slate-200">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-slate-100">
          <Lock className="h-6 w-6 text-slate-700" />
        </div>
        <h1 className="mt-4 text-2xl font-bold">Private event invitation</h1>

        {state === "checking" && <p className="mt-2 text-slate-500">Checking your session…</p>}

        {state === "needs_auth" && (
          <>
            <p className="mt-2 text-slate-500">
              Sign in — or create an account — with the email address this invitation was sent to.
            </p>
            <Button asChild className="mt-6 rounded-full">
              <Link to="/auth" search={{ next }}>
                Sign in to accept
              </Link>
            </Button>
          </>
        )}

        {(state === "ready" || state === "working") && (
          <>
            <p className="mt-2 text-slate-500">
              You're signed in{email ? ` as ${email}` : ""}. Accept to see the event and RSVP.
            </p>
            <div className="mt-6 flex justify-center gap-2">
              <Button className="rounded-full" onClick={() => run("accept")} disabled={state === "working"} data-accept-invite="">
                {state === "working" ? "Working…" : "Accept invitation"}
              </Button>
              <Button variant="ghost" className="rounded-full" onClick={() => run("decline")} disabled={state === "working"}>
                Decline
              </Button>
            </div>
          </>
        )}

        {state === "declined" && (
          <p className="mt-2 text-slate-500">
            You've declined. Changed your mind? Use this link again while the invitation is active.
          </p>
        )}

        {state === "error" && (
          <>
            <p className="mt-2 text-slate-600" data-invite-error="">
              {error}
            </p>
            <Button asChild variant="ghost" className="mt-6 rounded-full">
              <Link to="/events">Back to events</Link>
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
