# Documenso adapter

[Documenso](https://documenso.com) (the open-source document-signing platform) v1 public API → canonical docsign schema.

## Onboarding

1. Sign in to your Documenso account (hosted at [app.documenso.com](https://app.documenso.com) or your self-hosted instance).
2. Open **Settings → API Tokens**.
3. Create a token and copy the value (it looks like `api_xxxxxxxxxxxx`).
4. Paste it into the OpenSteward Connect form (single **API token** field).

There is no OAuth flow — Documenso issues long-lived API tokens. The token is sent verbatim in the `Authorization` header (no `Bearer` prefix).

## Hosted vs self-hosted

Defaults target `https://app.documenso.com/api/v1`. Self-hosted instances use the same `/api/v1` paths on the customer domain; set `credentials.extra.baseUrl` to the instance base (e.g. `https://sign.acme.example/api/v1`).

## Resources

| Canonical resource    | Documenso source                                  |
| --------------------- | ------------------------------------------------- |
| Envelope              | `GET /documents`, `GET /documents/:id`            |
| Signer                | recipients embedded in the document object        |
| Audit-trail entry     | synthesised from document + recipient timestamps  |
| Template              | `GET /templates`, `GET /templates/:id`            |

Not implemented (auto-501): `voidEnvelope` (v1 exposes no document-cancel endpoint) and the file-metadata `Document` surface (a Documenso document *is* the envelope; there is no separate per-file manifest with sizes/page counts).

## Webhooks

Documenso does not HMAC-sign deliveries. When a webhook is created with a secret, that secret is echoed verbatim in the `X-Documenso-Secret` header; the adapter verifies it with a constant-time comparison against the stored secret. The body is `{ event, payload, createdAt }`, where `event` is one of `DOCUMENT_CREATED`, `DOCUMENT_SENT`, `DOCUMENT_OPENED`, `DOCUMENT_SIGNED`, `DOCUMENT_COMPLETED`, `DOCUMENT_REJECTED`, `DOCUMENT_CANCELLED`.

## Refused fields

- Document content / file binaries (never requested — not on the canonical schema)
- Signature images
- Identity-verification attachments

These are not on the canonical schema. The adapter never requests them.
