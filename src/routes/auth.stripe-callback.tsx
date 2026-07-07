import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { z } from "zod";
import { exchangeStripeAuthCode } from "@/lib/setup.functions";

const searchSchema = z.object({
  code: z.string().optional(),
  error: z.string().optional(),
  error_description: z.string().optional(),
  state: z.string().optional(),
});

export const Route = createFileRoute("/auth/stripe-callback")({
  validateSearch: searchSchema,
  ssr: false,
  component: StripeCallback,
  head: () => ({ meta: [{ title: "Connecting Stripe…" }] }),
});

function StripeCallback() {
  const search = useSearch({ from: "/auth/stripe-callback" });
  const navigate = useNavigate();
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    const run = async () => {
      if (search.error) {
        navigate({
          to: "/admin/setup",
          search: { error: search.error_description ?? search.error },
        });
        return;
      }
      if (!search.code) {
        navigate({ to: "/admin/setup", search: { error: "Missing code" } });
        return;
      }
      try {
        await exchangeStripeAuthCode({ data: { code: search.code } });
        navigate({ to: "/admin/setup", search: { stripe_connected: "true" } });
      } catch (e) {
        navigate({
          to: "/admin/setup",
          search: { error: e instanceof Error ? e.message : "OAuth exchange failed" },
        });
      }
    };
    run();
  }, [search, navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <p className="text-sm text-muted-foreground">Connecting your Stripe account…</p>
    </div>
  );
}