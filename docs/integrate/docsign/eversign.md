---
vertical: docsign
platform: eversign
title: Integrating eversign
auth_type: api_key
partner_program: false
estimated_time: 10min
last_verified: 2026-05-20
written_by: claude
---

# eversign

SMB freemium e-signature. Originally part of Xodo.

## Auth model

Static API key sent as `?access_key=<apiKey>` query parameter on every request (note: NOT a Bearer header). Optional `business_id` for multi-business accounts.

## Prerequisites

1. eversign account at [eversign.com](https://eversign.com).
2. Generate an API key under **Settings → Developer**.

Set up via Connect Link's credential form: `apiKey` + optional `businessId`.

## Webhooks

HMAC-SHA256 in `X-Eversign-Signature` (hex). eversign also delivers some events with the signature in the body — the verifier accepts either form.

## Refused fields

- Document content
- Signature images
