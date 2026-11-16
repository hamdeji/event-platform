import "server-only";
import crypto from "crypto";
import { APP_URL } from "../config";

/**
 * Payment provider abstraction. The platform never holds funds itself: in production,
 * collections go to a licensed PSP (Paystack/Flutterwave) and escrowed funds sit with a
 * licensed custodian. Our ledger is the source of truth for who is owed what.
 */
export interface PaymentProvider {
  name: string;
  initialize(input: { amountNaira: number; email: string; reference: string; metadata?: Record<string, unknown> }): Promise<{ authorizationUrl: string }>;
  verify(reference: string): Promise<{ paid: boolean; amountNaira: number }>;
  verifyWebhook?(rawBody: string, signature: string | null): boolean;
  /** Pay a vendor out of escrow. Returns a transfer reference. */
  payout(input: { amountNaira: number; recipient: string | null; reference: string; reason: string }): Promise<{ transferRef: string; status: "success" | "pending" | "queued" }>;
}

class MockProvider implements PaymentProvider {
  name = "mock";
  async initialize({ reference }: { reference: string }) {
    return { authorizationUrl: `${APP_URL}/pay/mock?ref=${encodeURIComponent(reference)}` };
  }
  async verify() {
    // The mock checkout page calls our confirm endpoint directly; verification always passes there.
    return { paid: true, amountNaira: 0 };
  }
  async payout({ reference }: { reference: string }) {
    return { transferRef: "MOCK-TRF-" + reference, status: "success" as const };
  }
}

class PaystackProvider implements PaymentProvider {
  name = "paystack";
  private key = process.env.PAYSTACK_SECRET_KEY || "";
  private async call(path: string, init?: RequestInit) {
    const res = await fetch("https://api.paystack.co" + path, {
      ...init,
      headers: { Authorization: `Bearer ${this.key}`, "Content-Type": "application/json", ...(init?.headers || {}) },
    });
    const json = await res.json();
    if (!res.ok || !json.status) throw new Error("Paystack: " + (json.message || res.statusText));
    return json.data;
  }
  async initialize({ amountNaira, email, reference, metadata }: { amountNaira: number; email: string; reference: string; metadata?: Record<string, unknown> }) {
    const data = await this.call("/transaction/initialize", {
      method: "POST",
      body: JSON.stringify({
        amount: amountNaira * 100, // kobo
        email,
        reference,
        currency: "NGN",
        callback_url: `${APP_URL}/api/payments/callback`,
        channels: ["card", "bank", "ussd", "bank_transfer"],
        metadata,
      }),
    });
    return { authorizationUrl: data.authorization_url as string };
  }
  async verify(reference: string) {
    const data = await this.call(`/transaction/verify/${encodeURIComponent(reference)}`);
    return { paid: data.status === "success", amountNaira: Math.round(data.amount / 100) };
  }
  verifyWebhook(rawBody: string, signature: string | null) {
    if (!signature) return false;
    const hash = crypto.createHmac("sha512", this.key).update(rawBody).digest("hex");
    return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(signature));
  }
  async payout({ amountNaira, recipient, reference, reason }: { amountNaira: number; recipient: string | null; reference: string; reason: string }) {
    if (!recipient) return { transferRef: reference, status: "queued" as const }; // vendor has no recipient code yet
    const data = await this.call("/transfer", {
      method: "POST",
      body: JSON.stringify({ source: "balance", amount: amountNaira * 100, recipient, reference, reason }),
    });
    return { transferRef: data.transfer_code as string, status: data.status === "success" ? ("success" as const) : ("pending" as const) };
  }
}

let provider: PaymentProvider | null = null;
export function payments(): PaymentProvider {
  if (!provider) provider = process.env.PAYMENT_PROVIDER === "paystack" ? new PaystackProvider() : new MockProvider();
  return provider;
}
