# Signicat adapter

Signicat Sign API v2 → canonical docsign schema.

## Canonical mapping

| Signicat                  | Canonical    |
| ------------------------- | ------------ |
| signing session           | `Envelope`   |
| signing setup (per slot)  | `Signer` (synthesised) |
| session document          | `Document` (metadata only) |

Signicat addresses resources by id and exposes **no** list/search endpoint, audit-trail endpoint, or templates in the Sign API, so `listEnvelopes`, `listAuditTrailEntries` / `getAuditTrailEntry`, and `listTemplates` / `getTemplate` are not implemented and resolve to 501.

## Auth (OAuth 2.0 client credentials)

Signicat is server-to-server. There is no end-user redirect. An API Client (Client ID + Client Secret) mints a short-lived (~600s) access token from the shared token endpoint with the single `signicat-api` scope.

1. In the [Signicat Dashboard](https://dashboard.signicat.com), create an **API Client** with the **Signature API** product enabled.
2. Note the **Client ID** and **Client Secret**.
3. Submit them on the hosted Connect page (rendered from `credentialFields`).

```
Token endpoint: https://api.signicat.com/auth/open/connect/token
Grant:          client_credentials
Scope:          signicat-api
```

The adapter re-runs the grant on `refreshCredentials` (no refresh token).

## Webhooks (events)

Signicat signs every delivery with HMAC-SHA256 of the **raw** request body, keyed by the subscription secret, in the `X-Signicat-Signature` header (uppercase hex). The verifier compares it constant-time over the raw body. Signing events handled: `order.created`, `order.started`, `order.completed`, `order.cancelled`, `order.expired`, `order.rejected`, `document.signed`, `document.rejected`, `package.completed`, `package.failed`.

## Refused fields

- Document content (`GET /sign/documents/{id}` returns the binary PAdES/XAdES file; the adapter never calls it — only `session.documents[]` metadata is surfaced)
- Signature images
- eID / KYC subject attributes collected during signing

These are not on the canonical schema. The adapter never requests them.
