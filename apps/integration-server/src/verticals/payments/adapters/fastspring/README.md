# FastSpring adapter

FastSpring is a merchant-of-record commerce platform for selling software and SaaS products.

## Supported resources

| Resource      | Methods             | Notes                                     |
|---------------|---------------------|-------------------------------------------|
| Customers     | list, get           | Maps FastSpring Accounts                  |
| Charges       | list, get           | Maps FastSpring Orders                    |
| Subscriptions | list, get, cancel   | Maps FastSpring Subscriptions             |
| Products      | list, get           | Maps FastSpring Products                  |

## Unsupported resources

The following `PaymentsAdapter` interface methods are **not implemented** and return `501 Not Implemented`:

- **Refunds** — FastSpring does not expose a standalone Refund REST resource. Refund activity is embedded inside Order objects (e.g. `order.refunded`, `order.refundedDisplay`). There is no `/refunds` endpoint to list or retrieve individual refund records, so `transform/refund.ts` is intentionally absent.
- **Invoices** — Not a separate API resource; invoice PDFs are accessed via `order.invoiceUrl`.
- **PaymentMethods** — FastSpring is a merchant-of-record; it manages payment processing internally and does not expose raw card/wallet objects.
- **Payouts** — No payout/settlement API.
- **Disputes** — No dispute/chargeback API.
- **Plans / Prices** — Pricing is embedded in Product objects.
- **BalanceTransactions** — No ledger/balance-transaction API.

## Auth

HTTP Basic authentication using an API username and password. No OAuth flow; credentials are submitted via the Connect Link form and exchanged directly.

## Money

FastSpring quotes all monetary amounts in **major units** (e.g. `total: 60.0`). All transform files scale by 100 to produce the canonical integer minor-unit representation.

## Timestamps

FastSpring emits timestamps as **epoch-millisecond integers** (e.g. `changed: 1751898991060`). `toIsoDatetime()` from `@opensteward/shared` handles these correctly (it detects values > 9,999,999,999 as milliseconds).

## API reference

https://developer.fastspring.com/reference/
