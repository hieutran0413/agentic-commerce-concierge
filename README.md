# Agentic Commerce Concierge

An AI concierge that shops and pays on your behalf via **PayPal** — with guardrails.

Tell it what to buy in plain English and it creates a PayPal order for you:

- **Small purchases auto-pay** — anything at or under your daily spending limit
  (default **$50/day**, editable in the Dashboard) is captured immediately.
- **Big purchases wait for you** — anything above the limit, or from a merchant
  not on your allowlist, parks as an approval card. One tap to **Approve & pay**
  or **Deny**. No money moves without a human decision.
- **Every decision is logged** — the Dashboard shows all transactions and a full
  audit log with the reason behind each agent decision.

Built for the **PayPal AI Hackathon 2026** (targets the $5,000 **Best Use of
Agentic Commerce** prize). PayPal is central to the product; AI is the core
experience.

## Demo (no credentials needed)

The app runs end-to-end with **zero configuration**. Without PayPal sandbox
credentials it uses a built-in mock PayPal client with the exact same interface
as the real one, and the UI shows a **“Demo mode — mock PayPal”** badge. Without
an Anthropic key it uses a deterministic intent parser as the agent.

Try it:

1. `pnpm install && pnpm dev` — open http://localhost:3000
2. `Buy wireless headphones for $45` → auto-paid (under the $50 limit)
3. `Order a mechanical keyboard for $120` → approval card → **Approve & pay** → paid
4. `How much have I spent today?` → `$45.00 of $50.00`
5. Open the **Dashboard** — transactions, audit log, spending limit, merchant allowlist

## Run it

```bash
pnpm install
pnpm dev      # http://localhost:3000
pnpm build    # production build
pnpm start    # serve the production build
```

Requires Node 18+ (developed on Node 24, pnpm 12).

## Environment variables

Copy `.env.example` to `.env.local` and fill in what you have. Everything is
optional — the app works without any of them.

| Variable | Required | What it does |
|---|---|---|
| `PAYPAL_CLIENT_ID` | No | PayPal sandbox app Client ID. Without it, the mock client is used. |
| `PAYPAL_CLIENT_SECRET` | No | PayPal sandbox app Secret. Without it, the mock client is used. |
| `PAYPAL_MODE` | No | `sandbox` (default) or `live`. |
| `ANTHROPIC_API_KEY` | No | Enables Claude tool-calling as the agent. Without it, the deterministic rule-based intent parser is the agent. |
| `ANTHROPIC_MODEL` | No | Claude model (default `claude-sonnet-4-20250514`). |

To connect the real PayPal sandbox: create a free PayPal Developer account at
[developer.paypal.com](https://developer.paypal.com), create a Sandbox app, and
paste its Client ID / Secret into `.env.local`. No code changes needed — the
real client is selected automatically and the badge flips to **“Live PayPal
sandbox”**.

## Architecture

```
src/
  app/
    page.tsx              Chat UI — thread, order cards, approval cards
    dashboard/page.tsx    Transactions, audit log, guardrail settings
    api/
      chat/route.ts       POST { message } → agent reply + cards + state
      state/route.ts      GET full state (orders, audit, settings, modes)
      orders/[id]/approve|deny/route.ts   1-tap human approval
      settings/route.ts   POST daily limit / merchant allowlist
      reset/route.ts      POST wipe demo data (orders + audit)
  lib/
    agent.ts     Orchestrator: Claude tool-calling (if key) + deterministic
                 parser (primary). Shared purchase execution + policy.
    parser.ts    Deterministic intent parser — item, amount, merchant,
                 approve/deny, spending queries, pending-price follow-ups.
    policy.ts    Guardrails: daily limit + merchant allowlist.
    paypal.ts    PayPal client interface; real Orders v2 client (OAuth2
                 client-credentials → create → capture) + mock client.
    store.ts     In-memory store persisted to data/store.json (no database).
    types.ts     Shared types.
data/
  store.json     Created at runtime. Git-ignored — never committed.
```

**How a purchase flows:**

1. The user chats, e.g. `Buy wireless headphones for $45`.
2. The agent extracts item + amount (+ merchant if named) and calls
   `executePurchase`.
3. `executePurchase` creates a PayPal order (real Orders v2 or mock), then the
   policy engine decides:
   - within the remaining daily limit and merchant on the allowlist →
     **capture immediately**, audit entry `Auto-approved & captured`.
   - otherwise → order stays `CREATED`, an **approval card** appears, audit
     entry `Approval requested` with the reason.
4. Approve → capture runs, audit entry `Approved & captured`. Deny → order
   `DENIED`, audit entry `Denied`, no money moves.

**State:** a single JSON file (`data/store.json`) holds settings, orders, the
audit log, and the pending purchase. It is created on first run and
git-ignored. Note: on serverless hosts (e.g. Vercel) the filesystem is
ephemeral, so the store resets between cold starts — fine for the demo; swap
in a database for production.

## AI tools used

- **Anthropic Claude** (optional, via `ANTHROPIC_API_KEY`) — Messages API with
  tool-calling (`create_order`). The server still owns policy enforcement and
  PayPal execution; Claude only decides intent.
- **Deterministic intent parser** (default, no key needed) — regex-based
  extraction of item, price, and merchant, plus approve/deny and spending
  commands. This is the primary agent path in the demo.

## PayPal sandbox notes

- The real client uses the **Orders API v2**: `POST /v2/checkout/orders`
  (intent `CAPTURE`) and `POST /v2/checkout/orders/{id}/capture`, with an
  OAuth2 client-credentials token (`POST /v1/oauth2/token`).
- Sandbox only by default (`PAYPAL_MODE=sandbox`). No real money ever moves in
  the sandbox.
- Secrets live only in `.env.local` (git-ignored) and are used server-side
  only — never exposed to the client.

## License

MIT — see [LICENSE](LICENSE).
