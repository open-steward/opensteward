---
vertical: docsign
platform: foxit-esign
title: Integrating Foxit eSign
auth_type: api_key
partner_program: false
estimated_time: 10min
last_verified: 2026-05-20
written_by: claude
---

# Foxit eSign

Foxit-stack e-signature alongside Foxit PDF Editor. Rebrand of the former eSignGenie product.

## Auth model

Static API key (Bearer). Submit via Connect Link's credential form.

## Prerequisites

1. Foxit eSign account.
2. Generate an API key under **Account → API**.

## Webhooks

HMAC-SHA256 in `X-Esign-Signature` (hex).

## Refused fields

- Document content
- Signature images
