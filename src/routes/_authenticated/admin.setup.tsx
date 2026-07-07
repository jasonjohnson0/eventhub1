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
  disconnectStripe,
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

  const refresh = async () => {
    setLoading(true);
    try {
      const c = await getPlatformConfig();
      setConfig(c);
      setProvider((c.email_provider === "none" ? "lovable" : c.email_provider) as ProviderChoice);
      setFromName(c.email_from_name ?? "");
      setFromAddress(c.email_from_address ?? "");
      setMailgunDomain((c.email_extra?.mailgun_domain as string) ?? "");
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

  const connectStripe = () => {
    if (!config?.stripe_oauth_url) {
      toast.error("Stripe OAuth not configured on the server");
      return;
    }
    window.location.href = config.stripe_oauth_url;
  };

  const handleDisconnect = async () => {
    try {
      await disconnectStripe();
      toast.success("Stripe disconnected");
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  };

  const bothReady = useMemo(
    () => !!config?.stripe_connected && !!config?.email_configured,
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
              {config?.stripe_connected ? (
                <Badge variant="default">✅ Connected</Badge>
              ) : (
                <Badge variant="secondary">❌ Not connected</Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Connect your Stripe account to accept ticket payments and sponsorship revenue.
              Each buyer brings their own Stripe account.
            </p>
            {config?.stripe_connected ? (
              <div className="space-y-2">
                <p className="text-sm">
                  Account: <code className="rounded bg-muted px-1">{config.stripe_connect_account_id}</code>
                </p>
                <Button variant="outline" onClick={handleDisconnect}>Disconnect</Button>
              </div>
            ) : (
              <div>
                <Button
                  onClick={connectStripe}
                  disabled={!config?.stripe_oauth_available}
                  title={
                    config?.stripe_oauth_available
                      ? "Redirects to Stripe"
                      : "Stripe OAuth credentials not configured. Add STRIPE_CONNECT_CLIENT_ID and STRIPE_SECRET_KEY in Project Settings → Secrets."
                  }
                >
                  Connect Stripe Account
                </Button>
                {!config?.stripe_oauth_available && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Stripe OAuth credentials not configured. Add{" "}
                    <code>STRIPE_CONNECT_CLIENT_ID</code> and <code>STRIPE_SECRET_KEY</code>{" "}
                    in Project Settings → Secrets, then reload.
                  </p>
                )}
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
          <div>Stripe: {config?.stripe_connected ? "✅ Connected" : "❌ Not connected"}</div>
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