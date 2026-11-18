---
vertical: docsign
platform: visma-sign
title: Integrating Visma Sign
auth_type: oauth2
partner_program: false
estimated_time: 20min
last_verified: 2026-05-21
written_by: claude
---

# Visma Sign

Finnish e-signature, part of the Visma SaaS stack. Common with SMB operators across the Nordic Visma ecosystem.

## Auth model

OAuth 2.0 Authorization Code grant via **Visma Connect** — Visma's centralised SSO.

## Prerequisites

1. Visma Sign account at [sign.visma.net](https://sign.visma.net).
2. Register an OAuth application via the Visma Developer Portal.
3. Add `<base-url>/auth/docsign/visma-sign/callback` to the redirect URIs.

Set the client credentials as the adapter's config — on the platform's page in
the admin UI (`/platforms/docsign/visma-sign`), or:

```bash
curl -X POST "$INTEGRATION_SERVER_URL/admin/platforms/docsign/visma-sign/enable" \
  -H "X-Admin-Secret: $ADMIN_SECRET" -H "Content-Type: application/json" \
  -d '{"config":{"clientId":"...","clientSecret":"...","redirectUri":"<base-url>/auth/docsign/visma-sign/callback"}}'
```

These are adapter settings, not environment variables: nothing reads a
`VISMA_SIGN_CLIENT_ID` from `.env`. See
[OAuth adapter credentials](../../environment/environment-variables.md#oauth-adapter-credentials).

## Required scopes

Default: `vismasign:read vismasign:write`.

## Webhooks

HMAC-SHA256 in `X-Visma-Signature` (hex).

## Refused fields

- Document content
- Signature images
