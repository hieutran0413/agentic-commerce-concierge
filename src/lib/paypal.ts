import type { PayPalMode } from "./types";

export interface PayPalOrderResult {
  id: string;
  status: string;
}

export interface PayPalCaptureResult {
  id: string;
  status: string;
}

export interface PayPalClient {
  createOrder(item: string, amountUSD: number, merchant: string): Promise<PayPalOrderResult>;
  captureOrder(orderId: string): Promise<PayPalCaptureResult>;
}

const SANDBOX_BASE = "https://api-m.sandbox.paypal.com";
const LIVE_BASE = "https://api-m.paypal.com";

function baseUrl(): string {
  return process.env.PAYPAL_MODE === "live" ? LIVE_BASE : SANDBOX_BASE;
}

function hasCredentials(): boolean {
  return Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET);
}

/** "live" = real PayPal sandbox (or live) credentials are configured. */
export function getPayPalMode(): PayPalMode {
  return hasCredentials() ? "live" : "mock";
}

/* ------------------------------------------------------------------ */
/* Real PayPal client — Orders v2, OAuth2 client-credentials flow.     */
/* ------------------------------------------------------------------ */

class RealPayPalClient implements PayPalClient {
  private token: string | null = null;
  private tokenExpiresAt = 0;

  private async accessToken(): Promise<string> {
    if (this.token && Date.now() < this.tokenExpiresAt - 60_000) {
      return this.token;
    }
    const clientId = process.env.PAYPAL_CLIENT_ID!;
    const secret = process.env.PAYPAL_CLIENT_SECRET!;
    const basic = Buffer.from(`${clientId}:${secret}`).toString("base64");
    const res = await fetch(`${baseUrl()}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`PayPal OAuth failed (${res.status}): ${text.slice(0, 200)}`);
    }
    const data = (await res.json()) as { access_token: string; expires_in: number };
    this.token = data.access_token;
    this.tokenExpiresAt = Date.now() + data.expires_in * 1000;
    return this.token;
  }

  private async authed(path: string, body: unknown): Promise<unknown> {
    const token = await this.accessToken();
    const res = await fetch(`${baseUrl()}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`PayPal API ${path} failed (${res.status}): ${text.slice(0, 300)}`);
    }
    return res.json() as Promise<unknown>;
  }

  async createOrder(item: string, amountUSD: number, merchant: string): Promise<PayPalOrderResult> {
    const data = (await this.authed("/v2/checkout/orders", {
      intent: "CAPTURE",
      purchase_units: [
        {
          description: `${item} — via Agentic Commerce Concierge`,
          custom_id: merchant,
          amount: { currency_code: "USD", value: amountUSD.toFixed(2) },
        },
      ],
    })) as { id: string; status: string };
    return { id: data.id, status: data.status };
  }

  async captureOrder(orderId: string): Promise<PayPalCaptureResult> {
    const data = (await this.authed(`/v2/checkout/orders/${orderId}/capture`, {})) as {
      id: string;
      status: string;
    };
    return { id: data.id, status: data.status };
  }
}

/* ------------------------------------------------------------------ */
/* Mock PayPal client — same interface, no credentials, no network.     */
/* Simulates create/capture so the whole demo runs end-to-end.          */
/* ------------------------------------------------------------------ */

function mockId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

class MockPayPalClient implements PayPalClient {
  async createOrder(item: string, amountUSD: number): Promise<PayPalOrderResult> {
    await sleep(250);
    void item;
    void amountUSD;
    return { id: mockId("MOCK-ORDER"), status: "CREATED" };
  }

  async captureOrder(): Promise<PayPalCaptureResult> {
    await sleep(350);
    return { id: mockId("MOCK-CAP"), status: "COMPLETED" };
  }
}

let cached: PayPalClient | null = null;

/** Returns the real client when sandbox credentials exist, otherwise the mock. */
export function getPayPalClient(): PayPalClient {
  if (cached) return cached;
  cached = hasCredentials() ? new RealPayPalClient() : new MockPayPalClient();
  return cached;
}
