import fs from "node:fs";
import path from "node:path";
import type { AuditActor, AuditEntry, Order, Settings, StoreData } from "./types";

const DATA_DIR = path.join(process.cwd(), "data");
const STORE_PATH = path.join(DATA_DIR, "store.json");

export const DEFAULT_SETTINGS: Settings = {
  dailyLimitUSD: 50,
  // "Concierge Store" is the agent's own generic storefront — allowed by
  // default so plain "buy X for $Y" requests auto-pay within the limit.
  merchants: ["Concierge Store", "Amazon", "eBay", "Target", "Walmart", "Best Buy"],
};

function seed(): StoreData {
  return {
    version: 1,
    settings: { ...DEFAULT_SETTINGS, merchants: [...DEFAULT_SETTINGS.merchants] },
    orders: [],
    audit: [
      {
        id: "audit-seed",
        at: new Date().toISOString(),
        actor: "system",
        action: "Concierge initialized",
        detail: "Spending limit $50/day. Mock PayPal active until sandbox credentials are configured.",
        reason: "First run — fresh store created.",
      },
    ],
    pendingPurchase: null,
    seq: 1,
  };
}

let cache: StoreData | null = null;

function load(): StoreData {
  if (cache) return cache;
  try {
    const raw = fs.readFileSync(STORE_PATH, "utf-8");
    const parsed = JSON.parse(raw) as StoreData;
    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.orders)) {
      throw new Error("invalid store file");
    }
    cache = parsed;
    return parsed;
  } catch {
    cache = seed();
    persist();
    return cache;
  }
}

function persist() {
  if (!cache) return;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(STORE_PATH, JSON.stringify(cache, null, 2), "utf-8");
}

export function getStore(): StoreData {
  return load();
}

export function updateStore(fn: (s: StoreData) => void): StoreData {
  const s = load();
  fn(s);
  persist();
  return s;
}

export function nextId(prefix: string): string {
  const s = load();
  const id = `${prefix}-${s.seq}`;
  s.seq += 1;
  return id;
}

export function addAudit(
  actor: AuditActor,
  action: string,
  detail: string,
  reason: string,
): AuditEntry {
  const entry: AuditEntry = {
    id: nextId("audit"),
    at: new Date().toISOString(),
    actor,
    action,
    detail,
    reason,
  };
  updateStore((s) => {
    s.audit.unshift(entry);
    s.audit = s.audit.slice(0, 200);
  });
  return entry;
}

export function addOrder(order: Order): Order {
  updateStore((s) => {
    s.orders.unshift(order);
  });
  return order;
}

export function updateOrder(id: string, fn: (o: Order) => void): Order | null {
  let found: Order | null = null;
  updateStore((s) => {
    const o = s.orders.find((x) => x.id === id);
    if (o) {
      fn(o);
      o.updatedAt = new Date().toISOString();
      found = o;
    }
  });
  return found;
}

export function resetStore(): StoreData {
  cache = seed();
  persist();
  return cache;
}

export function spentTodayUSD(now = new Date()): number {
  const s = load();
  const day = now.toISOString().slice(0, 10);
  return s.orders
    .filter((o) => o.status === "CAPTURED" && o.capturedAt?.slice(0, 10) === day)
    .reduce((sum, o) => sum + o.amount, 0);
}
