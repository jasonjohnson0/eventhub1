import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SiteFooter } from "@/components/site-footer";
import { toast } from "sonner";

const searchSchema = z.object({
  next: z.string().optional(),
  // Lets /sign-up (and anything else) land directly on the signup tab
  // instead of defaulting to sign-in and making people click through.
  mode: z.enum(["signin", "signup"]).optional(),
});

// A dropped connection doesn't always fail fast -- a request that goes into
// a network black hole can leave the button reading "Please wait…"
// indefinitely, with nothing telling the visitor anything went wrong. This
// caps how long any single auth call is allowed to hang before we give up
// and say so, rather than leaving that entirely up to the browser's own
// (much longer, and inconsistent across networks) connection timeout.
const AUTH_TIMEOUT_MS = 15_000;
class AuthTimeoutError extends Error {}

function withTimeout<T>(promise: Promise<T>, ms = AUTH_TIMEOUT_MS): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new AuthTimeoutError("Taking longer than expected — check your connection and try again.")),
      ms,
    );
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

function authErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof AuthTimeoutError) return err.message;
  return err instanceof Error ? err.message : fallback;
}

function safeNext(next: string | undefined): string {
  if (!next) return "/dashboard";
  try {
    const url = new URL(next, window.location.origin);
    if (url.origin !== window.location.origin) return "/dashboard";
    return url.pathname + url.search + url.hash;
  } catch {
    return "/dashboard";
  }
}

export const Route = createFileRoute("/auth")({
  validateSearch: (s) => searchSchema.parse(s),
  component: AuthPage,
  head: () => ({ meta: [{ title: "Sign in — EventHub" }] }),
});

function AuthPage() {
  const { next, mode: initialMode } = Route.useSearch();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">(initialMode ?? "signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  // What this account is mainly here to do -- there's no "attendee" flag
  // anywhere else in the data model, so this is what sets it. It's stored
  // on the user and read back in /auth/callback to route first-time
  // organizers into onboarding instead of the attendee-facing calendar.
  const [intent, setIntent] = useState<"attendee" | "organizer">("attendee");
  const [loading, setLoading] = useState(false);
  // Signup only ever issues a session once the confirmation link is clicked --
  // there is no code-level way to skip that, since it's a Supabase Auth/SMTP
  // setting, not something this app controls. What we can do is make it easy
  // to ask for the email again if the first one never arrived or got lost.
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [resending, setResending] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: safeNext(next), replace: true });
    });
  }, [next, navigate]);

  async function handleEmail(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await withTimeout(
          supabase.auth.signUp({
            email,
            password,
            options: {
              emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next ?? "/dashboard")}`,
              data: { full_name: fullName.trim(), intent },
            },
          }),
        );
        if (error) throw error;
        setPendingEmail(email);
        toast.success("Check your email to confirm your account.");
      } else {
        const { error } = await withTimeout(supabase.auth.signInWithPassword({ email, password }));
        if (error) throw error;
        navigate({ to: safeNext(next), replace: true });
      }
    } catch (err) {
      toast.error(authErrorMessage(err, "Authentication failed"));
    } finally {
      setLoading(false);
    }
  }

  async function handleResendConfirmation() {
    if (!pendingEmail) return;
    setResending(true);
    try {
      const { error } = await withTimeout(supabase.auth.resend({ type: "signup", email: pendingEmail }));
      if (error) throw error;
      toast.success("Confirmation email sent again.");
    } catch (err) {
      toast.error(authErrorMessage(err, "Could not resend the email"));
    } finally {
      setResending(false);
    }
  }

  async function handleOAuth(provider: "google" | "apple") {
    setLoading(true);
    try {
      if (next) sessionStorage.setItem("eh:post_auth_next", next);
      const result = await lovable.auth.signInWithOAuth(provider, {
        redirect_uri: `${window.location.origin}/auth/callback`,
      });
      if (result.error) {
        toast.error(result.error.message ?? "Sign-in failed");
        setLoading(false);
        return;
      }
      if (!result.redirected) {
        // popup path (preview) — session already set
        navigate({ to: safeNext(next), replace: true });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sign-in failed");
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <div className="flex flex-1 items-center justify-center p-4">
      <div className="w-full max-w-md rounded-lg border bg-card p-8 shadow-sm">
        <h1 className="mb-1 text-2xl font-bold">EventHub</h1>
        <p className="mb-6 text-sm text-muted-foreground">
          {mode === "signin" ? "Sign in to your account" : "Create your account"}
        </p>

        <div className="space-y-2">
          <Button variant="outline" className="w-full" disabled={loading} onClick={() => handleOAuth("google")}>
            Continue with Google
          </Button>
          <Button variant="outline" className="w-full" disabled={loading} onClick={() => handleOAuth("apple")}>
            Continue with Apple
          </Button>
        </div>

        <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
          <div className="h-px flex-1 bg-border" /> or <div className="h-px flex-1 bg-border" />
        </div>

        <form onSubmit={handleEmail} className="space-y-4">
          {mode === "signup" && (
            <div>
              <Label htmlFor="fullName">Name</Label>
              <Input
                id="fullName"
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
              />
            </div>
          )}
          <div>
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              required
              minLength={mode === "signup" ? 12 : 8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {mode === "signup" && (
              <p className="mt-1 text-xs text-muted-foreground">At least 12 characters.</p>
            )}
          </div>
          {mode === "signup" && (
            <div>
              <Label>What are you here to do?</Label>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setIntent("attendee")}
                  className={`rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                    intent === "attendee"
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-input text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Find events
                </button>
                <button
                  type="button"
                  onClick={() => setIntent("organizer")}
                  className={`rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                    intent === "organizer"
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-input text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Run a calendar
                </button>
              </div>
            </div>
          )}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
          </Button>
          {mode === "signup" && (
            <p className="text-center text-xs text-muted-foreground">
              By creating an account you agree to our{" "}
              <Link to="/terms" className="underline hover:text-foreground">
                Terms
              </Link>{" "}
              and{" "}
              <Link to="/privacy" className="underline hover:text-foreground">
                Privacy Policy
              </Link>
              .
            </p>
          )}
        </form>

        {pendingEmail && (
          <div className="mt-4 rounded-md border border-border bg-muted/40 p-3 text-sm">
            <p className="text-muted-foreground">
              We sent a confirmation link to{" "}
              <span className="font-medium text-foreground">{pendingEmail}</span>. Click it to
              finish creating your account.
            </p>
            <button
              type="button"
              onClick={handleResendConfirmation}
              disabled={resending}
              className="mt-2 text-sm font-medium text-primary hover:underline disabled:opacity-50"
            >
              {resending ? "Sending…" : "Resend confirmation email"}
            </button>
          </div>
        )}

        <button
          type="button"
          onClick={() => {
            setMode((m) => (m === "signin" ? "signup" : "signin"));
            setPendingEmail(null);
          }}
          className="mt-4 w-full text-center text-sm text-muted-foreground hover:text-foreground"
        >
          {mode === "signin" ? "Need an account? Sign up" : "Already have an account? Sign in"}
        </button>
      </div>
      </div>
      <SiteFooter />
    </div>
  );
}