# DocuSeal adapter

[DocuSeal](https://www.docuseal.com) e-signature REST API → canonical docsign schema.

## Authentication

DocuSeal uses a **static API key** — no OAuth. Generate a key in the DocuSeal
console under **Settings → API** and supply it through the Connect Link
single-API-key form (`X-Auth-Token`). The key is stored on
`credentials.accessToken`.

| Region        | Base URL                    |
| ------------- | --------------------------- |
| US (default)  | `https://api.docuseal.com`  |
| EU            | `https://api.docuseal.eu`   |
| Self-hosted   | set `extra.baseUrl`         |

Self-hosted instances override the base URL via `credentials.extra.baseUrl`.

## Resource mapping

| Canonical          | DocuSeal                                              |
| ------------------ | ---------------------------------------------------- |
| Envelope           | `submissions`                                        |
| Signer             | `submitters` (real `GET /submitters/{id}` endpoint)  |
| Document           | submission `documents[]` (filename only)             |
| AuditTrailEntry    | submission `submission_events[]`                     |
| Template           | `templates`                                          |

Pagination is cursor-based: `limit` (max 100) plus `after` / `before` id
cursors. List responses wrap rows in `{ data, pagination }`.

DocuSeal **archives** (deletes) submissions rather than voiding them, so
`voidEnvelope` is not implemented — the router returns 501.

## Webhooks

DocuSeal signs deliveries with an HMAC-SHA256 signature in the
`X-Docuseal-Signature` header, computed over the raw body using the
`whsec_...` secret from **Security → HMAC**. The verifier accepts both the
versioned `<timestamp>.<signature>` form and a bare hex digest, and verifies
against the exact bytes received on the wire.

Event types handled: `form.viewed`, `form.started`, `form.completed`,
`form.declined`, `submission.created`, `submission.completed`,
`submission.expired`, `submission.archived`, `template.created`,
`template.updated`.

## Refused fields

- Document content — `documents[].url` download links are never surfaced.
- Signed-PDF / combined-document binaries.

These are not on the canonical schema. The adapter never returns them.
