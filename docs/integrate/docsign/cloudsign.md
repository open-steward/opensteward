---
vertical: docsign
platform: cloudsign
title: Integrating CloudSign
auth_type: oauth2
partner_program: false
estimated_time: 20min
last_verified: 2026-05-21
written_by: claude
---

# CloudSign

CloudSign (GMO Cloud) is the dominant Japanese e-signature provider.

## Auth model

OAuth 2.0 Authorization Code grant.

## Prerequisites

1. CloudSign account at [cloudsign.jp](https://www.cloudsign.jp).
2. Register an OAuth application through CloudSign's developer console.
3. Add `<base-url>/auth/docsign/cloudsign/callback` to the redirect URIs.

Set the client credentials as the adapter's config — on the platform's page in
the admin UI (`/platforms/docsign/cloudsign`), or:

```bash
curl -X POST "$INTEGRATION_SERVER_URL/admin/platforms/docsign/cloudsign/enable" \
  -H "X-Admin-Secret: $ADMIN_SECRET" -H "Content-Type: application/json" \
  -d '{"config":{"clientId":"...","clientSecret":"...","redirectUri":"<base-url>/auth/docsign/cloudsign/callback"}}'
```

These are adapter settings, not environment variables: nothing reads a
`CLOUDSIGN_CLIENT_ID` from `.env`. See
[OAuth adapter credentials](../../environment/environment-variables.md#oauth-adapter-credentials).

## API documentation language

CloudSign's developer documentation is primarily Japanese. The adapter uses best-known endpoint paths; verify in `apps/integration-server/src/verticals/docsign/adapters/cloudsign/constants.ts` against your account's developer portal.

## Webhooks

HMAC-SHA256 in `X-CloudSign-Signature` (hex).

## Refused fields

- Document content
- Signature images
