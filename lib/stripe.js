import Stripe from "stripe";

let _stripe = null;

export function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error("STRIPE_SECRET_KEY is not set");
  }
  if (!_stripe) {
    _stripe = new Stripe(key, { apiVersion: "2024-04-10" });
  }
  return _stripe;
}
