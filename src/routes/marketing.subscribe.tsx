import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { subscribeToMarketing } from "@/lib/marketing.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

export const Route = createFileRoute("/marketing/subscribe")({
  component: SubscribePage,
  head: () => ({
    meta: [
      { title: "Join the EventHub newsletter" },
      { name: "description", content: "Subscribe to EventHub for weekly event highlights and updates." },
    ],
  }),
});

function SubscribePage() {
  const [email, setEmail] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<null | { alreadyConfirmed: boolean; token: string | null }>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!agreed) {
      toast.error("Please agree to receive marketing emails");
      return;
    }
    setSubmitting(true);
    try {
      const res = await subscribeToMarketing({ data: { email, source: "website" } });
      setDone({ alreadyConfirmed: res.alreadyConfirmed, token: res.token });
      toast.success(
        res.alreadyConfirmed
          ? "You're already subscribed"
          : "Check your email to confirm your subscription",
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to subscribe");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-lg items-center px-4 py-16">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Join the EventHub newsletter</CardTitle>
          <CardDescription>
            Weekly highlights of new events near you. Double opt-in — we'll email you to confirm.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {done ? (
            <div className="space-y-3 text-sm">
              {done.alreadyConfirmed ? (
                <p>You're already subscribed. Nothing else to do.</p>
              ) : (
                <>
                  <p>
                    A confirmation email is on its way. Click the link inside to activate your
                    subscription.
                  </p>
                  {done.token && (
                    <p className="rounded-md border bg-muted p-3 text-xs text-muted-foreground">
                      Dev preview: email delivery lands in Phase 1b. Confirm now via{" "}
                      <Link
                        to="/marketing/confirm"
                        search={{ token: done.token }}
                        className="text-primary underline"
                      >
                        this link
                      </Link>
                      .
                    </p>
                  )}
                </>
              )}
            </div>
          ) : (
            <form className="space-y-4" onSubmit={onSubmit}>
              <div className="space-y-1">
                <label htmlFor="email" className="text-sm font-medium">Email</label>
                <Input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                />
              </div>
              <label className="flex items-start gap-2 text-sm text-muted-foreground">
                <input
                  type="checkbox"
                  checked={agreed}
                  onChange={(e) => setAgreed(e.target.checked)}
                  className="mt-1"
                />
                <span>
                  I agree to receive marketing emails from EventHub. I can unsubscribe at any time.
                </span>
              </label>
              <Button type="submit" disabled={submitting} className="w-full">
                {submitting ? "Submitting…" : "Subscribe"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}