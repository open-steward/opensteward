---
vertical: docsign
platform: nitro-sign
title: Integrating Nitro Sign
auth_type: oauth2
partner_program: false
estimated_time: 15min
last_verified: 2026-05-20
written_by: claude
---

# Nitro Sign

Nitro-stack e-signature alongside Nitro PDF Pro.

## Auth model

OAuth 2.0 Authorization Code grant. Authorize at `https://api.nitro.com/oauth/authorize`; exchange at `/oauth/token`.

## Prerequisites

1. Create a Nitro developer app at [developers.gonitro.com](https://docs.gonitro.com/api).
2. Add `<base-url>/auth/docsign/nitro-sign/callback` to the redirect URIs.

## Webhooks

HMAC-SHA256 in `X-Nitro-Signature` (hex).

## Refused fields

- Document content
- Signature images
