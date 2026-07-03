import { createFileRoute, Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
  head: () => ({ meta: [{ title: "Dashboard — EventHub" }] }),
});

function Dashboard() {
  const { user } = Route.useRouteContext() as { user: { email?: string } };
  return (
    <div className="min-h-screen bg-background p-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">Welcome{user.email ? `, ${user.email}` : ""}</h1>
          <Button
            variant="outline"
            onClick={async () => {
              await supabase.auth.signOut();
              window.location.href = "/";
            }}
          >
            Sign out
          </Button>
        </div>
        <p className="text-muted-foreground">
          Phase 1a scaffolding is live. Calendar, event management, sponsorship, and admin dashboards land in Phase 1c.
        </p>
        <div className="flex gap-3">
          <Button asChild>
            <Link to="/">Home</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}