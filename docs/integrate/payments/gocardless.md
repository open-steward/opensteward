---
vertical: payments
platform: gocardless
title: Integrating GoCardless
auth_type: api_key
partner_program: false
estimated_time: 10min
last_verified: 2026-05-15
written_by: matt
---

# GoCardless

Direct-debit + bank-payment gateway. Primary in UK / EU SEPA / Australia BECS; mandates are first-class.

## Auth model

`api_key` (long-lived access token). Submit it via the Connect Link form; the adapter sets `Authorization: Bearer <token>`.

GoCardless also offers OAuth for partner apps ("OAuth allows you to act on behalf of other GoCardless accounts", https://docs.gocardless.com/docs/api-reference/oauth-reference). OpenSteward does not implement that partner-app flow: the access token above is the only way to connect.

## Configure in admin

1. Sign in at https://manage.gocardless.com (live) or https://manage-sandbox.gocardless.com (sandbox).
2. **Developers → Access tokens**, generate a token, copy it.
3. Open `/platforms` → Payments → GoCardless → **Configure** and submit:
   - `accessToken`
   - `environment` — `live` or `sandbox`

## Webhooks

Configure at **Developers → Webhook endpoints**. Subscribe to:

- `payments`, `refunds`, `subscriptions`, `mandates`, `payouts`, `customers`

The adapter verifies the `Webhook-Signature` header (HMAC-SHA-256 of the raw body with the endpoint's secret).

## Quirks

- **`Mandate` is the canonical PaymentMethod** for direct-debit semantics. The adapter surfaces mandates as `PaymentMethod` rows with `type: 'mandate'` and stores the bank-account detail under `metadata`.
- **Payment lifecycle is multi-step.** `pending_submission → pending_customer_approval → submitted → confirmed → paid_out`. The adapter maps each to the canonical `ChargeStatus`.
- **No Dispute resource** — chargebacks emerge as `payment.failed` with `cause = chargeback`.
- **`GoCardless-Version` header** is pinned to `2015-07-06` (the stable API version).

## References

- API introduction: https://developer.gocardless.com/getting-started/api/introduction/
- Developer portal home: https://developer.gocardless.com/
