---
vertical: docsign
platform: signeasy
title: Integrating SignEasy
auth_type: oauth2
partner_program: false
estimated_time: 15min
last_verified: 2026-05-21
written_by: claude
---

# SignEasy

Global SMB e-signature, mobile-first. Strong in markets where DocuSign / Dropbox Sign are seen as enterprise-overkill.

## Auth model

OAuth 2.0 Authorization Code grant.

## Prerequisites

1. SignEasy account at [signeasy.com](https://signeasy.com).
2. Create a developer app at [docs.signeasy.com](https://docs.signeasy.com).
3. Add `<base-url>/auth/docsign/signeasy/callback` to the redirect URIs.

Set the client credentials as the adapter's config — on the platform's page in
the admin UI (`/platforms/docsign/signeasy`), or:

```bash
curl -X POST "$INTEGRATION_SERVER_URL/admin/platforms/docsign/signeasy/enable" \
  -H "X-Admin-Secret: $ADMIN_SECRET" -H "Content-Type: application/json" \
  -d '{"config":{"clientId":"...","clientSecret":"...","redirectUri":"<base-url>/auth/docsign/signeasy/callback"}}'
```

These are adapter settings, not environment variables: nothing reads a
`SIGNEASY_CLIENT_ID` from `.env`. See
[OAuth adapter credentials](../../environment/environment-variables.md#oauth-adapter-credentials).

## Webhooks

HMAC-SHA256 in `X-SignEasy-Signature` (hex).

## Refused fields

- Document content
- Signature images
