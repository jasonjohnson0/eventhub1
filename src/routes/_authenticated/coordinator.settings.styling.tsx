import { createFileRoute } from "@tanstack/react-router";
import { HolidayStylingManager } from "@/components/holiday-styling-manager";

export const Route = createFileRoute("/_authenticated/coordinator/settings/styling")({
  component: StylingPage,
  head: () => ({
    meta: [
      { title: "Calendar styling — EventHub" },
      {
        name: "description",
        content: "Pick a holiday look for your public calendar -- no CSS required.",
      },
      { property: "og:title", content: "Calendar styling — EventHub" },
      { property: "og:description", content: "Pick a holiday look for your public calendar." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function StylingPage() {
  return (
    <div className="p-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Calendar styling</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Pick a holiday look for your public calendar and embed. One click, no CSS needed --
            change it as often as you like.
          </p>
        </div>
        <HolidayStylingManager />
      </div>
    </div>
  );
}
