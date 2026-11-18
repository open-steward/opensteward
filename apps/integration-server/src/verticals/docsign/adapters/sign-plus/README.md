# Sign.Plus adapter

Sign.Plus (Alohi) eSignature REST API v2 → canonical docsign schema.

## Onboarding

1. Sign in to your Sign.Plus account at [app.sign.plus](https://app.sign.plus).
2. Open the **Integrations** page: `app.sign.plus/profile/integrations`.
3. Activate the API and generate an API key / Personal Access Token (PAT).
4. Supply the key on the OpenSteward Connect Link page — Sign.Plus uses static
   API-key auth (Bearer token), so there is no OAuth redirect to register.

The API key is sent on every request as `Authorization: Bearer <key>` and is
stored on `credentials.accessToken` via the shared `simpleApiKey` Connect Link
form.

## Base URL & sandbox

All calls go to `https://restapi.sign.plus/v2`. There is no separate sandbox
host; sandbox testing is opt-in per request via a `sandbox: true` flag on
envelope creation (a write operation this read-only adapter does not perform).

## Pagination

List endpoints are `POST /envelopes` and `POST /templates`. Filters and
pagination travel in the JSON request body: `first` (page size) + `after`
(opaque cursor). Responses wrap rows as
`{ has_next_page, has_previous_page, envelopes|templates }`.

## Supported resources

- **Envelopes** — `POST /envelopes` (list), `GET /envelope/{id}` (get),
  `PUT /envelope/{id}/void` (void).
- **Signers** — recipients nested in the envelope's `signing_steps[].recipients[]`.
  Sign.Plus has no recipient-by-id endpoint, so `getSigner` filters the
  envelope's recipients (`getSigner` id = `<envelopeId>:<recipientId>`).
- **Documents** — `GET /envelope/{id}/documents` (list),
  `GET /envelope/{id}/document/{documentId}` (get). Metadata only.
- **Templates** — `POST /templates` (list), `GET /template/{id}` (get).

## Not implemented (router returns 501)

- **Audit-trail entries** — Sign.Plus exposes no list/get audit endpoint. Audit
  activity is delivered only through the `ENVELOPE_AUDIT_TRAIL` webhook, so
  there is no readable audit surface.
- **Webhooks** — Sign.Plus documents webhook events
  (`ENVELOPE_COMPLETED` / `ENVELOPE_EXPIRED` / `ENVELOPE_DECLINED` /
  `ENVELOPE_VOIDED` / `ENVELOPE_AUDIT_TRAIL`) but **no** signature-verification
  mechanism (no signing secret or signature header), so `verifyWebhook` and
  `parseWebhookEvents` are intentionally omitted rather than implemented
  insecurely.

## Refused fields

- Signed-document content (`GET /envelope/{id}/signed_documents`, the single
  signed-document download, and per-document binary content)
- Certificate-of-completion PDFs (`GET /envelope/{id}/certificate`)
- Attachment files (`GET /envelope/{id}/attachments/{file_id}`)

These are not on the canonical schema. The adapter never requests them — only
document metadata (filename, page count) is surfaced.
