---
vertical: docsign
platform: sproof-sign
title: Integrating Sproof Sign
auth_type: api_key
partner_program: false
estimated_time: 15min
last_verified: 2026-05-20
written_by: claude
---

# Sproof Sign

Austrian eIDAS QES provider.

## Auth model

Static API key in `X-Api-Key` header. Use Connect Link's credential form.

## Prerequisites

1. Sproof account at [sproof.io](https://www.sproof.io).
2. Generate an API key under **Settings → API**.

## Webhooks

HMAC-SHA256 in `X-Sproof-Signature` (hex).

## Refused fields

- Document content
- Qualified signature certificates
