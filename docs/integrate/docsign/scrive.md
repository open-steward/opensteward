---
vertical: docsign
platform: scrive
title: Integrating Scrive
auth_type: oauth2
partner_program: false
estimated_time: 25min
last_verified: 2026-05-21
written_by: claude
---

# Scrive

Swedish e-signature, Nordic-wide. eIDAS QES + BankID (SE/NO/DK/FI) rail. Standard pick for operators serving customers across the Nordics.

## Auth model

OAuth 2.0 via Scrive Connect. Historical Scrive API supports OAuth 1.0a — the adapter targets OAuth 2.0 first and falls back to OAuth 1.0a if your Scrive plan requires it. See `apps/integration-server/src/verticals/docsign/adapters/scrive/constants.ts` for the endpoint paths.

## Prerequisites

1. Scrive account at [scrive.com](https://www.scrive.com).
2. Register an OAuth application via **Account → Integration Settings**.
3. Add `<base-url>/auth/docsign/scrive/callback` to the redirect URIs.

Set the client credentials as the adapter's config — on the platform's page in
the admin UI (`/platforms/docsign/scrive`), or:

```bash
curl -X POST "$INTEGRATION_SERVER_URL/admin/platforms/docsign/scrive/enable" \
  -H "X-Admin-Secret: $ADMIN_SECRET" -H "Content-Type: application/json" \
  -d '{"config":{"clientId":"...","clientSecret":"...","redirectUri":"<base-url>/auth/docsign/scrive/callback"}}'
```

These are adapter settings, not environment variables: nothing reads a
`SCRIVE_CLIENT_ID` from `.env`. See
[OAuth adapter credentials](../../environment/environment-variables.md#oauth-adapter-credentials).

## Nordic BankID identity rails

Scrive supports SE-BankID, NO-BankID, DK-MitID, and FI-Tupas as signer-authentication methods. The canonical `Signer.metadata.authenticationMode` captures which BankID rail was used per signer.

## Webhooks

HMAC-SHA256 in `X-Scrive-Signature` (hex).

## Refused fields

- Document content
- Evidence package cryptographic payloads (only the audit-trail log timestamps are surfaced)
- Signature images / qualified certificate blobs
