---
vertical: docsign
platform: onespan-sign
title: Integrating OneSpan Sign
auth_type: api_key
partner_program: false
estimated_time: 20min
last_verified: 2026-05-20
written_by: claude
---

# OneSpan Sign

Enterprise e-signature (formerly eSignLive). Strong in financial-services regulated workflows.

## Auth model

Static API key. Submit via Connect Link's credential form. `Authorization: Basic <apiKey>` per OneSpan convention.

## Prerequisites

1. OneSpan Sign sandbox or production account.
2. Generate an API key under **Account → Integration**.

Set up via Connect Link's credential form — no OAuth callback to register.

## Webhooks

HMAC-SHA256 in `X-Esl-Signature` (hex).

## Refused fields

- Document content
- Signature images
