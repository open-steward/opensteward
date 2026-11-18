# StepOver adapter

StepOver webSignatureOffice "Tyr" web service (XML-RPC) → canonical docsign schema.

## Onboarding

StepOver does **not** use OAuth. StepOver provisions Tyr web-service access for
your webSignatureOffice account and issues:

1. An API **login** and **password** (exchanged for a session id via
   `tyrservice.login`).
2. A **request signing key** — a shared secret. Each request body is
   SHA-1-hashed with this secret and sent as the `X-SOSIGNATURE` header.

Connect Link collects these three fields (plus an optional service base URL).
No `.env` keys are required; credentials are entered per connection.

## Sandbox vs production

- Production: `https://www.websignatureoffice.com/tyrservice`
- Test instance: `https://tyrservicetest.webso.stepover.de/tyrservice`

Set the test/self-hosted host in the optional **Service base URL** credential
field. Defaults to production when blank (see `constants.ts`).

## Supported resources

The Tyr web service is intentionally narrow, so this adapter implements only
what it exposes:

- **Envelope (get)** — `tyrservice.getDocumentSignatureRequestStatus(sessionId, documentId)`.
  Status codes: `1` new → `sent`, `2` partial signed → `delivered`,
  `3` finished → `completed`, `4` failed → `voided`.
- **Envelope (void)** — `tyrservice.deleteDocument(sessionId, documentId, username)`.

`listEnvelopes`, signers, documents, audit-trail entries, and templates are
**not** implemented — the Tyr API has no read endpoints for them, so the router
returns `501 Not Implemented`.

## Webhooks (Callback API)

webSignatureOffice POSTs JSON callbacks (`STATUS_CHANGE`, `USER_FINISH`,
`FIELD_SIGNED_OR_REJECTED`, `RENDER_RETURN`) configured server-side via
`webso_events_url` / `webso_events_filter`. StepOver documents **no** body
signature or HMAC (auth is via integrator-configured custom headers), so the
adapter parses callbacks but does not expose `verifyWebhook`.

## Refused fields

- Document content (`retrieveXml` returns the signed PDF; the adapter never
  calls it — `getDocument` is intentionally not implemented).
- Signature images and biometric data.

These are not on the canonical schema. The adapter never requests them.
