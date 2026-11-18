---
vertical: docsign
platform: getaccept
title: Integrating GetAccept
auth_type: oauth2
partner_program: false
estimated_time: 15min
last_verified: 2026-05-20
written_by: claude
---

# GetAccept

Sales-focused proposal + e-signature. Often deployed alongside CRM (Salesforce, HubSpot, Pipedrive).

## Auth model

OAuth 2.0 Authorization Code grant. Authorize at `https://app.getaccept.com/oauth/authorize`; exchange at `https://api.getaccept.com/v1/auth`.

## Prerequisites

1. Create a GetAccept developer app at [developers.getaccept.com](https://developers.getaccept.com).
2. Add `<base-url>/auth/docsign/getaccept/callback` to the redirect URIs.

## Webhooks

HMAC-SHA256 in `X-GetAccept-Signature` (hex).

## Refused fields

- Document content
- Signature images
