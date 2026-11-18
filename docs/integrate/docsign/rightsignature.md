---
vertical: docsign
platform: rightsignature
title: Integrating RightSignature
auth_type: oauth2
partner_program: false
estimated_time: 15min
last_verified: 2026-05-20
written_by: claude
---

# RightSignature

Citrix product (part of the ShareFile family).

## Auth model

OAuth 2.0 Authorization Code grant. Authorize at `https://app.rightsignature.com/oauth/authorize`; exchange at `/oauth/token`.

## Prerequisites

1. ShareFile/RightSignature account.
2. Register an OAuth client via Citrix's developer portal.
3. Add `<base-url>/auth/docsign/rightsignature/callback` to redirect URIs.

## Webhooks

HMAC-SHA256 in `X-RightSignature-Signature` (hex).

## Refused fields

- Document content
- Signature images
