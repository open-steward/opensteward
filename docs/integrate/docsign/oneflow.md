---
vertical: docsign
platform: oneflow
title: Integrating Oneflow
auth_type: oauth2
partner_program: false
estimated_time: 20min
last_verified: 2026-05-21
written_by: claude
---

# Oneflow

Swedish contract-automation platform with native e-signature. Useful when operators want the contract drafting + negotiation surface alongside signing — Oneflow renders structured contracts to PDF for signing rather than uploading pre-rendered files.

## Auth model

OAuth 2.0 Authorization Code grant.

## Prerequisites

1. Oneflow account at [oneflow.com](https://oneflow.com).
2. Register an OAuth application via [developers.oneflow.com](https://developers.oneflow.com).
3. Add `<base-url>/auth/docsign/oneflow/callback` to the redirect URIs.

Set the client credentials as the adapter's config — on the platform's page in
the admin UI (`/platforms/docsign/oneflow`), or:

```bash
curl -X POST "$INTEGRATION_SERVER_URL/admin/platforms/docsign/oneflow/enable" \
  -H "X-Admin-Secret: $ADMIN_SECRET" -H "Content-Type: application/json" \
  -d '{"config":{"clientId":"...","clientSecret":"...","redirectUri":"<base-url>/auth/docsign/oneflow/callback"}}'
```

These are adapter settings, not environment variables: nothing reads a
`ONEFLOW_CLIENT_ID` from `.env`. See
[OAuth adapter credentials](../../environment/environment-variables.md#oauth-adapter-credentials).

## Contract-automation model

Oneflow treats the **contract** as the envelope. The contract body (clauses, sections, fields) is structured data — but only metadata flows through the canonical schema. The rendered-PDF document is single-per-envelope.

## Webhooks

HMAC-SHA256 in `X-Oneflow-Signature` (hex).

## Refused fields

- Contract body content (the structured clause tree)
- Rendered PDF bytes
- Signature images
