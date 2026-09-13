import { createFileRoute } from "@tanstack/react-router";
import { getStripe } from "@/lib/stripe.server";
import type Stripe from "stripe";

/**
 * The only thing allowed to write to coordinator_subscriptions. Everything
 * here runs against the service-role client precisely because the table's
 * own RLS gives a coordinator no write path at all -- this route is that
 * write path, gated by Stripe's signature instead of Postgres policy.
 */

// biome-ignore lint/suspicious/noExplicitAny: coordinator_subscriptions is not in generated types yet
async function upsertFromSubscription(admin: any, sub: Stripe.Subscription) {
  const coordinatorId = sub.metadata?.coordinator_id as string | undefined;
  if (!coordinatorId) {
    console.error(`[stripe webhook] subscription ${sub.id} has no coordinator_id metadata`);
    return;
  }
  const status: "active" | "past_due" | "canceled" | "none" =
    sub.status === "active" || sub.status === "trialing"
      ? "active"
      : sub.status === "past_due" || sub.status === "unpaid"
        ? "past_due"
        : "canceled";

  const currentPeriodEnd = sub.items.data[0]?.current_period_end;

  const { error } = await admin
    .from("coordinator_subscriptions")
    .upsert(
      {
        coordinator_id: coordinatorId,
        stripe_customer_id: typeof sub.customer === "string" ? sub.customer : sub.customer.id,
        stripe_subscription_id: sub.id,
        status,
        current_period_end: currentPeriodEnd
          ? new Date(currentPeriodEnd * 1000).toISOString()
          : null,
        cancel_at_period_end: sub.cancel_at_period_end,
      },
      { onConflict: "coordinator_id" },
    );
  if (error) console.error(`[stripe webhook] upsert failed for ${sub.id}:`, error.message);
}

export const Route = createFileRoute("/api/stripe/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const sig = request.headers.get("stripe-signature");
        const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
        if (!sig || !webhookSecret) {
          console.error("[stripe webhook] missing signature header or STRIPE_WEBHOOK_SECRET");
          return new Response("Webhook not configured", { status: 500 });
        }

        const rawBody = await request.text();
        let event: Stripe.Event;
        try {
          event = getStripe().webhooks.constructEvent(rawBody, sig, webhookSecret);
        } catch (err) {
          console.error("[stripe webhook] signature verification failed:", err);
          return new Response("Invalid signature", { status: 400 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        try {
          switch (event.type) {
            case "checkout.session.completed": {
              const session = event.data.object as Stripe.Checkout.Session;
              if (session.mode === "subscription" && session.subscription) {
                const subId =
                  typeof session.subscription === "string"
                    ? session.subscription
                    : session.subscription.id;
                const sub = await getStripe().subscriptions.retrieve(subId);
                // Checkout Session's client_reference_id is the coordinator id;
                // subscription_data.metadata was set at creation time to carry
                // the same value onto the subscription object itself, so every
                // later event (renewal, cancellation) already has it without
                // needing to look the checkout session back up.
                if (!sub.metadata?.coordinator_id && session.client_reference_id) {
                  await getStripe().subscriptions.update(subId, {
                    metadata: { coordinator_id: session.client_reference_id },
                  });
                  sub.metadata = { ...sub.metadata, coordinator_id: session.client_reference_id };
                }
                await upsertFromSubscription(supabaseAdmin, sub);
              }
              break;
            }
            case "customer.subscription.updated":
            case "customer.subscription.created":
            case "customer.subscription.deleted": {
              const sub = event.data.object as Stripe.Subscription;
              await upsertFromSubscription(supabaseAdmin, sub);
              break;
            }
            case "invoice.paid":
            case "invoice.payment_failed": {
              const invoice = event.data.object as Stripe.Invoice;
              const subId = invoice.parent?.subscription_details?.subscription;
              const subscriptionId = typeof subId === "string" ? subId : subId?.id;
              if (subscriptionId) {
                const sub = await getStripe().subscriptions.retrieve(
                  typeof subscriptionId === "string" ? subscriptionId : subscriptionId,
                );
                await upsertFromSubscription(supabaseAdmin, sub);
              }
              break;
            }
            default:
              break;
          }
        } catch (err) {
          console.error(`[stripe webhook] handling ${event.type} failed:`, err);
          // 200 anyway: Stripe retries on non-2xx, and retrying a handler that
          // is failing for a reason unrelated to timing (a bug, not a race)
          // just repeats the same failure. Logged above for follow-up instead.
        }

        return new Response(JSON.stringify({ received: true }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    },
  },
});
