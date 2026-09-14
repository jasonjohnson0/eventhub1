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

/** Confirms a ticket hold once Stripe reports the Checkout Session actually
 *  completed -- this is the only place a paid purchase ever gets marked
 *  confirmed, so a buyer redirected to Checkout can't get a ticket without
 *  Stripe having actually processed a payment. */
// biome-ignore lint/suspicious/noExplicitAny: ticket_purchases RPCs not in generated types yet
async function confirmTicketCheckout(admin: any, session: Stripe.Checkout.Session) {
  const purchaseId = session.metadata?.purchase_id as string | undefined;
  if (!purchaseId) {
    console.error(`[stripe webhook] ticket checkout ${session.id} has no purchase_id metadata`);
    return;
  }
  const paymentIntent =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id;
  if (!paymentIntent) {
    console.error(`[stripe webhook] ticket checkout ${session.id} completed with no payment_intent`);
    return;
  }
  const { error } = await admin.rpc("confirm_ticket_purchase", {
    _purchase_id: purchaseId,
    _stripe_charge_id: paymentIntent,
  });
  if (error) {
    console.error(`[stripe webhook] confirm_ticket_purchase failed for ${purchaseId}:`, error.message);
    return;
  }
  const { data: purchase } = await admin
    .from("ticket_purchases")
    .select("event_id, user_id")
    .eq("id", purchaseId)
    .maybeSingle();
  if (purchase) {
    // Buying a ticket doesn't otherwise RSVP you -- do that here so the
    // event's going count and the buyer's own "my events" list reflect it.
    await admin
      .from("event_rsvps")
      .upsert(
        { event_id: purchase.event_id, user_id: purchase.user_id, status: "going" },
        { onConflict: "event_id,user_id" },
      );
  }
}

/** A Checkout Session's own 30-minute hold expired without payment (buyer
 *  closed the tab, card declined and they gave up, etc). Releases the
 *  matching pending purchase so the seat is buyable again -- otherwise a
 *  stale hold could sit there until whatever periodic cleanup exists,
 *  starving inventory nobody actually reserved anymore. */
// biome-ignore lint/suspicious/noExplicitAny: ticket_purchases RPCs not in generated types yet
async function releaseExpiredTicketHold(admin: any, session: Stripe.Checkout.Session) {
  const purchaseId = session.metadata?.purchase_id as string | undefined;
  if (!purchaseId) return;
  const { error } = await admin.rpc("release_ticket_hold", { _purchase_id: purchaseId });
  if (error) {
    console.error(`[stripe webhook] release_ticket_hold failed for ${purchaseId}:`, error.message);
  }
}

/** Out-of-band refund safety net -- covers a refund issued directly in the
 *  Stripe dashboard or via a dispute, not through refundTicketPurchase.
 *  mark_ticket_refunded is idempotent, so this is a no-op if our own
 *  refund flow already handled it. */
// biome-ignore lint/suspicious/noExplicitAny: ticket_purchases RPCs not in generated types yet
async function refundTicketByPaymentIntent(admin: any, charge: Stripe.Charge) {
  const paymentIntent =
    typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;
  if (!paymentIntent) return;
  const { data: purchase } = await admin
    .from("ticket_purchases")
    .select("id, status")
    .eq("stripe_charge_id", paymentIntent)
    .maybeSingle();
  if (!purchase) return; // not a ticket charge -- e.g. a subscription invoice's charge
  if (purchase.status !== "confirmed") return; // already refunded, or never confirmed
  const refundId = charge.refunds?.data[0]?.id ?? `charge_refunded_${charge.id}`;
  const { error } = await admin.rpc("mark_ticket_refunded", {
    _purchase_id: purchase.id,
    _refund_stripe_id: refundId,
  });
  if (error) {
    console.error(`[stripe webhook] mark_ticket_refunded failed for ${purchase.id}:`, error.message);
  }
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
              // Two entirely different products share this event type --
              // discriminated by metadata.kind, not just session.mode, so a
              // ticket purchase (mode: "payment") can never be mistaken for
              // an annual-plan subscription checkout and vice versa.
              if (session.metadata?.kind === "ticket_purchase") {
                await confirmTicketCheckout(supabaseAdmin, session);
                break;
              }
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
            case "checkout.session.expired": {
              const session = event.data.object as Stripe.Checkout.Session;
              if (session.metadata?.kind === "ticket_purchase") {
                await releaseExpiredTicketHold(supabaseAdmin, session);
              }
              break;
            }
            case "charge.refunded": {
              const charge = event.data.object as Stripe.Charge;
              await refundTicketByPaymentIntent(supabaseAdmin, charge);
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
