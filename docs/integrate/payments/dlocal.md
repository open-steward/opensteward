---
vertical: payments
platform: dlocal
title: Integrating dLocal
auth_type: api_key
partner_program: false
estimated_time: 15min
last_verified: 2026-05-15
written_by: matt
---

# dLocal

Cross-border collector for LatAm + APAC + Africa. Local methods (Boleto in BR, OXXO in MX, PIX in BR, alt cards everywhere, mobile money in Africa, bank transfers, …) via one global API. Settlement is per-country; the merchant gets one consolidated payout per currency.

## Auth model

Per-request HMAC-SHA-256 signature of `${xLogin}${xDate}${body}` keyed with the merchant secret. Three credentials per merchant (from **Settings → Account info → API credentials**):

- **X-Login** — short identifier.
- **X-Trans-Key** — paired transaction key.
- **Secret key** — used to sign requests.

The adapter computes the signature per call; you only paste the three values into the Connect Link form.

## Required adapter quirks

- **Status enum has country-flavour variants.** `PAID`, `AUTHORIZED`, `PENDING`, `REJECTED`, `CANCELLED`, `REFUNDED`, `PARTIALLY_REFUNDED`. The canonical transform folds them; check `transform/charge.ts` if you're seeing unexpected `pending` rows.
- **`status_detail` carries the local-method reason.** Use it to surface "PIX expired", "Boleto past due", "OXXO not yet paid", etc. as `Charge.failureCode`.
- **Multiple endpoints per resource.** dLocal's API splits payments, payouts, refunds across separate paths. The adapter abstracts that; expect higher latency on bulk operations because each maps to a distinct API call.
- **Sandbox sandbox quirks.** `sandbox.dlocal.com` accepts test-mode credentials but not all local methods are available end-to-end — Boleto and PIX require live keys + Brazilian sandbox accounts at the underlying bank.

## Webhooks

Configure notification URLs per merchant. Webhooks are signed with the same HMAC-SHA-256 scheme as outbound API requests — the body is the signing material instead of `${xLogin}${xDate}${body}`. The signature ships in `Authorization: V2-HMAC-SHA256, Signature: …`.

## References

- API reference: https://docs.dlocal.com/reference/api
- Getting started: https://docs.dlocal.com/docs/get-started
- Docs home: https://docs.dlocal.com/
