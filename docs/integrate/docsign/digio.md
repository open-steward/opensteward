---
vertical: docsign
platform: digio
title: Integrating Digio
auth_type: api_key
partner_program: false
estimated_time: 20min
last_verified: 2026-05-20
written_by: claude
---

# Digio

Indian Aadhaar-based eSign aggregator. Backs onto NSDL e-Gov / CDSL Ventures qualified signing infrastructure.

## Auth model

HTTP Basic auth: `clientId:clientSecret` pair. Use Connect Link's credential form.

## Prerequisites

1. Digio account at [digio.in](https://www.digio.in).
2. Generate `client_id` + `client_secret` under **Integration → API**.

## Webhooks

HMAC-SHA256 in `X-Digio-Signature` (hex).

## Aadhaar-specific scope

Digio supports both Aadhaar-OTP eSign (legal under India IT Act §3A) and document-signature flows. The canonical `Envelope` schema covers both; per-signer authentication metadata lives in `Signer.metadata`.

## Refused fields

- Document content
- Aadhaar XML responses / KYC artifacts (Tier C territory, deliberately not on the canonical schema)
- Signature images
