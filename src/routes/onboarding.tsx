import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import confetti from "canvas-confetti";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Globe,
  Loader2,
  Mail,
  Palette,
  PartyPopper,
  Server,
  Sparkles,
  User,
  Upload,
  CreditCard,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  getCoordinatorProfile,
  saveCoordinatorProfile,
  checkSlugAvailable,
  completeOnboarding,
  type CoordinatorProfile,
} from "@/lib/onboarding.functions";
import { savePlatformConfig, saveCustomStripeKeys } from "@/lib/setup.functions";
import { NAMESERVERS, dnsRecordsFor } from "@/lib/dns-records";

export const Route = createFileRoute("/onboarding")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({ to: "/auth", search: { next: "/onboarding" } });
    }
  },
  component: OnboardingWizard,
  head: () => ({
    meta: [
      { title: "Coordinator setup wizard — EventHub" },
      {
        name: "description",
        content:
          "Set up your EventHub community calendar: profile, branding, address, email delivery, payments and DNS — in a few guided steps.",
      },
      { property: "og:title", content: "Coordinator setup wizard — EventHub" },
      {
        property: "og:description",
        content: "Guided setup for your community event calendar on EventHub.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

const STEPS = [
  { id: 1, title: "Profile", icon: User, hint: "Who runs this calendar" },
  { id: 2, title: "Branding", icon: Palette, hint: "Colors & logo" },
  { id: 3, title: "Address", icon: Globe, hint: "Your calendar URL" },
  { id: 4, title: "Email", icon: Mail, hint: "How invites are sent" },
  { id: 5, title: "Payments", icon: CreditCard, hint: "Ticket money" },
  { id: 6, title: "DNS", icon: Server, hint: "Records for reference" },
  { id: 7, title: "Review", icon: Sparkles, hint: "Go live" },
] as const;

const OPTIONAL_STEPS = new Set([2, 4, 5, 6]);

type Draft = Partial<CoordinatorProfile>;

function OnboardingWizard() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<CoordinatorProfile | null>(null);
  const [draft, setDraft] = useState<Draft>({});
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [slugState, setSlugState] = useState<"idle" | "checking" | "ok" | "taken" | "invalid">(
    "idle",
  );
  const [uploading, setUploading] = useState<"logo" | "favicon" | null>(null);
  const [done, setDone] = useState(false);

  // Email / Stripe step-local state (stored via platform config)
  const [emailApiKey, setEmailApiKey] = useState("");
  const [emailFromName, setEmailFromName] = useState("");
  const [emailFromAddress, setEmailFromAddress] = useState("");
  const [mailgunDomain, setMailgunDomain] = useState("");
  const [stripeSecret, setStripeSecret] = useState("");
  const [stripePublishable, setStripePublishable] = useState("");

  const value = useCallback(
    <K extends keyof CoordinatorProfile>(key: K): CoordinatorProfile[K] | undefined =>
      (draft[key] ?? profile?.[key]) as CoordinatorProfile[K] | undefined,
    [draft, profile],
  );

  useEffect(() => {
    (async () => {
      try {
        const p = await getCoordinatorProfile();
        setProfile(p);
        setStep(p.setup_completed_at ? 7 : Math.min(Math.max(p.setup_step, 1), 7));
        setEmailFromName(p.company_name ?? "");
        setEmailFromAddress(p.contact_email ?? "");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not load your setup");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const persist = useCallback(
    async (patch: Draft, opts?: { silent?: boolean }) => {
      setSaving(true);
      try {
        const updated = await saveCoordinatorProfile({ data: patch as never });
        setProfile(updated);
        setDraft((d) => {
          const next = { ...d };
          for (const k of Object.keys(patch)) delete next[k as keyof Draft];
          return next;
        });
        setSavedAt(new Date().toLocaleTimeString());
        return true;
      } catch (e) {
        if (!opts?.silent) toast.error(e instanceof Error ? e.message : "Could not save");
        return false;
      } finally {
        setSaving(false);
      }
    },
    [],
  );

  // Auto-save the draft ~1.2s after typing stops.
  const draftRef = useRef(draft);
  draftRef.current = draft;
  useEffect(() => {
    if (Object.keys(draft).length === 0) return;
    const t = setTimeout(() => {
      void persist(draftRef.current, { silent: true });
    }, 1200);
    return () => clearTimeout(t);
  }, [draft, persist]);

  const set = <K extends keyof CoordinatorProfile>(key: K, v: CoordinatorProfile[K]) =>
    setDraft((d) => ({ ...d, [key]: v }));

  // Slug availability
  const slug = (value("slug") ?? "") as string;
  useEffect(() => {
    if (!slug) return setSlugState("idle");
    if (!/^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/.test(slug)) return setSlugState("invalid");
    setSlugState("checking");
    const t = setTimeout(async () => {
      try {
        const { available } = await checkSlugAvailable({ data: { slug } });
        setSlugState(available ? "ok" : "taken");
      } catch {
        setSlugState("idle");
      }
    }, 500);
    return () => clearTimeout(t);
  }, [slug]);

  const uploadFile = async (kind: "logo" | "favicon", file: File) => {
    setUploading(kind);
    try {
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes.user?.id;
      if (!uid) throw new Error("Not signed in");
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "png";
      const path = `${uid}/${kind}-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("branding").upload(path, file, { upsert: true });
      if (error) throw error;
      const { data: signed, error: signErr } = await supabase.storage
        .from("branding")
        .createSignedUrl(path, 60 * 60 * 24 * 365);
      if (signErr) throw signErr;
      const url = signed?.signedUrl ?? null;
      await persist(kind === "logo" ? { logo_url: url } : { favicon_url: url });
      toast.success(`${kind === "logo" ? "Logo" : "Favicon"} uploaded`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(null);
    }
  };

  const goTo = async (next: number) => {
    const bounded = Math.min(Math.max(next, 1), 7);
    await persist({ ...draft, setup_step: bounded });
    setStep(bounded);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const saveEmailStep = async () => {
    const provider = (value("email_provider") ?? "lovable") as CoordinatorProfile["email_provider"];
    await persist({ email_provider: provider });
    if (provider === "lovable" || provider === "none") return goTo(5);
    try {
      await savePlatformConfig({
        data: {
          provider,
          api_key: emailApiKey || null,
          from_name: emailFromName || null,
          from_address: emailFromAddress || null,
          mailgun_domain: mailgunDomain || null,
        } as never,
      });
      toast.success("Email provider saved");
    } catch (e) {
      toast.message("Saved your choice", {
        description:
          e instanceof Error && /admin/i.test(e.message)
            ? "Provider keys can only be stored by a platform admin — we kept your selection."
            : e instanceof Error
              ? e.message
              : undefined,
      });
    }
    return goTo(5);
  };

  const saveStripeStep = async () => {
    if (!stripeSecret && !stripePublishable) return goTo(6);
    try {
      await saveCustomStripeKeys({
        data: { secret_key: stripeSecret || null, publishable_key: stripePublishable } as never,
      });
      toast.success("Stripe keys saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save Stripe keys");
      return;
    }
    return goTo(6);
  };

  const finish = async () => {
    setSaving(true);
    try {
      await persist(draft);
      await completeOnboarding();
      confetti({ particleCount: 160, spread: 90, origin: { y: 0.6 } });
      setDone(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not activate");
    } finally {
      setSaving(false);
    }
  };

  const primary = (value("primary_color") ?? "#f97316") as string;
  const secondary = (value("secondary_color") ?? "#06b6d4") as string;
  const records = useMemo(
    () => dnsRecordsFor((value("custom_domain") ?? "") as string),
    [value],
  );

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/30">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (done) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/30 p-6">
        <Card className="w-full max-w-lg text-center">
          <CardContent className="space-y-5 p-10">
            <PartyPopper className="mx-auto h-12 w-12 text-primary" />
            <h1 className="text-3xl font-bold">🎉 Your calendar is live!</h1>
            <p className="text-muted-foreground">
              {(value("company_name") as string) || "Your community calendar"} is ready for events.
            </p>
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
              <Button onClick={() => navigate({ to: "/dashboard" })}>Go to dashboard</Button>
              <Button variant="outline" onClick={() => navigate({ to: "/events" })}>
                View public calendar
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const current = STEPS[step - 1];

  return (
    <div className="min-h-screen bg-muted/30">
      <div
        className="h-2 w-full"
        style={{ background: `linear-gradient(90deg, ${primary}, ${secondary})` }}
      />
      <div className="mx-auto max-w-4xl px-4 py-8">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Coordinator setup</h1>
            <p className="text-sm text-muted-foreground">
              Step {step} of {STEPS.length} — {current.hint}
            </p>
          </div>
          <div className="text-right text-xs text-muted-foreground">
            {saving ? (
              <span className="inline-flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" /> Saving…
              </span>
            ) : savedAt ? (
              <span className="inline-flex items-center gap-1">
                <Check className="h-3 w-3" /> Progress saved {savedAt}
              </span>
            ) : (
              "Progress saves automatically"
            )}
          </div>
        </header>

        <Progress value={(step / STEPS.length) * 100} className="mb-5 h-2" />

        <ol className="mb-6 flex flex-wrap gap-2">
          {STEPS.map((s) => {
            const Icon = s.icon;
            const state = s.id === step ? "current" : s.id < step ? "done" : "todo";
            return (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => goTo(s.id)}
                  className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                    state === "current"
                      ? "border-transparent text-primary-foreground shadow"
                      : state === "done"
                        ? "border-primary/40 bg-primary/10 text-foreground"
                        : "bg-background text-muted-foreground"
                  }`}
                  style={state === "current" ? { background: primary } : undefined}
                >
                  {state === "done" ? <Check className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}
                  {s.title}
                </button>
              </li>
            );
          })}
        </ol>

        <Card>
          <CardContent className="space-y-6 p-6">
            {step === 1 && (
              <section className="space-y-4">
                <StepTitle title="Tell us about you" subtitle="Shown on your public calendar." />
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Your name">
                    <Input
                      value={(value("full_name") ?? "") as string}
                      onChange={(e) => set("full_name", e.target.value)}
                      placeholder="Jane Coordinator"
                    />
                  </Field>
                  <Field label="Contact email">
                    <Input
                      type="email"
                      value={(value("contact_email") ?? "") as string}
                      onChange={(e) => set("contact_email", e.target.value)}
                      placeholder="events@chamber.org"
                    />
                  </Field>
                </div>
                <Field label="Organization / chamber name">
                  <Input
                    value={(value("company_name") ?? "") as string}
                    onChange={(e) => set("company_name", e.target.value)}
                    placeholder="Jackson County Chamber of Commerce"
                  />
                </Field>
                <Field label="Description" hint="A short intro for visitors (optional)">
                  <Textarea
                    rows={4}
                    value={(value("description") ?? "") as string}
                    onChange={(e) => set("description", e.target.value)}
                    placeholder="Community events across Jackson County, Florida."
                  />
                </Field>
              </section>
            )}

            {step === 2 && (
              <section className="space-y-5">
                <StepTitle title="Make it yours" subtitle="Colors and imagery for your calendar." />
                <div className="grid gap-4 sm:grid-cols-2">
                  <ColorField
                    label="Primary color"
                    value={primary}
                    onChange={(v) => set("primary_color", v)}
                  />
                  <ColorField
                    label="Secondary color"
                    value={secondary}
                    onChange={(v) => set("secondary_color", v)}
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <UploadField
                    label="Logo"
                    url={(value("logo_url") ?? null) as string | null}
                    busy={uploading === "logo"}
                    onFile={(f) => uploadFile("logo", f)}
                    onClear={() => persist({ logo_url: null })}
                  />
                  <UploadField
                    label="Favicon"
                    url={(value("favicon_url") ?? null) as string | null}
                    busy={uploading === "favicon"}
                    onFile={(f) => uploadFile("favicon", f)}
                    onClear={() => persist({ favicon_url: null })}
                  />
                </div>
                <div
                  className="rounded-xl p-6 text-center text-white shadow"
                  style={{ background: `linear-gradient(135deg, ${primary}, ${secondary})` }}
                >
                  <p className="text-sm opacity-90">Preview</p>
                  <p className="text-xl font-bold">
                    {(value("company_name") as string) || "Your community calendar"}
                  </p>
                </div>
              </section>
            )}

            {step === 3 && (
              <section className="space-y-4">
                <StepTitle title="Pick your address" subtitle="Where people find your calendar." />
                <Field label="Subdomain / slug">
                  <div className="flex items-center gap-2">
                    <Input
                      value={slug}
                      onChange={(e) => set("slug", e.target.value.toLowerCase().trim())}
                      placeholder="jackson-county"
                    />
                    <span className="whitespace-nowrap text-sm text-muted-foreground">
                      .lovable.app
                    </span>
                  </div>
                </Field>
                <div className="text-sm">
                  {slugState === "checking" && <span className="text-muted-foreground">Checking…</span>}
                  {slugState === "ok" && <span className="text-primary">✅ {slug} is available</span>}
                  {slugState === "taken" && <span className="text-destructive">Already taken</span>}
                  {slugState === "invalid" && (
                    <span className="text-destructive">
                      3–40 characters, lowercase letters, numbers and hyphens
                    </span>
                  )}
                </div>
                <Separator />
                <Field label="Custom domain (optional)" hint="Add DNS records in the next steps.">
                  <Input
                    value={(value("custom_domain") ?? "") as string}
                    onChange={(e) => set("custom_domain", e.target.value.toLowerCase().trim())}
                    placeholder="events.mychamber.org"
                  />
                </Field>
              </section>
            )}

            {step === 4 && (
              <section className="space-y-4">
                <StepTitle
                  title="Email delivery"
                  subtitle="Used for invitations, reminders and receipts."
                />
                <RadioGroup
                  value={(value("email_provider") ?? "lovable") as string}
                  onValueChange={(v) => set("email_provider", v as CoordinatorProfile["email_provider"])}
                  className="grid gap-3 sm:grid-cols-2"
                >
                  {[
                    { id: "lovable", label: "Built-in email", hint: "No setup — recommended" },
                    { id: "sendgrid", label: "SendGrid", hint: "Bring your API key" },
                    { id: "postmark", label: "Postmark", hint: "Server token" },
                    { id: "mailgun", label: "Mailgun", hint: "API key + domain" },
                  ].map((p) => (
                    <Label
                      key={p.id}
                      htmlFor={`provider-${p.id}`}
                      className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 hover:bg-accent/40"
                    >
                      <RadioGroupItem id={`provider-${p.id}`} value={p.id} className="mt-1" />
                      <span>
                        <span className="block font-medium">{p.label}</span>
                        <span className="block text-xs text-muted-foreground">{p.hint}</span>
                      </span>
                    </Label>
                  ))}
                </RadioGroup>

                {["sendgrid", "postmark", "mailgun"].includes(
                  (value("email_provider") ?? "lovable") as string,
                ) && (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="API key">
                      <Input
                        type="password"
                        value={emailApiKey}
                        onChange={(e) => setEmailApiKey(e.target.value)}
                        placeholder="••••••••"
                      />
                    </Field>
                    <Field label="From name">
                      <Input value={emailFromName} onChange={(e) => setEmailFromName(e.target.value)} />
                    </Field>
                    <Field label="From address">
                      <Input
                        type="email"
                        value={emailFromAddress}
                        onChange={(e) => setEmailFromAddress(e.target.value)}
                      />
                    </Field>
                    {value("email_provider") === "mailgun" && (
                      <Field label="Mailgun domain">
                        <Input
                          value={mailgunDomain}
                          onChange={(e) => setMailgunDomain(e.target.value)}
                          placeholder="mg.mychamber.org"
                        />
                      </Field>
                    )}
                  </div>
                )}
              </section>
            )}

            {step === 5 && (
              <section className="space-y-4">
                <StepTitle
                  title="Payments"
                  subtitle="Paid tickets run on the platform Stripe account by default."
                />
                <div className="rounded-lg border bg-accent/30 p-4 text-sm">
                  <Badge className="mb-2">Default</Badge>
                  <p>
                    Leave this blank to use the built-in EventHub Stripe account. Add your own keys
                    only if payouts should land in your Stripe account.
                  </p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Stripe secret key">
                    <Input
                      type="password"
                      value={stripeSecret}
                      onChange={(e) => setStripeSecret(e.target.value)}
                      placeholder="sk_live_…"
                    />
                  </Field>
                  <Field label="Stripe publishable key">
                    <Input
                      value={stripePublishable}
                      onChange={(e) => setStripePublishable(e.target.value)}
                      placeholder="pk_live_…"
                    />
                  </Field>
                </div>
              </section>
            )}

            {step === 6 && (
              <section className="space-y-4">
                <StepTitle
                  title="DNS reference"
                  subtitle="Add these at your registrar if you use a custom domain."
                />
                <div className="rounded-lg border p-4 text-sm">
                  <p className="mb-2 font-medium">Nameservers</p>
                  <div className="flex flex-wrap gap-2">
                    {NAMESERVERS.map((ns) => (
                      <CopyChip key={ns} text={ns} />
                    ))}
                  </div>
                </div>
                <div className="overflow-x-auto rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Type</TableHead>
                        <TableHead>Host</TableHead>
                        <TableHead>Value</TableHead>
                        <TableHead>TTL</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {records.map((r) => (
                        <TableRow key={`${r.type}-${r.host}-${r.value}`}>
                          <TableCell className="font-mono text-xs">{r.type}</TableCell>
                          <TableCell className="font-mono text-xs">{r.host}</TableCell>
                          <TableCell className="font-mono text-xs break-all">
                            {r.value}
                            {r.note ? (
                              <span className="block font-sans text-[11px] text-muted-foreground">
                                {r.note}
                              </span>
                            ) : null}
                          </TableCell>
                          <TableCell className="font-mono text-xs">{r.ttl}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <Label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={!!value("dns_records_acknowledged")}
                    onCheckedChange={(c) => set("dns_records_acknowledged", c === true)}
                  />
                  I&apos;ve reviewed these records
                </Label>
              </section>
            )}

            {step === 7 && (
              <section className="space-y-4">
                <StepTitle title="Review & activate" subtitle="Everything look right?" />
                <dl className="grid gap-3 sm:grid-cols-2">
                  <Summary label="Name" value={(value("full_name") as string) || "—"} />
                  <Summary label="Email" value={(value("contact_email") as string) || "—"} />
                  <Summary label="Organization" value={(value("company_name") as string) || "—"} />
                  <Summary label="Address" value={slug ? `${slug}.lovable.app` : "—"} />
                  <Summary label="Custom domain" value={(value("custom_domain") as string) || "—"} />
                  <Summary
                    label="Email provider"
                    value={(value("email_provider") as string) || "lovable"}
                  />
                  <Summary
                    label="Payments"
                    value={stripeSecret ? "Custom Stripe keys" : "Platform Stripe account"}
                  />
                  <Summary
                    label="DNS reviewed"
                    value={value("dns_records_acknowledged") ? "Yes" : "Not yet"}
                  />
                </dl>
                <div className="flex items-center gap-3 rounded-lg border p-3">
                  <span
                    className="h-8 w-8 rounded-full"
                    style={{ background: `linear-gradient(135deg, ${primary}, ${secondary})` }}
                  />
                  <span className="text-sm text-muted-foreground">Your brand colors</span>
                </div>
              </section>
            )}

            <Separator />

            <div className="flex flex-wrap items-center justify-between gap-3">
              <Button variant="ghost" disabled={step === 1} onClick={() => goTo(step - 1)}>
                <ChevronLeft className="mr-1 h-4 w-4" /> Back
              </Button>
              <div className="flex items-center gap-2">
                {OPTIONAL_STEPS.has(step) && step !== 7 && (
                  <Button variant="ghost" onClick={() => goTo(step + 1)}>
                    Skip for now
                  </Button>
                )}
                {step === 7 ? (
                  <Button onClick={finish} disabled={saving} size="lg">
                    {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                    Go live
                  </Button>
                ) : (
                  <Button
                    onClick={() =>
                      step === 4 ? saveEmailStep() : step === 5 ? saveStripeStep() : goTo(step + 1)
                    }
                    disabled={saving || (step === 3 && slugState === "taken")}
                  >
                    Continue <ChevronRight className="ml-1 h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/* ------------------------------- small bits ------------------------------- */

function StepTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div>
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="text-sm text-muted-foreground">{subtitle}</p>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <Field label={label}>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-10 w-14 cursor-pointer rounded border bg-background"
          aria-label={label}
        />
        <Input value={value} onChange={(e) => onChange(e.target.value)} className="font-mono" />
      </div>
    </Field>
  );
}

function UploadField({
  label,
  url,
  busy,
  onFile,
  onClear,
}: {
  label: string;
  url: string | null;
  busy: boolean;
  onFile: (f: File) => void;
  onClear: () => void;
}) {
  return (
    <Field label={label}>
      <div className="flex items-center gap-3 rounded-lg border p-3">
        {url ? (
          <img src={url} alt={`${label} preview`} className="h-10 w-10 rounded object-contain" />
        ) : (
          <span className="flex h-10 w-10 items-center justify-center rounded bg-muted text-muted-foreground">
            <Upload className="h-4 w-4" />
          </span>
        )}
        <div className="flex flex-1 items-center gap-2">
          <Input
            type="file"
            accept="image/*"
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onFile(f);
            }}
            className="text-xs"
          />
          {url ? (
            <Button type="button" variant="ghost" size="sm" onClick={onClear}>
              Remove
            </Button>
          ) : null}
        </div>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
      </div>
    </Field>
  );
}

function CopyChip({ text }: { text: string }) {
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(text);
        toast.success("Copied");
      }}
      className="inline-flex items-center gap-1.5 rounded-full border bg-background px-3 py-1 font-mono text-xs hover:bg-accent"
    >
      {text}
      <Copy className="h-3 w-3" />
    </button>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border p-3">
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="truncate text-sm font-medium">{value}</dd>
    </div>
  );
}