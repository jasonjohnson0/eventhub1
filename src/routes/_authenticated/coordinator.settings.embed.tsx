import { createFileRoute } from "@tanstack/react-router";
import { EmbedCodeManager } from "@/components/embed-code-manager";

export const Route = createFileRoute("/_authenticated/coordinator/settings/embed")({
  component: EmbedPage,
  head: () => ({
    meta: [
      { title: "Embed your calendar — EventHub" },
      {
        name: "description",
        content: "Get ready-to-paste WordPress and website embed code for your public calendar.",
      },
      { property: "og:title", content: "Embed your calendar — EventHub" },
      {
        property: "og:description",
        content: "WordPress shortcode, iframe snippet, and a live preview for your calendar.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function EmbedPage() {
  return (
    <div className="p-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Embed your calendar</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Copy-paste code for your own website, styled to match your calendar on EventHub.
          </p>
        </div>
        <EmbedCodeManager />
      </div>
    </div>
  );
}
