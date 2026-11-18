---
vertical: payments
platform: recurly
title: Integrating Recurly
auth_type: api_key
partner_program: false
estimated_time: 10min
last_verified: 2026-05-15
written_by: matt
---

# Recurly

Mid-market subscription-billing platform — strong dunning and revenue-recognition tooling. Sits on top of an underlying gateway (Stripe, Adyen, Braintree, Authorize.Net, …) like Chargebee.

## Auth model

HTTP Basic with the **Private API key as the username** (password blank). Generate under **Integrations → API Credentials**.

## Required adapter quirks (read this!)

- **`Charge.gateway = 'recurly'`, NOT the underlying processor.** Same convention as Chargebee — biller is the recorded gateway, `metadata.processor` names the actual money-mover. The same charge may appear via both Recurly and (e.g.) Stripe if both connections are configured.
- **Versioned API.** Recurly v3 pins the version via `Accept: application/vnd.recurly.v2021-02-25+json`. Bump after re-testing.
- **Webhooks are unsigned XML.** Recurly doesn't cryptographically sign deliveries. Standard practice is to allow-list source IPs and put the webhook URL behind a hard-to-guess path. The adapter parses both signed-JSON (newer) and unsigned-XML (legacy) shapes.
- **Cancel vs terminate.** `cancelSubscription({ atPeriodEnd: true })` schedules cancellation for the end of the current term; `atPeriodEnd: false` calls `terminate` for immediate cancellation. Pick deliberately.

## References

- API reference: https://developers.recurly.com/api/v2021-02-25/index.html
- Webhooks: https://docs.recurly.com/docs/webhooks
