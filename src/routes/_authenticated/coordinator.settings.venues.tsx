import { createFileRoute } from "@tanstack/react-router";
import { VenueManager } from "@/components/venue-manager";

export const Route = createFileRoute("/_authenticated/coordinator/settings/venues")({
  component: VenuesPage,
  head: () => ({
    meta: [
      { title: "Venue manager — EventHub" },
      { name: "description", content: "Create and manage the venues your community events take place at." },
      { property: "og:title", content: "Venue manager — EventHub" },
      { property: "og:description", content: "Create and manage venues for your event calendar." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function VenuesPage() {
  return (
    <div className="p-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Venues</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Saved venues autofill location and coordinates when you create an event.
          </p>
        </div>
        <VenueManager />
      </div>
    </div>
  );
}
