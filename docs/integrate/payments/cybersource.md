---
vertical: payments
platform: cybersource
title: Integrating Cybersource
auth_type: api_key
partner_program: false
estimated_time: 20min
last_verified: 2026-05-15
written_by: matt
---

# Cybersource

Visa-owned global enterprise gateway with strong fraud (Decision Manager) and 3-D Secure 2 tooling. Powers many Tier-1 merchants (airlines, big-box retail, hotels). REST API at `api.cybersource.com` (live) / `apitest.cybersource.com` (sandbox).

## Auth model

**HTTP Signature authentication** — every request signs a canonicalised header set + body digest with HMAC-SHA-256, keyed with the shared secret. Three credentials per merchant:

- **Merchant ID** — the Cybersource org identifier.
- **Key ID** (serial number) — issued in Enterprise Business Center under **Payment Configuration → Key Management → REST APIs**.
- **Shared secret key** — base64-encoded, paired with the Key ID.

The adapter computes the signature per request; you only paste the three credentials into the Connect Link form.

## Required adapter quirks

- **Sandbox is slow + rate-limited.** Expect 1–3 s per request and frequent 429s under load. Stick to single-threaded calls during integration testing.
- **Decimal money.** `orderInformation.amountDetails.totalAmount` is a decimal string in major units. The adapter multiplies by 100 to canonical minor units.
- **Long status enum.** `AUTHORIZED_PENDING_REVIEW`, `AUTHORIZED_RISK_DECLINED`, `PARTIAL_AUTHORIZED`, etc. The transform folds these into the canonical `ChargeStatus`; review the mapping in `transform/charge.ts` before going live.
- **Webhooks Service** is a separate product. Older merchant accounts may receive unsigned XML notifications via legacy endpoints; the adapter does not consume these — subscribe to the REST Webhooks Service instead.

## Webhooks

Configure under **Notification of Changes (NOC) / Webhooks** in the Business Center. Signed with HMAC-SHA-256 keyed with the webhook secret; signature in `Signature-Cybersource` (base64). Unsigned legacy notifications fall through structurally.

## References

- API reference: https://developer.cybersource.com/api-reference-assets/index.html
- Developer portal home: https://developer.cybersource.com/
- Product docs hub: https://docs.cybersource.com/
