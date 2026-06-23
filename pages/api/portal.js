import { getStripe } from "../../lib/stripe";
import { getBaseUrl } from "../../lib/baseUrl";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const { customerId } = req.body || {};
  if (!customerId || typeof customerId !== "string") {
    return res.status(400).json({ error: "Missing customerId" });
  }
  try {
    const stripe = getStripe();
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${getBaseUrl(req)}/`,
    });
    return res.status(200).json({ url: session.url });
  } catch (e) {
    console.error("portal error:", e);
    return res.status(500).json({ error: "Could not open billing portal" });
  }
}
