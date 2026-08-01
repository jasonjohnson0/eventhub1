import { createFileRoute } from "@tanstack/react-router";
import { OrganizerManager } from "@/components/organizer-manager";

export const Route = createFileRoute("/_authenticated/coordinator/settings/organizers")({
  component: OrganizersPage,
  head: () => ({
    meta: [
      { title: "Organizer profiles — EventHub" },
      { name: "description", content: "Manage organizer and speaker profiles you can attach to events." },
      { property: "og:title", content: "Organizer profiles — EventHub" },
      { property: "og:description", content: "Manage organizer and speaker profiles for your events." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function OrganizersPage() {
  return (
    <div className="p-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Organizers & speakers</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Assign up to five organizers per event from these profiles.
          </p>
        </div>
        <OrganizerManager />
      </div>
    </div>
  );
}
