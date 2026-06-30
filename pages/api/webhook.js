import { getStripe } from "../../lib/stripe";

export const config = { api: { bodyParser: false } };

async function readRawBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    console.error("STRIPE_WEBHOOK_SECRET is not set");
    return res.status(500).json({ error: "Webhook not configured" });
  }
  const sig = req.headers["stripe-signature"];
  let event;
  try {
    const stripe = getStripe();
    const raw = await readRawBody(req);
    event = stripe.webhooks.constructEvent(raw, sig, secret);
  } catch (e) {
    console.error("webhook signature verification failed:", e.message);
    return res.status(400).json({ error: `Webhook Error: ${e.message}` });
  }

  switch (event.type) {
    case "checkout.session.completed":
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const obj = event.data.object;
      // TODO(step 4): persist entitlement to a datastore (Vercel KV / Upstash),
      // keyed by customer/subscription, so /api/diagnose can verify per request.
      console.log(`[webhook] ${event.type}`, obj.id, obj.customer || "");
      break;
    }
    default:
      console.log(`[webhook] unhandled event: ${event.type}`);
  }

  return res.status(200).json({ received: true });
}
