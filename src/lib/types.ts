export type OrderStatus =
  | "CREATED" // PayPal order created, awaiting approval
  | "CAPTURED" // paid
  | "DENIED" // human denied the approval request
  | "FAILED"; // capture failed

export interface Order {
  id: string;
  paypalOrderId: string;
  item: string;
  merchant: string;
  amount: number;
  currency: string;
  status: OrderStatus;
  approvalRequired: boolean;
  approvalReason?: string;
  captureId?: string;
  createdAt: string;
  updatedAt: string;
  capturedAt?: string;
}

export type AuditActor = "agent" | "policy" | "user" | "system";

export interface AuditEntry {
  id: string;
  at: string;
  actor: AuditActor;
  action: string;
  detail: string;
  reason: string;
}

export interface Settings {
  dailyLimitUSD: number;
  merchants: string[];
}

export interface PendingPurchase {
  item: string;
  merchant?: string;
}

export interface StoreData {
  version: number;
  settings: Settings;
  orders: Order[];
  audit: AuditEntry[];
  pendingPurchase: PendingPurchase | null;
  seq: number;
}

export type PayPalMode = "live" | "mock";
export type AgentMode = "claude" | "rule-based";

export interface ChatCard {
  kind: "order" | "approval" | "info";
  orderId?: string;
  title: string;
  body: string;
}

export interface ChatResponse {
  reply: string;
  cards: ChatCard[];
  state: StateSnapshot;
}

export interface StateSnapshot {
  paypalMode: PayPalMode;
  agentMode: AgentMode;
  settings: Settings;
  orders: Order[];
  audit: AuditEntry[];
  spentTodayUSD: number;
  pendingApprovals: Order[];
  pendingPurchase: PendingPurchase | null;
}
