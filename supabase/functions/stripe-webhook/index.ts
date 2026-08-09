import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.111.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, serviceKey);

async function getStripeSecret(userId?: string): Promise<string> {
  if (userId) {
    const { data: settings } = await supabase
      .from("workspace_settings")
      .select("stripe_webhook_secret")
      .eq("user_id", userId)
      .maybeSingle();
    if (settings?.stripe_webhook_secret) return settings.stripe_webhook_secret;
  }
  const secret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  if (!secret) throw new Error("Stripe webhook secret not configured. Add it in Account settings or as an edge function secret.");
  return secret;
}

async function verifyStripeSignature(payload: string, signature: string, secret: string): Promise<boolean> {
  const parts = signature.split(",");
  const sigMap = new Map<string, string>();
  for (const part of parts) {
    const [key, value] = part.split("=");
    if (key && value) sigMap.set(key.trim(), value.trim());
  }
  const timestamp = sigMap.get("t");
  const v1Signature = sigMap.get("v1");
  if (!timestamp || !v1Signature) return false;

  const fiveMinutes = 300000;
  const age = Math.abs(Date.now() - parseInt(timestamp) * 1000);
  if (age > fiveMinutes) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signedPayload = `${timestamp}.${payload}`;
  const expectedSig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signedPayload));
  const expectedHex = Array.from(new Uint8Array(expectedSig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return expectedHex === v1Signature;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const rawBody = await req.text();
    const stripeSignature = req.headers.get("stripe-signature");

    if (!stripeSignature) {
      return new Response(JSON.stringify({ error: "Missing stripe-signature header" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const isValid = await verifyStripeSignature(rawBody, stripeSignature, stripeWebhookSecret);
    if (!isValid) {
      return new Response(JSON.stringify({ error: "Invalid signature" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const event = JSON.parse(rawBody);
    const eventType = event.type;

    if (eventType === "invoice.payment_overdue" || eventType === "invoice.payment_failed" || eventType === "charge.dispute.created") {
      const invoiceNumber = event.data?.object?.number;
      if (!invoiceNumber) {
        return new Response(JSON.stringify({ received: true, skipped: "no invoice number" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: invoice, error: invErr } = await supabase
        .from("invoices")
        .select("*, contracts(*)")
        .eq("number", invoiceNumber)
        .maybeSingle();
      if (invErr) throw invErr;
      if (!invoice) {
        return new Response(JSON.stringify({ received: true, skipped: "invoice not found" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const dueDate = new Date(invoice.due_at);
      const today = new Date();
      const daysLate = Math.max(0, Math.floor((today.getTime() - dueDate.getTime()) / 86400000));

      const { error: updateErr } = await supabase
        .from("invoices")
        .update({ status: "overdue", days_late: daysLate })
        .eq("id", invoice.id);
      if (updateErr) throw updateErr;

      const { data: webhookEvent, error: webhookErr } = await supabase
        .from("webhook_events")
        .insert({
          source: "stripe",
          event_type: eventType,
          payload: { invoice_number: invoice.number, amount: invoice.amount, days_late: daysLate, stripe_event_id: event.id },
          invoice_id: invoice.id,
          processed: true,
          user_id: invoice.user_id,
        })
        .select()
        .single();
      if (webhookErr) throw webhookErr;

      await supabase.from("activity_log").insert({
        event_type: "webhook_received",
        description: `Stripe webhook ${eventType}: ${invoice.number} is ${daysLate} days overdue ($${invoice.amount})`,
        severity: eventType === "charge.dispute.created" ? "error" : "warning",
        meta: { invoice_id: invoice.id, webhook_id: webhookEvent.id, stripe_event_id: event.id },
        user_id: invoice.user_id,
      });

      let contractTerms: unknown[] = [];
      if (invoice.contract_id) {
        const { data: terms } = await supabase
          .from("contract_terms")
          .select("*")
          .eq("contract_id", invoice.contract_id);
        contractTerms = terms ?? [];
      }

      return new Response(JSON.stringify({
        received: true,
        event_id: webhookEvent.id,
        invoice: {
          id: invoice.id,
          number: invoice.number,
          client: invoice.client,
          amount: invoice.amount,
          days_late: daysLate,
          status: "overdue",
        },
        contract_terms: contractTerms,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ received: true, event_type: eventType }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
