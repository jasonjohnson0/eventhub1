import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { siteOrigin } from "@/lib/site-url";
import { ANNUAL_PLAN_CENTS, getStripe } from "@/lib/stripe.server";

export type AnnualPlanStatus = {
  status: "none" | "active" | "past_due" | "canceled";
  current_period_end: string | null;
  cancel_at_period_end: boolean;
};

/** Read-only: the table this queries has no write policy for a coordinator at
 *  all, so this can never be more than what the Stripe webhook actually set. */
export const getAnnualPlanStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AnnualPlanStatus> => {
    // biome-ignore lint/suspicious/noExplicitAny: coordinator_subscriptions is not in generated types yet
    const sb = context.supabase as any;
    const { data, error } = await sb
      .from("coordinator_subscriptions")
      .select("status, current_period_end, cancel_at_period_end")
      .eq("coordinator_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (
      (data as AnnualPlanStatus | null) ?? {
        status: "none",
        current_period_end: null,
        cancel_at_period_end: false,
      }
    );
  });

/** $100/year, auto-renewing. Inline price_data rather than a pre-created
 *  Stripe Price: the amount lives in one constant (stripe.server.ts) instead
 *  of also needing to stay in sync with a dashboard-created object. */
export const createAnnualCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ url: string }> => {
    const stripe = getStripe();
    const email = (context.claims as { email?: string } | null)?.email ?? undefined;

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer_email: email,
      client_reference_id: context.userId,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: ANNUAL_PLAN_CENTS,
            recurring: { interval: "year" },
            product_data: {
              name: "EventHub annual plan",
              description: "Removes platform ads from your calendar for one year, auto-renews annually.",
            },
          },
        },
      ],
      subscription_data: {
        metadata: { coordinator_id: context.userId },
      },
      success_url: `${siteOrigin()}/settings?annual=success`,
      cancel_url: `${siteOrigin()}/settings?annual=canceled`,
    });

    if (!session.url) throw new Error("Stripe did not return a checkout URL");
    return { url: session.url };
  });

/** Lets a coordinator update their card or cancel -- Stripe's own hosted UI,
 *  not something to rebuild. Only reachable once a customer id exists, i.e.
 *  after a first successful checkout. */
export const openBillingPortal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ url: string }> => {
    const stripe = getStripe();
    // biome-ignore lint/suspicious/noExplicitAny: coordinator_subscriptions is not in generated types yet
    const sb = context.supabase as any;
    const { data, error } = await sb
      .from("coordinator_subscriptions")
      .select("stripe_customer_id")
      .eq("coordinator_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data?.stripe_customer_id) {
      throw new Error("No billing account yet -- subscribe first.");
    }
    const portal = await stripe.billingPortal.sessions.create({
      customer: data.stripe_customer_id,
      return_url: `${siteOrigin()}/settings`,
    });
    return { url: portal.url };
  });
