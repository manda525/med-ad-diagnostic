import { getStripe } from "../../lib/stripe";
import { signToken } from "../../lib/entitlement";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const { session_id } = req.body || {};
  if (!session_id || typeof session_id !== "string") {
    return res.status(400).json({ error: "Missing session_id" });
  }
  try {
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.retrieve(session_id, {
      expand: ["subscription"],
    });
    const sub = session.subscription;
    const subActive =
      sub && typeof sub === "object" && (sub.status === "active" || sub.status === "trialing");
    const pro = session.status === "complete" && !!subActive;
    if (!pro) {
      return res.status(200).json({ pro: false });
    }
    const customerId =
      typeof session.customer === "string"
        ? session.customer
        : session.customer && session.customer.id
        ? session.customer.id
        : null;
    const subscriptionId = sub.id;
    const exp = sub.current_period_end || Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 31;
    const token = signToken({ c: customerId, s: subscriptionId, exp });
    return res.status(200).json({
      pro: true,
      customerId,
      subscriptionId,
      currentPeriodEnd: sub.current_period_end || null,
      token,
    });
  } catch (e) {
    console.error("verify-session error:", e);
    return res.status(400).json({ error: "Invalid session" });
  }
}
