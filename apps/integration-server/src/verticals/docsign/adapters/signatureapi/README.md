# SignatureAPI adapter

SignatureAPI REST API (v1) → canonical docsign schema.

## Resource mapping

| Canonical       | SignatureAPI                                                  |
| --------------- | ------------------------------------------------------------- |
| Envelope        | Envelope (`/envelopes`)                                       |
| Signer          | Recipient (the envelope's embedded `recipients[]`)            |
| Document        | The envelope's embedded `documents[]` (metadata only)         |
| AuditTrailEntry | Event (`/events`) filtered by envelope                        |

SignatureAPI has no reusable-template REST resource, so `listTemplates` /
`getTemplate` are not implemented — the router returns 501 for them.

Recipients and documents are **not** separately addressable resources; they
live inside the envelope payload. `getSigner` / `getDocument` therefore accept
a composite `<envelopeId>:<id>` id and resolve against the parent envelope.

## Onboarding

1. Sign in to the [SignatureAPI Dashboard](https://dashboard.signatureapi.com/).
2. Open **Settings → API Keys** and create a key (`key_test_…` for sandbox,
   `key_live_…` for production).
3. In OpenSteward, connect the SignatureAPI integration via Connect Link and
   paste the key into the credential form.

The adapter sends the key on the `X-API-Key` request header. There is no OAuth
flow — `getAuthUrl` / `exchangeCode` are unsupported.

## Base URL

Single host: `https://api.signatureapi.com/v1`. There is no separate sandbox
host — test vs. live mode is selected by the API-key prefix.

## Pagination

List endpoints are cursor-based: `cursor` + `limit`. The response carries
`{ data: [...], links: { next, previous } }` where `links.next` is an opaque
absolute URL for the next page (null on the last page). The client follows
`links.next` to gather pages.

## Webhooks

The adapter verifies deliveries per the
[Standard Webhooks](https://www.standardwebhooks.com) spec: the
`webhook-signature` header (`v1,<base64sig>` versions) is an HMAC-SHA256 over
`${webhook-id}.${webhook-timestamp}.${rawBody}`, keyed by the endpoint secret
(`whsec_…`, base64-decoded). Supported event types: `envelope.created`,
`envelope.started`, `envelope.completed`, `envelope.canceled`,
`recipient.released`, `recipient.sent`, `recipient.accessed`,
`recipient.viewed`, `recipient.completed`, `recipient.rejected`,
`recipient.soft-bounced`, `recipient.hard-bounced`, `recipient.failed`,
`deliverable.generated`.

## Refused fields

- Document content (SignatureAPI deliverable download URLs are intentionally
  NOT surfaced on the canonical schema or in metadata)
- Signature images
- Identity-verification attachments

These are not on the canonical schema. The adapter never surfaces them.
