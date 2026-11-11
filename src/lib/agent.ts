import { addAudit, addOrder, getStore, nextId, spentTodayUSD, updateOrder, updateStore } from "./store";
import { getPayPalClient, getPayPalMode } from "./paypal";
import { evaluatePolicy } from "./policy";
import { parseIntent } from "./parser";
import type { ChatCard, ChatResponse, Order, StateSnapshot } from "./types";

/* ------------------------------------------------------------------ */
/* Shared purchase execution — used by BOTH agent paths.                */
/* Creates the PayPal order, applies the guardrail policy, and either   */
/* captures immediately (within limit) or parks it for human approval.  */
/* ------------------------------------------------------------------ */

export interface PurchaseOutcome {
  order: Order;
  captured: boolean;
  reply: string;
  card: ChatCard;
}

export async function executePurchase(
  item: string,
  amountUSD: number,
  merchant: string,
): Promise<PurchaseOutcome> {
  const client = getPayPalClient();
  const decision = evaluatePolicy(amountUSD, merchant);
  const now = new Date().toISOString();

  const pp = await client.createOrder(item, amountUSD, merchant);
  const order: Order = {
    id: nextId("ord"),
    paypalOrderId: pp.id,
    item,
    merchant,
    amount: amountUSD,
    currency: "USD",
    status: "CREATED",
    approvalRequired: decision.approvalRequired,
    approvalReason: decision.approvalRequired ? decision.reason : undefined,
    createdAt: now,
    updatedAt: now,
  };
  addOrder(order);

  addAudit(
    "agent",
    `Order created — ${item} ($${amountUSD.toFixed(2)})`,
    `PayPal order ${pp.id} via ${merchant}.`,
    decision.reason,
  );

  if (!decision.approvalRequired) {
    try {
      const cap = await client.captureOrder(pp.id);
      updateOrder(order.id, (o) => {
        o.status = "CAPTURED";
        o.captureId = cap.id;
        o.capturedAt = new Date().toISOString();
      });
      order.status = "CAPTURED";
      order.captureId = cap.id;
      order.capturedAt = new Date().toISOString();
      addAudit(
        "policy",
        `Auto-approved & captured — ${item}`,
        `Capture ${cap.id} completed.`,
        decision.reason,
      );
      return {
        order,
        captured: true,
        reply: `Done — I bought the ${item} for $${amountUSD.toFixed(2)} from ${merchant} and paid via PayPal. It's within your daily limit, so I captured the payment right away.`,
        card: {
          kind: "order",
          orderId: order.id,
          title: item,
          body: `Paid $${amountUSD.toFixed(2)} · ${merchant} · Capture ${cap.id}`,
        },
      };
    } catch (err) {
      updateOrder(order.id, (o) => {
        o.status = "FAILED";
      });
      order.status = "FAILED";
      const msg = err instanceof Error ? err.message : "capture failed";
      addAudit("system", `Capture failed — ${item}`, msg, "PayPal capture error.");
      return {
        order,
        captured: false,
        reply: `I created the PayPal order for the ${item} ($${amountUSD.toFixed(2)}), but the capture failed: ${msg}. The order is saved — you can retry from the dashboard.`,
        card: { kind: "order", orderId: order.id, title: item, body: `Capture failed · $${amountUSD.toFixed(2)}` },
      };
    }
  }

  addAudit(
    "policy",
    `Approval requested — ${item} ($${amountUSD.toFixed(2)})`,
    `Order ${pp.id} is waiting for your decision.`,
    decision.reason,
  );
  return {
    order,
    captured: false,
    reply: `I created the PayPal order for the ${item} ($${amountUSD.toFixed(2)} from ${merchant}), but I need your approval before paying. ${decision.reason}`,
    card: {
      kind: "approval",
      orderId: order.id,
      title: item,
      body: `$${amountUSD.toFixed(2)} · ${merchant} · ${decision.reason}`,
    },
  };
}

export async function approveOrder(orderId: string): Promise<{ ok: boolean; message: string }> {
  const s = getStore();
  const order = s.orders.find((o) => o.id === orderId);
  if (!order) return { ok: false, message: "Order not found." };
  if (order.status !== "CREATED") {
    return { ok: false, message: `Order is already ${order.status.toLowerCase()}.` };
  }
  try {
    const cap = await getPayPalClient().captureOrder(order.paypalOrderId);
    updateOrder(order.id, (o) => {
      o.status = "CAPTURED";
      o.captureId = cap.id;
      o.capturedAt = new Date().toISOString();
    });
    addAudit(
      "user",
      `Approved & captured — ${order.item}`,
      `Capture ${cap.id} completed after human approval.`,
      "Human approved a purchase above the auto-pay limit.",
    );
    return { ok: true, message: `Approved — paid $${order.amount.toFixed(2)} for the ${order.item}.` };
  } catch (err) {
    updateOrder(order.id, (o) => {
      o.status = "FAILED";
    });
    const msg = err instanceof Error ? err.message : "capture failed";
    addAudit("system", `Capture failed after approval — ${order.item}`, msg, "PayPal capture error.");
    return { ok: false, message: `Approval received, but capture failed: ${msg}` };
  }
}

export function denyOrder(orderId: string): { ok: boolean; message: string } {
  const s = getStore();
  const order = s.orders.find((o) => o.id === orderId);
  if (!order) return { ok: false, message: "Order not found." };
  if (order.status !== "CREATED") {
    return { ok: false, message: `Order is already ${order.status.toLowerCase()}.` };
  }
  updateOrder(order.id, (o) => {
    o.status = "DENIED";
  });
  addAudit(
    "user",
    `Denied — ${order.item} ($${order.amount.toFixed(2)})`,
    "Human denied the purchase. No money moved.",
    "Human review decision.",
  );
  return { ok: true, message: `Denied — I won't pay for the ${order.item}. No money moved.` };
}

/* ------------------------------------------------------------------ */
/* State snapshot for the UI.                                           */
/* ------------------------------------------------------------------ */

export function getState(): StateSnapshot {
  const s = getStore();
  return {
    paypalMode: getPayPalMode(),
    agentMode: process.env.ANTHROPIC_API_KEY ? "claude" : "rule-based",
    settings: s.settings,
    orders: s.orders,
    audit: s.audit,
    spentTodayUSD: spentTodayUSD(),
    pendingApprovals: s.orders.filter((o) => o.status === "CREATED" && o.approvalRequired),
    pendingPurchase: s.pendingPurchase,
  };
}

/* ------------------------------------------------------------------ */
/* Claude path — dormant unless ANTHROPIC_API_KEY is set.               */
/* Direct Messages API call with tool-calling; the server still owns    */
/* policy + PayPal execution through executePurchase.                   */
/* ------------------------------------------------------------------ */

const CLAUDE_TOOLS = [
  {
    name: "create_order",
    description:
      "Create a PayPal order to buy an item for the user. Use when the user asks to buy something and you know the item and price in USD.",
    input_schema: {
      type: "object" as const,
      properties: {
        item: { type: "string", description: "What to buy, e.g. 'wireless headphones'" },
        amount: { type: "number", description: "Price in USD" },
        merchant: { type: "string", description: "Store name if the user named one, e.g. 'Amazon'" },
      },
      required: ["item", "amount"],
    },
  },
];

interface ClaudeContent {
  type: string;
  text?: string;
  name?: string;
  input?: { item?: string; amount?: number; merchant?: string };
}

async function runClaudeAgent(message: string): Promise<ChatResponse | null> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  const model = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-20250514";
  const system = `You are Concierge, an AI shopping agent that spends on the user's behalf via PayPal (sandbox). You have one tool: create_order. Use it when the user asks to buy something with a known item and price in USD. If the price is missing, ask for it in plain text instead of calling the tool. Never invent prices. Keep replies to 1-2 short sentences. The server enforces a daily spending limit and human approval for large purchases — you do not need to decide that, just call create_order and report the result.`;

  const messages: { role: string; content: unknown }[] = [{ role: "user", content: message }];
  const cards: ChatCard[] = [];
  let reply = "";

  for (let step = 0; step < 3; step++) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: 512,
        system,
        tools: CLAUDE_TOOLS,
        messages,
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      addAudit("system", "Claude call failed", text.slice(0, 200), "Falling back to rule-based parser.");
      return null; // fall through to the deterministic parser
    }
    const data = (await res.json()) as { content: ClaudeContent[]; stop_reason: string };
    const toolUse = data.content.find((c) => c.type === "tool_use");
    const textPart = data.content.find((c) => c.type === "text");
    if (textPart?.text) reply = textPart.text;

    if (!toolUse || toolUse.name !== "create_order") break;

    const input = toolUse.input ?? {};
    const item = input.item ?? "item";
    const amount = typeof input.amount === "number" ? input.amount : NaN;
    let toolResult: string;
    if (!Number.isFinite(amount) || amount <= 0) {
      toolResult = "Invalid amount — ask the user for the price.";
    } else {
      const outcome = await executePurchase(item, amount, input.merchant ?? "Concierge Store");
      cards.push(outcome.card);
      reply = outcome.reply;
      toolResult = JSON.stringify({
        orderId: outcome.order.id,
        paypalOrderId: outcome.order.paypalOrderId,
        status: outcome.order.status,
        captured: outcome.captured,
      });
    }
    messages.push({ role: "assistant", content: data.content });
    messages.push({
      role: "user",
      content: [{ type: "tool_result", tool_use_id: (toolUse as { id?: string }).id, content: toolResult }],
    });
    if (data.stop_reason !== "tool_use") break;
  }

  if (!reply) reply = "Done — see the order card below.";
  return { reply, cards, state: getState() };
}

/* ------------------------------------------------------------------ */
/* Deterministic path — PRIMARY (no API key needed).                    */
/* ------------------------------------------------------------------ */

const DEFAULT_MERCHANT = "Concierge Store";

async function runRuleAgent(message: string): Promise<ChatResponse> {
  const intent = parseIntent(message);
  const cards: ChatCard[] = [];
  let reply: string;

  switch (intent.type) {
    case "greeting": {
      reply =
        "Hi, I'm Concierge — your AI shopping agent. Tell me what to buy and I'll pay with PayPal. Small purchases within your daily limit go through instantly; bigger ones wait for your one-tap approval. Try: “Buy wireless headphones for $45”.";
      break;
    }
    case "help": {
      reply =
        "Here's what I can do:\n• Buy things — “Buy a mechanical keyboard for $120”\n• Auto-pay anything within your daily limit (default $50/day, change it on the Dashboard)\n• Ask you to approve anything above the limit, or from a merchant not on your allowlist\n• Show spending — “How much have I spent today?” or “Show my orders”\n• Approve or deny a pending purchase — just say “approve” or “deny”";
      break;
    }
    case "spent": {
      const s = getStore();
      const spent = spentTodayUSD();
      const remaining = Math.max(0, s.settings.dailyLimitUSD - spent);
      reply = `You've spent $${spent.toFixed(2)} today, of a $${s.settings.dailyLimitUSD.toFixed(2)} daily limit — $${remaining.toFixed(2)} left before purchases need your approval.`;
      break;
    }
    case "orders": {
      const s = getStore();
      if (s.orders.length === 0) {
        reply = "No orders yet. Tell me something to buy — e.g. “Buy wireless headphones for $45”.";
      } else {
        reply = `Here are your ${Math.min(s.orders.length, 5)} most recent orders:`;
        for (const o of s.orders.slice(0, 5)) {
          cards.push({
            kind: "order",
            orderId: o.id,
            title: o.item,
            body: `$${o.amount.toFixed(2)} · ${o.merchant} · ${o.status}`,
          });
        }
      }
      break;
    }
    case "approve":
    case "deny": {
      const s = getStore();
      const pending = s.orders.filter((o) => o.status === "CREATED" && o.approvalRequired);
      const target = intent.target
        ? pending.find((o) => o.item.toLowerCase().includes(intent.target!.toLowerCase()))
        : pending[0];
      if (!target) {
        reply = "There's no purchase waiting for approval right now.";
        break;
      }
      if (intent.type === "approve") {
        const res = await approveOrder(target.id);
        reply = res.message;
        cards.push({ kind: "order", orderId: target.id, title: target.item, body: `$${target.amount.toFixed(2)} · ${target.merchant}` });
      } else {
        const res = denyOrder(target.id);
        reply = res.message;
        cards.push({ kind: "order", orderId: target.id, title: target.item, body: `$${target.amount.toFixed(2)} · ${target.merchant}` });
      }
      break;
    }
    case "price_only": {
      const s = getStore();
      const pending = s.pendingPurchase;
      if (!pending) {
        reply = `Got it — $${intent.amount.toFixed(2)}. What would you like me to buy at that price? Try “Buy wireless headphones for $45”.`;
        break;
      }
      updateStore((st) => {
        st.pendingPurchase = null;
      });
      const outcome = await executePurchase(pending.item, intent.amount, pending.merchant ?? DEFAULT_MERCHANT);
      reply = outcome.reply;
      cards.push(outcome.card);
      break;
    }
    case "purchase": {
      if (!intent.amount) {
        updateStore((st) => {
          st.pendingPurchase = { item: intent.item, merchant: intent.merchant };
        });
        reply = `How much is the ${intent.item}? Just tell me the price — e.g. “$45” or “45 dollars” — and I'll take care of the rest.`;
        break;
      }
      const outcome = await executePurchase(intent.item, intent.amount, intent.merchant ?? DEFAULT_MERCHANT);
      reply = outcome.reply;
      cards.push(outcome.card);
      break;
    }
    default: {
      reply =
        "I can buy things for you with PayPal — just say what and for how much. For example: “Buy wireless headphones for $45”. Say “help” to see everything I can do.";
      break;
    }
  }

  return { reply, cards, state: getState() };
}

/** Entry point: Claude when a key is configured, deterministic parser otherwise. */
export async function runAgent(message: string): Promise<ChatResponse> {
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const claude = await runClaudeAgent(message);
      if (claude) return claude;
    } catch (err) {
      addAudit("system", "Claude agent error", err instanceof Error ? err.message : String(err), "Falling back to rule-based parser.");
    }
  }
  return runRuleAgent(message);
}
