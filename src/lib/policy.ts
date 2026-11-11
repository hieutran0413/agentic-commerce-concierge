import { getStore, spentTodayUSD } from "./store";

export interface PolicyDecision {
  allowed: boolean;
  approvalRequired: boolean;
  reason: string;
}

/**
 * Guardrail policy, evaluated before any capture.
 * - Merchant not on the allowlist → human approval.
 * - Amount would exceed today's remaining spending limit → human approval.
 * - Otherwise auto-approve and capture immediately.
 */
export function evaluatePolicy(amountUSD: number, merchant: string): PolicyDecision {
  const s = getStore();
  const limit = s.settings.dailyLimitUSD;
  const spent = spentTodayUSD();
  const remaining = Math.max(0, limit - spent);

  const onAllowlist = s.settings.merchants.some(
    (m) => m.toLowerCase() === merchant.toLowerCase(),
  );

  if (merchant && !onAllowlist) {
    return {
      allowed: false,
      approvalRequired: true,
      reason: `"${merchant}" is not on your merchant allowlist.`,
    };
  }

  if (amountUSD > remaining) {
    return {
      allowed: false,
      approvalRequired: true,
      reason: `$${amountUSD.toFixed(2)} exceeds your remaining daily limit of $${remaining.toFixed(2)} (spent $${spent.toFixed(2)} of $${limit.toFixed(2)} today).`,
    };
  }

  return {
    allowed: true,
    approvalRequired: false,
    reason: `Within daily limit — $${amountUSD.toFixed(2)} of $${remaining.toFixed(2)} remaining today.`,
  };
}
