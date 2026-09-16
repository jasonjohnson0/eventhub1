import { createFileRoute } from "@tanstack/react-router";
import { BrandingSettings } from "@/components/branding-settings";

export const Route = createFileRoute("/_authenticated/coordinator/settings/branding")({
  component: BrandingPage,
  head: () => ({
    meta: [
      { title: "Branding — EventHub" },
      {
        name: "description",
        content: "Set your brand colors and custom CSS for your public calendar and embed.",
      },
      { property: "og:title", content: "Branding — EventHub" },
      { property: "og:description", content: "Colors and custom CSS for your community calendar." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function BrandingPage() {
  return (
    <div className="p-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Branding</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Colors and custom CSS for your public calendar and embed. Prefer a one-click holiday
            look instead? See{" "}
            <a href="/coordinator/settings/styling" className="underline underline-offset-2">
              Styling
            </a>
            .
          </p>
        </div>
        <BrandingSettings />
      </div>
    </div>
  );
}
