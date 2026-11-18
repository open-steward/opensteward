---
vertical: docsign
platform: penneo
title: Integrating Penneo
auth_type: api_key
partner_program: false
estimated_time: 20min
last_verified: 2026-05-21
written_by: claude
---

# Penneo

Danish e-signature + KYC provider, public on Nasdaq Copenhagen. Particularly common in **audit / accounting / legal** workflows across DK / NO / SE / FI.

## Auth model

API key + secret pair sent as HTTP Basic auth (`key:secret`). Use Connect Link's credential form.

## Prerequisites

1. Penneo account at [penneo.com](https://penneo.com).
2. Generate `apiKey` + `apiSecret` under **Settings → API**.

## Casefile model

Penneo organises envelopes as "casefiles" — each casefile contains one or more documents plus the signers. The adapter maps each `casefile` 1:1 to a canonical `Envelope`.

## Webhooks

HMAC-SHA256 in `X-Penneo-Signature` (hex).

## Refused fields

- Document content
- Signature images
- KYC artifacts (the docsign vertical does not cover Penneo's KYC product)
