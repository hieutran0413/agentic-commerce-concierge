/**
 * Deterministic intent parser — the PRIMARY agent path.
 * No API key required. Extracts a purchase intent (item + amount + merchant)
 * from plain English and drives the same PayPal tools the Claude path uses.
 *
 * Demo-hardened for:
 *   "buy wireless headphones for $45"
 *   "order a mechanical keyboard for $120"
 *   "buy a $25 book from Amazon"
 *   "buy headphones"            → asks for the price, remembers the item
 *   "$45" / "45 dollars"        → completes a pending purchase
 *   "how much have I spent today?" / "show my orders" / "help"
 *   "approve" / "deny"          → acts on the latest pending approval
 */

export type ParsedIntent =
  | { type: "purchase"; item: string; amount: number | null; merchant?: string }
  | { type: "price_only"; amount: number }
  | { type: "approve"; target?: string }
  | { type: "deny"; target?: string }
  | { type: "spent" }
  | { type: "orders" }
  | { type: "help" }
  | { type: "greeting" }
  | { type: "unknown" };

const BUY_VERBS = /\b(buy|order|purchase|get|grab|pick up|snag)\b/i;
const AMOUNT_DOLLAR = /\$\s?(\d+(?:[.,]\d{1,2})?)/;
const AMOUNT_WORD = /(\d+(?:[.,]\d{1,2})?)\s*(?:dollars?|usd|bucks?)\b/i;
const AMOUNT_FOR = /\bfor\s+(\d+(?:[.,]\d{1,2})?)\b/i;
const MERCHANT_RE = /\b(?:from|at|on)\s+([A-Z][A-Za-z0-9][A-Za-z0-9 &.'-]*)/;

function parseAmount(text: string): number | null {
  const m = text.match(AMOUNT_DOLLAR) ?? text.match(AMOUNT_WORD) ?? text.match(AMOUNT_FOR);
  if (!m) return null;
  const n = parseFloat(m[1].replace(",", "."));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

function cleanItem(raw: string): string {
  let item = raw.replace(/\s+/g, " ").trim();
  item = item.replace(/^(a|an|the|some)\s+/i, "");
  item = item.replace(/\s+for$/i, "").trim();
  if (!item) return item;
  return item.charAt(0).toUpperCase() + item.slice(1);
}

function extractItem(text: string): string {
  const verb = text.match(BUY_VERBS);
  let rest = verb ? text.slice((verb.index ?? 0) + verb[0].length) : text;
  // Remove the amount clause wherever it sits ("$25 book" / "book for $25").
  rest = rest.replace(AMOUNT_DOLLAR, "").replace(AMOUNT_WORD, "").replace(AMOUNT_FOR, "");
  // Remove a trailing merchant clause ("from Amazon").
  rest = rest.replace(/\s+(?:from|at|on)\s+[A-Za-z][A-Za-z0-9 &.'-]*$/i, "");
  // Remove trailing filler.
  rest = rest.replace(/\s+for\s+me$/i, "").replace(/\s+please\.?$/i, "");
  return cleanItem(rest);
}

function extractMerchant(text: string): string | undefined {
  const m = text.match(MERCHANT_RE);
  if (!m) return undefined;
  const name = m[1].replace(/[.,!?]+$/, "").trim();
  return name || undefined;
}

export function parseIntent(raw: string): ParsedIntent {
  const text = raw.trim();
  const lower = text.toLowerCase();

  // yes/no approval shortcuts — only when the message is just that word
  if (/^(yes|yeah|yep|yup|ok|okay|approve|confirm|go ahead|do it|approved)\.?$/i.test(text)) {
    return { type: "approve" };
  }
  if (/^(no|nope|deny|decline|reject|cancel|denied)\.?$/i.test(text)) {
    return { type: "deny" };
  }
  const approveTarget = text.match(/^(?:approve|confirm)\s+(?:the\s+)?(.+)$/i);
  if (approveTarget) return { type: "approve", target: approveTarget[1].trim() };
  const denyTarget = text.match(/^(?:deny|decline|reject|cancel)\s+(?:the\s+)?(.+)$/i);
  if (denyTarget) return { type: "deny", target: denyTarget[1].trim() };

  if (/\b(how much|how much money)\b.*\b(spent|spend|paid)\b/i.test(lower) || /\bspent today\b/i.test(lower) || /\bmy (spending|balance)\b/i.test(lower)) {
    return { type: "spent" };
  }
  if (/\b(show|list|see|view|what are|what did i)\b.*\b(orders?|purchases?|bought|transactions?)\b/i.test(lower) || lower === "my orders" || lower === "orders") {
    return { type: "orders" };
  }
  if (/\bhelp\b/i.test(lower) || /what can you do/i.test(lower) || /how (do|does) (this|it) work/i.test(lower)) {
    return { type: "help" };
  }
  if (/^(hi|hello|hey|yo|hiya|good (morning|afternoon|evening))\b/i.test(lower)) {
    return { type: "greeting" };
  }

  const amount = parseAmount(text);

  // Bare price → completes a pending purchase ("buy headphones" … "$45")
  if (amount !== null && !BUY_VERBS.test(text) && /^\$?\s?\d/.test(text) && text.length < 30) {
    return { type: "price_only", amount };
  }

  if (BUY_VERBS.test(text)) {
    const item = extractItem(text);
    const merchant = extractMerchant(text);
    return { type: "purchase", item: item || "item", amount, merchant };
  }

  return { type: "unknown" };
}
