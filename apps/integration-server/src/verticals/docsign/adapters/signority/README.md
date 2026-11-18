# Signority adapter

Signority REST API → canonical docsign schema.

A Signority **document** maps to the canonical Envelope; its nested
`invitations` → Signers, `files` → Documents (metadata only), and `histories`
→ AuditTrailEntries. Reusable templates (`documentType` 6/7/8) map to Templates.

## Authentication

Signority does not use OAuth — it uses **HTTP Basic authentication** with your
API key as the username and an empty password
(`Authorization: Basic base64("<apiKey>:")`).

1. Sign in to Signority.
2. Open **My Account → Profile Settings → Integration**.
3. Find or generate your **API key**.
4. Enter it in the OpenSteward Connect Link form (single field).

The adapter exposes the `simpleApiKey` Connect Link form; the key is stored on
`credentials.accessToken`. API keys do not expire, so `refreshCredentials` is a
no-op.

## Sandbox vs production

Defaults target production `https://sign.signority.com/api`. A sandbox host
(`https://sandbox.signority.com/api`) and a test host
(`https://test.signority.com/api`) exist with the same path layout; switch the
base in `constants.ts` to target them.

## Endpoints used

- `GET /v2/documents/search2` — list documents (`pageIndex` + `pageSize`)
- `GET /v1/documents/{docID}` — retrieve a document with its nested
  `invitations`, `files`, and `histories`
- Templates are the same documents filtered by `documentType`.

## Callbacks

Signority pushes results to a per-document `documentSetting.postBackURL` rather
than delivering signed/HMAC-verified webhooks, so no webhook verification or
parsing is implemented (those methods auto-501). There is also no documented
void/cancel endpoint, so `voidEnvelope` is intentionally left unimplemented.

## Refused fields

- Document content (`/v1/documents/{docID}` returns metadata, `files` carry a
  page manifest only; no binary-content endpoint is called)
- Signature images
- Identity-verification (KYC) attachments

These are not on the canonical schema. The adapter never requests them.
