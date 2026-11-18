---
vertical: docsign
platform: d4sign
title: Integrating D4Sign
auth_type: api_key
partner_program: false
estimated_time: 15min
last_verified: 2026-05-20
written_by: claude
---

# D4Sign

Brazilian e-signature, secondary BR source after Clicksign.

## Auth model

Two-part credential: `tokenAPI` + `cryptKey`. Both supplied via Connect Link's credential form and stored on `credentials.extra`.

## Prerequisites

1. D4Sign account at [d4sign.com.br](https://d4sign.com.br).
2. Generate `tokenAPI` and `cryptKey` under **Configurações → Tokens da API**.

## Webhooks

HMAC-SHA256 in `X-D4Sign-Signature` (hex).

## Refused fields

- Document content
- ICP-Brasil signature certificates
