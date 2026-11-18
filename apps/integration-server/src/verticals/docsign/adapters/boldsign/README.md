# BoldSign adapter

BoldSign REST API → canonical docsign schema.

## Auth

BoldSign authenticates backend requests with a static **API key** sent in the
`X-API-KEY` header. There is no OAuth flow for server-to-server use, so the
Connect Link form collects the key (and the data region). `getAuthUrl` /
`exchangeCode` throw; `credentialFields()` / `exchangeCredentials()` drive the
key entry.

## Onboarding

1. Sign in to BoldSign and open **Settings → API**.
2. Generate an API key.
3. In OpenSteward Connect, paste the key and select the **data region**
   (United States → `api.boldsign.com`, Europe → `api-eu.boldsign.com`).

The region selection is stored on `credentials.extra.baseUrl` and resolves the
host for every request.

## Resource mapping

| Canonical            | BoldSign source                                            |
| -------------------- | ---------------------------------------------------------- |
| Envelope             | Document (`/v1/document/list`, `/v1/document/properties`)  |
| Signer               | `signerDetails[]` on the document properties               |
| Document (metadata)  | `files[]` on the document properties                       |
| AuditTrailEntry      | `documentHistory[]` on the document properties             |
| Template             | `/v1/template/list`, `/v1/template/properties`             |

A BoldSign document IS the envelope — there is no separate envelopes resource.
`voidEnvelope` calls `POST /v1/document/revoke?documentId=...`.

## Pagination

List endpoints use `page` (1-indexed) + `pageSize` (default 100, max 100).

## Timestamps

BoldSign returns Unix epoch *seconds* (`createdDate`, `activityDate`,
`expiryDate`, `signedDate`). The transform layer normalises them to strict
ISO-8601 via `toIsoDatetime`.

## Webhooks

BoldSign signs deliveries with HMAC-SHA256 over `${t}.${rawBody}` using the
webhook signing secret. The `x-boldsign-signature` header is a comma-separated
`t=<epoch>, s0=<hex>, s1=<hex>` list (`s1` covers secret rotation); the
verifier accepts a match against any `sN`. Event type lives at
`event.eventType`; the document id at `data.documentId`.

## Refused fields

- Document content (only `files[]` metadata — filename + page count — is read)
- Signature images
- Identity-verification (KYC) attachments

These are not on the canonical schema. The adapter never requests them.
