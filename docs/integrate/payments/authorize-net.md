---
vertical: payments
platform: authorize-net
title: Integrating Authorize.Net
auth_type: api_key
partner_program: false
estimated_time: 15min
last_verified: 2026-05-15
written_by: matt
---

# Authorize.Net

Long-running US gateway (Visa-owned; founded 1996). Ubiquitous in SMB — the default option many US merchants land on through their bank or PSP. Authorize.Net exposes both XML and JSON surfaces over the same endpoint; **use the JSON variant**.

## Auth model

API Login ID + Transaction Key from the merchant dashboard under **Account → Security Settings → API Credentials & Keys**.

## Required adapter quirks

- **Wrapped requests.** Every API call posts to `/xml/v1/request.api` with a single top-level operation key (`createTransactionRequest`, `getTransactionDetailsRequest`, …) and a `merchantAuthentication` block. The adapter handles the wrapping; callers see canonical resource ops.
- **Currency defaults to USD.** Authorize.Net's merchant account is single-currency; the API doesn't echo currency per transaction. The transform stamps `Charge.currency = 'USD'`; multi-currency setups should override at the merchant-account level.
- **AcceptHosted token flow** is required for SAQ-A PCI scope — operators who collect card data directly stay in SAQ-D. Document the chosen scope in the integration plan.

## Webhooks

Configure in **Account → Webhooks**. HMAC-SHA-512 of the raw body keyed with the Signature Key, hex-encoded in `X-ANET-Signature` (with a `sha512=` prefix).

## References

- API reference: https://developer.authorize.net/api/reference/
- Webhooks: https://developer.authorize.net/api/reference/features/webhooks.html
