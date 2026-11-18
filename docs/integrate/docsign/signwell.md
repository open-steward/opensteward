---
vertical: docsign
platform: signwell
title: Integrating SignWell
auth_type: api_key
partner_program: false
estimated_time: 10min
last_verified: 2026-05-20
written_by: claude
---

# SignWell

Formerly Docsketch. Modern SMB e-signature API. Cleanest minimal envelope shape after Dropbox Sign.

## Auth model

Static API key in `X-Api-Key` header. Use Connect Link's credential form.

## Prerequisites

1. SignWell account at [signwell.com](https://www.signwell.com).
2. Generate an API key under **Settings → API**.

## Webhooks

HMAC-SHA256 in `X-SignWell-Signature` (hex).

## Refused fields

- Document content
- Signature images
