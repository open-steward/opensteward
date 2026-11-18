# Blueink adapter

Blueink eSignature REST API (v2) → canonical docsign schema.

## Resource mapping

| Canonical          | Blueink                                            |
| ------------------ | -------------------------------------------------- |
| Envelope           | Bundle (`/bundles/`)                               |
| Signer             | Packet (the bundle's `packets[]`)                  |
| Document           | The bundle's `documents[]` manifest (metadata only)|
| AuditTrailEntry    | Bundle event log (`/bundles/{id}/events/`)         |
| Template           | Template (`/templates/`)                           |

A Blueink **Bundle** is the envelope: it bundles the documents, the signer
packets, and the event log under a single slug.

## Onboarding

1. Sign in to the [Blueink Dashboard](https://app.blueink.com/).
2. Open **API → API Keys** and generate a **Private API key**.
3. In OpenSteward, connect the Blueink integration via Connect Link and paste
   the Private API key into the credential form.

The adapter sends the key as `Authorization: Token <key>` on every request.
There is no OAuth flow — `getAuthUrl` / `exchangeCode` are unsupported.

## Base URL

Single host: `https://api.blueink.com/api/v2`. Blueink has no separate sandbox
host; test traffic is flagged per-bundle via `is_test`.

## Pagination

List endpoints are page-based: `page` (1-indexed) + `per_page` (default 50,
max 100). The `X-Blueink-Pagination` response header carries the page summary
`<current page>,<total pages>,<per page>,<total results>`.

## Webhooks

The adapter verifies the `x-blueink-signature` header — an HMAC-SHA256 over the
base string `v0:{timestamp}:{rawBody}` (timestamp from
`x-blueink-request-timestamp`), keyed by the webhook secret. Supported event
types: `bundle_sent`, `bundle_complete`, `bundle_docs_ready`, `bundle_error`,
`bundle_cancelled`, `packet_viewed`, `packet_complete`, `packet_declined`.

## Refused fields

- Document content (the bundle `documents[]` `file_url` is intentionally NOT
  surfaced on the canonical schema or in metadata)
- Signature images
- Identity-verification (selfie / ID) attachments

These are not on the canonical schema. The adapter never surfaces them.
