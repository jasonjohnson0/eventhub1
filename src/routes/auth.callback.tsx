import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth/callback")({
  ssr: false,
  component: AuthCallback,
});

function safeNext(next: string | null | undefined): string {
  if (!next) return "/dashboard";
  try {
    const url = new URL(next, window.location.origin);
    if (url.origin !== window.location.origin) return "/dashboard";
    return url.pathname + url.search + url.hash;
  } catch {
    return "/dashboard";
  }
}

function AuthCallback() {
  const navigate = useNavigate();
  useEffect(() => {
    const stored = sessionStorage.getItem("eh:post_auth_next");
    sessionStorage.removeItem("eh:post_auth_next");
    const params = new URLSearchParams(window.location.search);
    const explicitNext = params.get("next") ?? stored;

    // A first-time signup with no explicit `next` (i.e. not a deep link back
    // into something specific) routes on the intent chosen at signup, so
    // picking "Run a calendar" actually lands in onboarding instead of the
    // attendee-facing default.
    function targetFor(session: { user: { user_metadata?: Record<string, unknown> } } | null) {
      if (explicitNext) return safeNext(explicitNext);
      if (session?.user.user_metadata?.intent === "organizer") return "/onboarding";
      return safeNext(explicitNext);
    }

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) navigate({ to: targetFor(session), replace: true });
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: targetFor(data.session), replace: true });
    });
    return () => {
      sub.subscription.unsubscribe();
    };
  }, [navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <p className="text-sm text-muted-foreground">Signing you in…</p>
    </div>
  );
}