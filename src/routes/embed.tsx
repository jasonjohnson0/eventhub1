import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { Code2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getCoordinatorProfile } from "@/lib/onboarding.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export const Route = createFileRoute("/embed")({
  ssr: false,
  // A bare `/embed` used to 404 -- there was no page at this URL at all,
  // only the signed-in settings page at /coordinator/settings/embed. A
  // live coordinator who bookmarks or guesses this URL should land on their
  // actual embed code; everyone else gets an explainer instead of a 404.
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) return;
    const profile = await getCoordinatorProfile().catch(() => null);
    if (profile?.setup_completed_at) {
      throw redirect({ to: "/coordinator/settings/embed" });
    }
  },
  component: EmbedExplainer,
  head: () => ({
    meta: [
      { title: "Embed your calendar — EventHub" },
      {
        name: "description",
        content: "Add a live EventHub calendar to your own website with a shortcode or iframe.",
      },
    ],
  }),
});

function EmbedExplainer() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-6">
      <Card className="w-full max-w-lg text-center">
        <CardContent className="space-y-5 p-10">
          <Code2 className="mx-auto h-10 w-10 text-primary" />
          <h1 className="text-2xl font-bold">Embed a calendar on your site</h1>
          <p className="text-muted-foreground">
            Every EventHub coordinator gets a ready-to-paste WordPress shortcode and iframe
            snippet for their own calendar. Sign in to a coordinator account to get yours.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Button asChild>
              <Link to="/auth" search={{ next: "/coordinator/settings/embed" }}>
                Sign in
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/onboarding">Set up a calendar</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
