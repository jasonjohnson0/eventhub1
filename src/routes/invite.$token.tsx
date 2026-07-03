import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { acceptStaffInvitation } from "@/lib/workspace.functions";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const Route = createFileRoute("/invite/$token")({
  ssr: false,
  component: InvitePage,
  head: () => ({ meta: [{ title: "Accept invitation — EventHub" }] }),
});

function InvitePage() {
  const { token } = Route.useParams();
  const navigate = useNavigate();
  const [state, setState] = useState<"checking" | "needs_auth" | "ready" | "accepting" | "done" | "error">("checking");
  const [message, setMessage] = useState("");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) setState("needs_auth");
      else setState("ready");
    });
  }, []);

  async function accept() {
    setState("accepting");
    try {
      await acceptStaffInvitation({ data: { token } });
      toast.success("Invitation accepted");
      setState("done");
      setTimeout(() => navigate({ to: "/dashboard" }), 800);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to accept invitation");
      setState("error");
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md rounded-lg border bg-card p-8 shadow-sm">
        <h1 className="mb-4 text-2xl font-bold">Workspace invitation</h1>
        {state === "checking" && <p className="text-sm text-muted-foreground">Checking your session…</p>}
        {state === "needs_auth" && (
          <>
            <p className="mb-4 text-sm text-muted-foreground">
              Sign in with the email address the invitation was sent to.
            </p>
            <Button asChild className="w-full">
              <Link to="/auth" search={{ next: `/invite/${token}` }}>Sign in to continue</Link>
            </Button>
          </>
        )}
        {state === "ready" && (
          <>
            <p className="mb-4 text-sm text-muted-foreground">You've been invited to join a workspace as staff.</p>
            <Button className="w-full" onClick={accept}>Accept invitation</Button>
          </>
        )}
        {state === "accepting" && <p className="text-sm text-muted-foreground">Accepting…</p>}
        {state === "done" && <p className="text-sm text-green-600">Accepted! Redirecting…</p>}
        {state === "error" && (
          <>
            <p className="mb-4 text-sm text-red-600">{message}</p>
            <Button asChild variant="outline" className="w-full">
              <Link to="/">Go home</Link>
            </Button>
          </>
        )}
      </div>
    </div>
  );
}