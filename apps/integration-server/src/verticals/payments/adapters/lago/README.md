# Lago adapter

Lago (https://getlago.com) is an open-source metering and usage-based billing
platform. It is invoice-centric rather than charge-centric: customers are
assigned plans via subscriptions, usage events accrue, and Lago issues invoices.
Payment collection is delegated to external providers (Stripe, GoCardless, etc.)
via Lago's payment provider integrations.

## Supported resources

| Resource     | Methods                                                        |
|--------------|----------------------------------------------------------------|
| Customer     | list, get, create, update, delete                              |
| Invoice      | list, get, void                                               |
| Refund       | list, get (via credit notes)                                   |
| Subscription | list, get, cancel                                             |
| Plan         | list, get                                                     |

## Unsupported resources (auto-501)

The following PaymentsAdapter resources are intentionally not implemented
because Lago has no native equivalent — it has no card-charge / acquiring layer:

- **Charge** — Lago does not process card charges directly. Payment orchestration
  is delegated to external providers (Stripe, GoCardless, Adyen, etc.).
- **PaymentMethod** — card/bank details are stored in the connected external
  payment provider, not in Lago.
- **Payout** — no acquiring layer, so no payout concept.
- **Dispute** — no acquiring layer, so no dispute concept.
- **Price** / **Product** — Lago uses Plans and Charges (plan components) rather
  than the Stripe-style Price/Product hierarchy.
- **BalanceTransaction** — no acquiring layer.

## Auth

A single organisation API key sent as a Bearer token (`Authorization: Bearer <key>`).
No OAuth, no refresh. The `baseUrl` credential selects the cloud region
(`https://api.getlago.com` for US, `https://api.eu.getlago.com` for EU) or a
self-hosted origin.

## Webhooks

HMAC-SHA256 over the raw request body, base64-encoded, delivered in the
`X-Lago-Signature` header.
