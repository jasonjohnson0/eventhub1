import { createFileRoute } from "@tanstack/react-router";
import { CustomFieldManager } from "@/components/custom-field-manager";

export const Route = createFileRoute("/_authenticated/coordinator/settings/custom-fields")({
  component: CustomFieldsPage,
  head: () => ({
    meta: [
      { title: "Custom event fields — EventHub" },
      { name: "description", content: "Define extra fields that appear on your event creation form." },
      { property: "og:title", content: "Custom event fields — EventHub" },
      { property: "og:description", content: "Define extra fields for your event creation form." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function CustomFieldsPage() {
  return (
    <div className="p-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Custom fields</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            These render dynamically in the event modal, with required-field validation.
          </p>
        </div>
        <CustomFieldManager />
      </div>
    </div>
  );
}
