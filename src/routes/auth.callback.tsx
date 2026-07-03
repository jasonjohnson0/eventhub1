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
    const target = safeNext(params.get("next") ?? stored);

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) navigate({ to: target, replace: true });
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: target, replace: true });
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