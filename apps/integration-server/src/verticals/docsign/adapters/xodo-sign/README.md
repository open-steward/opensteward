# Xodo Sign adapter

Xodo Sign (formerly eversign) REST API → canonical docsign schema.

## Onboarding

1. Create a Xodo Sign account at [xodosign.com](https://www.xodosign.com) / [eversign.com](https://eversign.com).
2. Open the top-left dropdown → **Developer** to find your **API access key**.
3. Note your **Business ID** (also on the Developer page). Leave it blank in the Connect form to use your primary business automatically.

Credentials are collected through the Connect Link form (`credentialFields` / `exchangeCredentials`) — there is no OAuth. The form asks for the API access key and an optional Business ID; the adapter resolves the primary business via `GET /business` when the ID is omitted.

## API

- Base URL: `https://api.eversign.com/api`
- Auth: `access_key` query parameter (the API key), plus a `business_id` query parameter scoping every request. There is no separate sandbox host — sandbox is a per-document `sandbox=1` flag.
- Pagination: `page` (1-indexed) + `limit` (max 500).
- Timestamps: Unix epoch seconds.

### Resources

| Canonical            | Xodo Sign source                                              |
| -------------------- | ------------------------------------------------------------- |
| Envelope             | `GET /document?type=...` (list), `GET /document?document_hash=...` (get) |
| void Envelope        | `DELETE /document?document_hash=...&cancel=1`                 |
| Signer               | `document.signers[]`                                          |
| Document (metadata)  | `document.files[]` (`name`, `file_id`, `pages` — no content)  |
| AuditTrailEntry      | `document.log[]` (`event`, `signer`, `timestamp`)             |
| Template             | `GET /document?type=templates` / `GET /document?document_hash=...` |

## Webhooks

Xodo Sign POSTs a JSON body with an `event_hash` = `HMAC-SHA256(event_time + event_type, apiKey)`. There is no signature header; the hash travels in the body. The verifier recomputes it and compares with `timingSafeEqual`. Event types: `document_created`, `document_sent`, `document_viewed`, `document_signed`, `document_declined`, `document_forwarded`, `document_completed`, `document_expired`, `document_cancelled`, `document_revoked`, `signer_removed`, `signer_bounced`, `email_validation_waived`.

## Refused fields

- Document content (the `files[]` manifest carries `name` / `file_id` / `pages` only; the `download_final_document` / `download_raw_document` binary endpoints are intentionally not called)
- Signature images
- Identity-verification attachments

These are not on the canonical schema. The adapter never requests them.
