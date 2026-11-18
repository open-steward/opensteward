# Signaturely adapter

Signaturely REST API (`https://api.signaturely.com/api/v1`) → canonical docsign schema.

## Onboarding

1. Sign in to your Signaturely account.
2. Open **Settings → API** (https://app.signaturely.com/settings/api).
3. Generate an **API key**. Keep it secret — it identifies your whole account.
4. Paste the key into the OpenSteward Connect Link form for this platform.

There is no OAuth flow: the API key is the only credential, and it is long-lived
(no refresh).

## Authentication

Every request carries the key in the `Authorization` header as:

```
Authorization: Api-Key <your-api-key>
```

This is **not** a Bearer token — the scheme word is literally `Api-Key`.

## Sandbox vs production

There is a single hosted environment. Test vs. live is selected per request
with the `testMode` body flag on the signing-request endpoints (test requests
never send real emails or consume credits); the adapter's read surfaces are
unaffected.

## Resource mapping

| Canonical            | Signaturely                                        |
| -------------------- | -------------------------------------------------- |
| `listEnvelopes`      | `GET /documents` (paginated `page` + `limit`)      |
| `voidEnvelope`       | `PATCH /documents/{id}/revert`                     |
| `listSigners`        | `GET /documents/{documentId}/signers`              |
| `getSigner`          | filter of `listSigners` (`<documentId>:<signerId>`)|
| `listAuditTrailEntries` | `GET /documents/{id}/activities`                |
| `getAuditTrailEntry` | filter of activities (`<documentId>:<index>`)      |
| `listTemplates`      | `GET /documents/api/templates`                     |
| `getTemplate`        | filter of `listTemplates`                          |
| `listDocuments`      | derived from `parts[]` on `GET /documents` list    |
| `getDocument`        | filter of `listDocuments` (`<envelopeId>:<partId>`)|

### Not implemented (router returns 501)

- `getEnvelope` — Signaturely has no single-document read endpoint; only the
  paginated list.

### Document surface notes

Signaturely nests uploaded files inside the envelope's `parts` array
(`{ id, order, originalFileName }`). There is no dedicated per-file endpoint,
so `listDocuments` resolves by fetching the envelope list and flattening
`parts` for the matching envelope. Fields not provided by the API (`sizeBytes`,
`pageCount`) are omitted. Document **content** is refused at the schema level
regardless.

## Webhooks

Signaturely supports `POST /hooks/subscribe` with `{ hookUrl, webhookEvents }`
for the events `document_sent` and `document_completed`. Deliveries carry **no
signing header**, so the adapter parses incoming events (`parseWebhookEvents`)
but does not implement `verifyWebhook`.

## Refused fields

- Document content (no content/preview field on the canonical schema; the
  adapter never calls the signed-PDF download endpoints).
- Signature images.

These are not on the canonical schema. The adapter never requests them.
