import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSignedIn(!!data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSignedIn(!!s));
    return () => sub.subscription.unsubscribe();
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-fuchsia-50 via-white to-sky-50">
      <header className="mx-auto flex max-w-6xl items-center justify-between p-6">
        <h1 className="text-2xl font-bold tracking-tight">EventHub</h1>
        <nav className="flex gap-3">
          {signedIn ? (
            <Button asChild><Link to="/dashboard">Dashboard</Link></Button>
          ) : (
            <Button asChild><Link to="/auth">Sign in</Link></Button>
          )}
        </nav>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-24 text-center">
        <h2 className="text-5xl font-bold tracking-tight">
          A colorful, interactive event calendar
        </h2>
        <p className="mx-auto mt-6 max-w-xl text-lg text-muted-foreground">
          EventHub gives coordinators a beautiful calendar, workspace staff, RSVPs, sharing, and sponsorship tools — all in one place.
        </p>
        <div className="mt-10 flex justify-center gap-3">
          <Button asChild size="lg">
            <Link to={signedIn ? "/dashboard" : "/auth"}>{signedIn ? "Open dashboard" : "Get started"}</Link>
          </Button>
        </div>
        <p className="mt-16 text-xs uppercase tracking-widest text-muted-foreground">
          Phase 1a scaffolding · Calendar and admin dashboard land next
        </p>
      </main>
    </div>
  );
}
