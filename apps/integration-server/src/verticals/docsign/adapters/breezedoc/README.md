# BreezeDoc adapter

BreezeDoc REST API → canonical docsign schema.

## Onboarding

1. Sign in to BreezeDoc.
2. Open **Integrations → API** at [breezedoc.com/integrations/api](https://breezedoc.com/integrations/api).
3. Create a **Personal Access Token**.
4. Paste the token into the OpenSteward Connect Link form (single `Personal Access Token` field).

The token authenticates every request as `Authorization: Bearer {TOKEN}`. There is no
separate sandbox host — all calls go to `https://breezedoc.com/api`.

## Resource mapping

| Canonical           | BreezeDoc source                                                    |
| ------------------- | ------------------------------------------------------------------- |
| Envelope            | `GET /documents`, `GET /documents/{id}`                             |
| Signer              | `GET /documents/{id}/recipients`                                    |
| Document (metadata) | `document_files[]` nested on a document                             |
| AuditTrailEntry     | synthesised from recipient `sent_at` / `opened_at` / `completed_at` |
| Template            | `GET /templates`, `GET /templates/{id}`                             |

## Not supported

- **Void/cancel** — BreezeDoc exposes no void endpoint, so `voidEnvelope` is omitted (the router returns 501).
- **Webhooks** — BreezeDoc documents no webhook channel; `verifyWebhook` / `parseWebhookEvents` are not implemented.
- **Invoices** — out of the docsign vertical's scope (a payments resource), intentionally not wired.

## Rate limiting

60 requests/minute; the client backs off on `429` and `5xx`.

## Refused fields

- Document content (only `document_files` metadata + page counts are surfaced; the binary is never requested)
- Signature images
- Identity-verification (KYC) attachments

These are not on the canonical schema. The adapter never requests them.
