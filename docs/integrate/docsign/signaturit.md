---
vertical: docsign
platform: signaturit
title: Integrating Signaturit
auth_type: api_key
partner_program: false
estimated_time: 15min
last_verified: 2026-05-20
written_by: claude
---

# Signaturit

Iberian eIDAS QES provider. Spain-based. Adds qualified-signature coverage in Iberia alongside Yousign (France).

## Auth model

Static API key (Bearer). Use Connect Link's credential form.

## Prerequisites

1. Signaturit account at [signaturit.com](https://www.signaturit.com).
2. Generate an API key under **Account → API**.

## Webhooks

HMAC-SHA256 in `X-Signaturit-Signature` (hex).

## Refused fields

- Document content
- Signature images / qualified certificates
