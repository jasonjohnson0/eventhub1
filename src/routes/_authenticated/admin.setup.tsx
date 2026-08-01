import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  getPlatformConfig,
  savePlatformConfig,
  testEmailConnection,
  saveCustomStripeKeys,
  clearCustomStripeKeys,
  type PlatformConfigView,
  type EmailProviderName,
} from "@/lib/setup.functions";

const searchSchema = z.object({
  stripe_connected: z.string().optional(),
  error: z.string().optional(),
});

export const Route = createFileRoute("/_authenticated/admin/setup")({
  validateSearch: searchSchema,
  component: SetupPage,
  head: () => ({ meta: [{ title: "Setup — EventHub Admin" }] }),
});

type ProviderChoice = Exclude<EmailProviderName, "none">;

function SetupPage() {
  const navigate = useNavigate();
  const search = useSearch({ from: "/_authenticated/admin/setup" });
  const [config, setConfig] = useState<PlatformConfigView | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [adminEmail, setAdminEmail] = useState("");

  const [provider, setProvider] = useState<ProviderChoice>("lovable");
  const [apiKey, setApiKey] = useState("");
  const [fromName, setFromName] = useState("");
  const [fromAddress, setFromAddress] = useState("");
  const [mailgunDomain, setMailgunDomain] = useState("");
  const [showStripeForm, setShowStripeForm] = useState(false);
  const [stripeSecret, setStripeSecret] = useState("");
  const [stripePublishable, setStripePublishable] = useState("");
  const [savingStripe, setSavingStripe] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try {
      const c = await getPlatformConfig();
      setConfig(c);
      setProvider((c.email_provider === "none" ? "lovable" : c.email_provider) as ProviderChoice);
      setFromName(c.email_from_name ?? "");
      setFromAddress(c.email_from_address ?? "");
      setMailgunDomain((c.email_extra?.mailgun_domain as string) ?? "");
      setStripePublishable(c.custom_stripe_publishable ?? "");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load config");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    supabase.auth.getUser().then(({ data }) => setAdminEmail(data.user?.email ?? ""));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (search.stripe_connected === "true") toast.success("Stripe account connected!");
    if (search.error) toast.error(`Stripe: ${search.error}`);
  }, [search.stripe_connected, search.error]);

  const needsFields = provider !== "lovable";

  const handleTest = async () => {
    if (!adminEmail) return toast.error("No admin email to send test to");
    if (needsFields && (!apiKey || !fromAddress)) {
      return toast.error("Fill API key and From Email first");
    }
    if (provider === "mailgun" && !mailgunDomain) {
      return toast.error("Mailgun domain is required");
    }
    setTesting(true);
    try {
      const res = await testEmailConnection({
        data: {
          provider,
          api_key: apiKey || null,
          from_name: fromName || null,
          from_address: fromAddress || null,
          mailgun_domain: mailgunDomain || null,
          to_email: adminEmail,
        },
      });
      if (res.ok) toast.success(`Test email sent to ${adminEmail}`);
      else toast.error(`Test failed: ${res.error}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Test failed");
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    if (needsFields && (!apiKey && !config?.email_api_key_masked)) {
      return toast.error("API key required");
    }
    if (needsFields && !fromAddress) return toast.error("From Email required");
    if (provider === "mailgun" && !mailgunDomain) return toast.error("Mailgun domain required");
    setSaving(true);
    try {
      await savePlatformConfig({
        data: {
          provider,
          api_key: apiKey || null,
          from_name: fromName || null,
          from_address: fromAddress || null,
          mailgun_domain: mailgunDomain || null,
        },
      });
      toast.success("Configuration saved");
      setApiKey("");
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveStripe = async () => {
    if (!stripePublishable) return toast.error("Publishable key required");
    if (!stripeSecret && !config?.custom_stripe_secret_masked) {
      return toast.error("Secret key required");
    }
    setSavingStripe(true);
    try {
      await saveCustomStripeKeys({
        data: { secret_key: stripeSecret || null, publishable_key: stripePublishable },
      });
      toast.success("Custom Stripe keys saved");
      setStripeSecret("");
      setShowStripeForm(false);
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setSavingStripe(false);
    }
  };

  const handleUseDefaultStripe = async () => {
    try {
      await clearCustomStripeKeys();
      toast.success("Reverted to the built-in Stripe account");
      setStripeSecret("");
      setShowStripeForm(false);
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  };

  const bothReady = useMemo(
    () => !!config?.stripe_ready && !!config?.email_configured,
    [config],
  );

  if (loading) return <p className="text-sm text-muted-foreground">Loading setup…</p>;

  return (
    <div className="space-y-6">
      <div className="rounded-lg border bg-gradient-to-br from-primary/10 to-transparent p-6">
        <h2 className="text-2xl font-bold">🎉 Welcome to EventHub</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Let's activate payments and email. Buyers add their own keys here — no code required.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* STRIPE */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              Accept Payments
              {config?.stripe_ready ? (
                <Badge variant="default">✅ Stripe is ready</Badge>
              ) : (
                <Badge variant="secondary">❌ Not configured</Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {config?.use_custom_stripe ? (
              <p className="text-sm text-muted-foreground">
                Payments run on <strong>your own Stripe account</strong>. Secret key:{" "}
                <code className="rounded bg-muted px-1">{config.custom_stripe_secret_masked}</code>
              </p>
            ) : config?.platform_stripe_ready ? (
              <p className="text-sm text-muted-foreground">
                Payments are already live on the built-in Stripe account — nothing to set up.
                Ticket sales and sponsorship revenue work out of the box.
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                The built-in Stripe keys aren't available in this environment. Add{" "}
                <code>STRIPE_SECRET_KEY</code> in Project Settings → Secrets, or enter your own
                keys below.
              </p>
            )}

            {!showStripeForm ? (
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => setShowStripeForm(true)}>
                  Use different Stripe keys
                </Button>
                {config?.use_custom_stripe && (
                  <Button variant="ghost" onClick={handleUseDefaultStripe}>
                    Revert to built-in Stripe
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-3 rounded-md border p-3">
                <div>
                  <Label htmlFor="sk">Stripe Secret Key</Label>
                  <Input
                    id="sk"
                    type="password"
                    placeholder={config?.custom_stripe_secret_masked ?? "sk_live_…"}
                    value={stripeSecret}
                    onChange={(e) => setStripeSecret(e.target.value)}
                  />
                  {config?.custom_stripe_secret_masked && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Leave blank to keep the saved key.
                    </p>
                  )}
                </div>
                <div>
                  <Label htmlFor="pk">Stripe Publishable Key</Label>
                  <Input
                    id="pk"
                    placeholder="pk_live_…"
                    value={stripePublishable}
                    onChange={(e) => setStripePublishable(e.target.value)}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Your secret key is encrypted before it's stored.
                </p>
                <div className="flex gap-2">
                  <Button onClick={handleSaveStripe} disabled={savingStripe}>
                    {savingStripe ? "Saving…" : "Save Stripe keys"}
                  </Button>
                  <Button variant="ghost" onClick={() => setShowStripeForm(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* EMAIL */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              Email & Notifications
              {config?.email_configured ? (
                <Badge variant="default">✅ {config.email_provider}</Badge>
              ) : (
                <Badge variant="secondary">❌ Not configured</Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <RadioGroup value={provider} onValueChange={(v) => setProvider(v as ProviderChoice)}>
              {(
                [
                  { v: "lovable", label: "Lovable (Built-in)", help: "Reliable, authenticated, included. Verify your sender domain in Lovable settings for custom branding." },
                  { v: "sendgrid", label: "SendGrid", help: "SendGrid dashboard → Settings → API Keys" },
                  { v: "postmark", label: "Postmark", help: "Postmark → Account → API Tokens" },
                  { v: "mailgun", label: "Mailgun", help: "Mailgun → Sending → Domains" },
                ] as const
              ).map((opt) => (
                <div key={opt.v} className="flex items-start gap-2 rounded-md border p-3">
                  <RadioGroupItem value={opt.v} id={`p-${opt.v}`} className="mt-1" />
                  <div className="flex-1">
                    <Label htmlFor={`p-${opt.v}`} className="font-medium">{opt.label}</Label>
                    <p className="text-xs text-muted-foreground">{opt.help}</p>
                  </div>
                </div>
              ))}
            </RadioGroup>

            {needsFields && (
              <div className="space-y-3">
                <div>
                  <Label htmlFor="apikey">API Key</Label>
                  <Input
                    id="apikey"
                    type="password"
                    placeholder={config?.email_api_key_masked ?? "Paste API key"}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                  />
                  {config?.email_api_key_masked && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Current: {config.email_api_key_masked}. Leave blank to keep.
                    </p>
                  )}
                </div>
                {provider === "mailgun" && (
                  <div>
                    <Label htmlFor="mgdomain">Mailgun Domain</Label>
                    <Input
                      id="mgdomain"
                      placeholder="mg.mycompany.com"
                      value={mailgunDomain}
                      onChange={(e) => setMailgunDomain(e.target.value)}
                    />
                  </div>
                )}
                <div>
                  <Label htmlFor="fname">From Name</Label>
                  <Input id="fname" placeholder="My Events" value={fromName} onChange={(e) => setFromName(e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="faddr">From Email</Label>
                  <Input id="faddr" type="email" placeholder="events@mycompany.com" value={fromAddress} onChange={(e) => setFromAddress(e.target.value)} />
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={handleTest} disabled={testing}>
                {testing ? "Testing…" : `Test Email → ${adminEmail || "admin"}`}
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? "Saving…" : "Save Configuration"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <Separator />

      <Card>
        <CardHeader>
          <CardTitle>Status</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div>
            Stripe:{" "}
            {config?.stripe_ready
              ? `✅ Ready (${config.use_custom_stripe ? "your keys" : "built-in account"})`
              : "❌ Not configured"}
          </div>
          <div>
            Email:{" "}
            {config?.email_configured
              ? `✅ ${config.email_provider}${config.email_from_address ? ` (${config.email_from_address})` : ""}`
              : "❌ Not configured"}
          </div>
          <div className="mt-4 flex gap-2">
            <Button
              onClick={() => navigate({ to: "/admin" })}
              disabled={!bothReady}
              title={bothReady ? "" : "Complete both sections first"}
            >
              All set! Go to dashboard
            </Button>
            <Button variant="ghost" onClick={() => navigate({ to: "/admin" })}>
              Skip for now
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}