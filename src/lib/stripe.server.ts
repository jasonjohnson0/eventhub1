// Server-only. Never import from a route file or a *.functions.ts module that
// ships to the client bundle -- same rule as client.server.ts.
import Stripe from "stripe";

/** $100/year, flat, no proration. Changing the price later means changing
 *  this one constant -- Checkout is given inline price_data, not a
 *  pre-created Stripe Price object, so there is nothing else to update. */
export const ANNUAL_PLAN_CENTS = 10_000;

let _stripe: Stripe | undefined;

/** Throws with a clear, actionable message rather than a raw SDK error when
 *  the platform's own Stripe account isn't connected yet -- this is expected
 *  to be unset until a real key is added, not a bug to work around. */
export function getStripe(): Stripe {
  if (_stripe) return _stripe;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error(
      "The annual plan isn't set up yet -- STRIPE_SECRET_KEY is not configured. Connect Stripe in Lovable (or set the key directly) to enable it.",
    );
  }
  _stripe = new Stripe(key);
  return _stripe;
}
