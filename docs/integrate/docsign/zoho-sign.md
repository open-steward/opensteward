---
vertical: docsign
platform: zoho-sign
title: Integrating Zoho Sign
auth_type: oauth2
partner_program: false
estimated_time: 15min
last_verified: 2026-05-20
written_by: claude
---

# Zoho Sign

Zoho's e-signature service. Best fit for operators already on Zoho CRM / Books / Desk.

## Auth model

OAuth 2.0 Authorization Code grant. Authorize at `https://accounts.zoho.com/oauth/v2/auth`; exchange at `https://accounts.zoho.com/oauth/v2/token`.

## Prerequisites

1. Create a Server-based application in the [Zoho API Console](https://api-console.zoho.com).
2. Add `<base-url>/auth/docsign/zoho-sign/callback` to the authorised redirect URIs.

Set the client credentials as the adapter's config — on the platform's page in
the admin UI (`/platforms/docsign/zoho-sign`), or:

```bash
curl -X POST "$INTEGRATION_SERVER_URL/admin/platforms/docsign/zoho-sign/enable" \
  -H "X-Admin-Secret: $ADMIN_SECRET" -H "Content-Type: application/json" \
  -d '{"config":{"clientId":"...","clientSecret":"...","redirectUri":"<base-url>/auth/docsign/zoho-sign/callback"}}'
```

These are adapter settings, not environment variables: nothing reads a
`ZOHO_SIGN_CLIENT_ID` from `.env`. See
[OAuth adapter credentials](../../environment/environment-variables.md#oauth-adapter-credentials).

## Required scopes

Default: `ZohoSign.documents.ALL ZohoSign.templates.ALL`.

## Webhooks

Zoho Sign signs webhook deliveries with HMAC-SHA256 of the raw body using the webhook secret. Signature in `X-ZohoSign-Webhook-Signature` (hex).

## Refused fields

- Document content
- Signature images
