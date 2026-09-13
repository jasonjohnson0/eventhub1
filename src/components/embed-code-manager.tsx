import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Code2, Copy, Loader2, ExternalLink } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getCoordinatorProfile, type CoordinatorProfile } from "@/lib/onboarding.functions";
import { siteOrigin } from "@/lib/site-url";

type View = "month" | "week" | "list" | "agenda";
const VIEWS: { value: View; label: string }[] = [
  { value: "month", label: "Month" },
  { value: "week", label: "Week" },
  { value: "list", label: "List" },
  { value: "agenda", label: "Agenda" },
];

function CodeField({ label, hint, value }: { label: string; hint?: string; value: string }) {
  async function copy() {
    await navigator.clipboard.writeText(value);
    toast.success("Copied");
  }
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="flex items-start gap-2">
        <pre className="min-w-0 flex-1 overflow-x-auto rounded-md border bg-muted/40 p-3 font-mono text-xs">
          {value}
        </pre>
        <Button type="button" size="sm" variant="outline" onClick={copy} className="shrink-0">
          <Copy className="mr-1 h-3.5 w-3.5" /> Copy
        </Button>
      </div>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/**
 * Generates ready-to-paste embed code for a coordinator's own calendar, in
 * whatever colors/preset they've picked under Styling -- the WordPress
 * shortcode and the plain iframe both point at the same rendered look as
 * `/c/$slug`, since both read the same `primary_color`/`secondary_color`.
 */
export function EmbedCodeManager() {
  const [profile, setProfile] = useState<CoordinatorProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>("month");

  useEffect(() => {
    getCoordinatorProfile()
      .then(setProfile)
      .catch(() => setProfile(null))
      .finally(() => setLoading(false));
  }, []);

  const base = siteOrigin();
  const slug = profile?.slug ?? "";
  const live = Boolean(profile?.setup_completed_at && slug);

  const { calendarUrl, fragmentUrl, shortcode, iframeSnippet } = useMemo(() => {
    const calendarUrl = `${base}/c/${encodeURIComponent(slug)}`;
    const fragmentUrl = `${base}/api/embed/${encodeURIComponent(slug)}${view === "month" ? "" : `?view=${view}`}`;
    const shortcode =
      view === "month"
        ? `[eventhub_calendar slug="${slug}"]`
        : `[eventhub_calendar slug="${slug}" view="${view}"]`;
    const iframeSnippet = `<iframe src="${calendarUrl}" width="100%" height="800" style="border:0" title="Event calendar"></iframe>`;
    return { calendarUrl, fragmentUrl, shortcode, iframeSnippet };
  }, [base, slug, view]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading your embed code…
      </div>
    );
  }

  if (!live) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">
          Finish setting a calendar address before you can embed it --{" "}
          <a href="/onboarding" className="font-medium underline underline-offset-2">
            go to the Address step
          </a>
          .
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Code2 className="h-4 w-4" /> Embed your calendar
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="max-w-xs space-y-1.5">
            <Label>Starting view</Label>
            <Select value={view} onValueChange={(v) => setView(v as View)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {VIEWS.map((v) => (
                  <SelectItem key={v.value} value={v.value}>
                    {v.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Whatever look you've picked under Styling shows up here too -- the embed reads
              the same colors as your calendar on EventHub.
            </p>
          </div>

          <CodeField
            label="WordPress"
            hint={
              'Install the EventHub Calendar plugin (Plugins → Add New → Upload Plugin), set the host under Settings → EventHub Calendar, then paste this shortcode into any page or post.'
            }
            value={shortcode}
          />

          <CodeField
            label="Any other website"
            hint="Paste this directly into your page's HTML. Works anywhere that accepts a snippet -- Squarespace, Wix, a plain HTML page, etc."
            value={iframeSnippet}
          />

          <CodeField
            label="Raw fragment URL"
            hint="For a site that can include HTML server-side (PHP, a static-site build, …), fetching this URL yourself gets your events into that page's own HTML -- indexable by search engines, and immune to your visitors' ad blockers -- the same way the WordPress plugin does."
            value={fragmentUrl}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Live preview</CardTitle>
          <Button asChild size="sm" variant="outline">
            <a href={calendarUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="mr-1 h-3.5 w-3.5" /> Open full calendar
            </a>
          </Button>
        </CardHeader>
        <CardContent>
          <div className="overflow-hidden rounded-lg border">
            <iframe
              key={fragmentUrl}
              src={fragmentUrl}
              title="Embed preview"
              className="h-[600px] w-full"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
