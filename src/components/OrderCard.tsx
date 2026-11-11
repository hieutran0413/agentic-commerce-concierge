import type { Order } from "@/lib/types";

export function StatusPill({ status }: { status: Order["status"] }) {
  const styles: Record<Order["status"], string> = {
    CREATED: "bg-gold-soft text-[#7a5b00] ring-1 ring-[#e8c96a]",
    CAPTURED: "bg-mint-soft text-mint ring-1 ring-[#bfe3d4]",
    DENIED: "bg-rose-soft text-rose ring-1 ring-[#f3c1bd]",
    FAILED: "bg-rose-soft text-rose ring-1 ring-[#f3c1bd]",
  };
  const labels: Record<Order["status"], string> = {
    CREATED: "Awaiting approval",
    CAPTURED: "Paid",
    DENIED: "Denied",
    FAILED: "Failed",
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${styles[status]}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {labels[status]}
    </span>
  );
}

export function fmtTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function money(n: number): string {
  return `$${n.toFixed(2)}`;
}

export function OrderCard({
  order,
  onApprove,
  onDeny,
  busy,
}: {
  order: Order;
  onApprove?: (id: string) => void;
  onDeny?: (id: string) => void;
  busy?: boolean;
}) {
  const isApproval = order.status === "CREATED" && order.approvalRequired;
  return (
    <div
      className={`animate-fade-up overflow-hidden rounded-2xl border bg-white shadow-[0_1px_2px_rgba(28,36,51,0.06)] ${
        isApproval ? "border-[#e8c96a] ring-2 ring-gold/40" : "border-line"
      }`}
    >
      <div className="flex items-start justify-between gap-3 px-4 pt-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
            {isApproval ? "Needs your approval" : "PayPal order"}
          </p>
          <p className="mt-0.5 text-[17px] font-bold leading-snug text-ink">{order.item}</p>
          <p className="mt-0.5 text-sm text-ink-soft">{order.merchant}</p>
        </div>
        <div className="text-right">
          <p className="text-[20px] font-bold tracking-tight text-ink">{money(order.amount)}</p>
          <StatusPill status={order.status} />
        </div>
      </div>

      {isApproval && order.approvalReason && (
        <p className="mx-4 mt-3 rounded-xl bg-gold-soft px-3 py-2 text-[13px] leading-relaxed text-[#6b5200]">
          {order.approvalReason}
        </p>
      )}

      <div className="mt-3 border-t border-line bg-paper/60 px-4 py-2.5 font-mono text-[11px] leading-relaxed text-ink-faint">
        <p>
          Order <span className="text-ink-soft">{order.paypalOrderId}</span>
        </p>
        {order.captureId && (
          <p>
            Capture <span className="text-ink-soft">{order.captureId}</span>
          </p>
        )}
        <p>{fmtTime(order.createdAt)}</p>
      </div>

      {isApproval && onApprove && onDeny && (
        <div className="flex gap-2 px-4 pb-4 pt-3">
          <button
            onClick={() => onApprove(order.id)}
            disabled={busy}
            className="flex-1 rounded-xl bg-navy px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-paypal-deep disabled:opacity-50"
          >
            {busy ? "Approving…" : "Approve & pay"}
          </button>
          <button
            onClick={() => onDeny(order.id)}
            disabled={busy}
            className="flex-1 rounded-xl border border-line bg-white px-4 py-2.5 text-sm font-semibold text-rose transition hover:bg-rose-soft disabled:opacity-50"
          >
            Deny
          </button>
        </div>
      )}
    </div>
  );
}
