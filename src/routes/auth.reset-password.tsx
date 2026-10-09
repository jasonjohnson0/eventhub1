import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SiteFooter } from "@/components/site-footer";

export const Route = createFileRoute("/auth/reset-password")({
  ssr: false,
  component: ResetPasswordPage,
  head: () => ({ meta: [{ title: "Set a new password — EventHub" }] }),
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  // The reset link's token lives in the URL hash; supabase-js parses it on
  // load (detectSessionInUrl, on by default) and fires this event once a
  // recovery session is live. Until then there's no valid session to act
  // on, so the form stays disabled rather than letting a stale/invalid
  // link look like it worked.
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setDone(true);
      toast.success("Password updated.");
      setTimeout(() => navigate({ to: "/dashboard", replace: true }), 1500);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update your password");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <div className="flex flex-1 items-center justify-center p-4">
        <div className="w-full max-w-md rounded-lg border bg-card p-8 shadow-sm">
          <h1 className="mb-1 text-2xl font-bold">Set a new password</h1>
          {done ? (
            <p className="mt-4 text-sm text-muted-foreground">
              Your password was updated. Taking you to your dashboard…
            </p>
          ) : !ready ? (
            <p className="mt-4 text-sm text-muted-foreground">
              This reset link is invalid or has expired.{" "}
              <Link to="/auth" className="underline hover:text-foreground">
                Request a new one
              </Link>
              .
            </p>
          ) : (
            <form onSubmit={handleSubmit} className="mt-4 space-y-4">
              <div>
                <Label htmlFor="password">New password</Label>
                <Input
                  id="password"
                  type="password"
                  required
                  minLength={12}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <p className="mt-1 text-xs text-muted-foreground">At least 12 characters.</p>
              </div>
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? "Updating…" : "Update password"}
              </Button>
            </form>
          )}
        </div>
      </div>
      <SiteFooter />
    </div>
  );
}
