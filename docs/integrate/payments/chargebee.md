---
vertical: payments
platform: chargebee
title: Integrating Chargebee
auth_type: api_key
partner_program: false
estimated_time: 10min
last_verified: 2026-05-15
written_by: matt
---

# Chargebee

Subscription-billing platform that sits on top of an **underlying gateway** (Stripe, Adyen, Braintree, Razorpay, Authorize.Net, etc.). Chargebee owns the subscription / invoice / dunning logic; the underlying gateway moves the money.

## Auth model

HTTP Basic with the **API key as the username** (password blank). Generate keys under **Settings → Configure Chargebee → API Keys → Add API Key**. Use a "Full Access" key (read + write); narrower scopes (read-only, restricted) work but `cancelSubscription` requires write.

Submit two fields to the Connect Link form: the **Chargebee site** (subdomain, e.g. `mycompany-test` for `mycompany-test.chargebee.com`) and the API key.

## Required adapter quirks (read this!)

- **`Charge.gateway = 'chargebee'`, NOT the underlying processor.** Per the canonical convention, the biller (Chargebee) is the recorded gateway; the actual money-mover (Stripe / Adyen / …) sits under `Charge.metadata.processor`. **This means the same money may appear under two adapters** — once via Chargebee and once via Stripe — if both connections are configured. That's by design, not a bug; consumers should dedupe by `metadata.processor` or by external reference if they need a single-row view.
- **Form-encoded bodies, bracket-notation nesting.** Same convention as Stripe; the adapter's `toForm()` helper handles it transparently.
- **Webhooks use HTTP Basic auth on the receiver.** Chargebee doesn't sign deliveries cryptographically — instead, the merchant configures a username + password on the webhook endpoint, and Chargebee adds `Authorization: Basic …` to every delivery. Set the same credential in the route-handler / reverse-proxy layer.

## References

- API reference: https://apidocs.chargebee.com/docs/api/
- Webhook events: https://apidocs.chargebee.com/docs/api/events
- Underlying gateway concept: https://www.chargebee.com/docs/
