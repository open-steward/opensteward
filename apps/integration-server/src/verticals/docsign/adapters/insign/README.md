# inSign adapter

inSign (is2 GmbH) REST API → canonical docsign schema.

## Model

inSign organises signing around a **session** ("Vorgang") that bundles
documents, signature fields, and the external recipients invited to sign:

| inSign source                                  | Canonical resource |
| ---------------------------------------------- | ------------------ |
| `/get/status` + `/get/checkstatus`             | `Envelope`         |
| `/extern/users` + `/get/externInfos` + fields  | `Signer`           |
| `/get/documents/full`                          | `Document`         |

Sessions are addressed by `sessionid` (passed in the JSON body), so canonical
ids are `sessionId` for envelopes, `sessionId:<email>` for signers, and
`sessionId:<docid>` for documents.

## EU residency

inSign is EU-hosted and eIDAS-compliant; documents are processed and stored on
EU infrastructure.

## Onboarding

1. Test against the open sandbox at `https://sandbox.test.getinsign.show`
   (fixed credentials, no signup).
2. After a successful sandbox test, inSign issues a production instance with
   its own base URL and Basic-auth credentials.

The Connect Link form collects an **API username**, an **API key / password**,
and an optional **instance base URL**. The adapter base64-encodes
`username:apiKey` into `credentials.accessToken` and sends it as
`Authorization: Basic <token>`; the base URL is stored on
`credentials.extra.baseUrl` (sandbox by default).

`getAuthUrl()` throws — inSign has no interactive OAuth flow.

## Not implemented (auto-501)

- `listEnvelopes` — inSign has no account-wide session list.
- Templates — inSign has no template concept.
- Audit-trail entries — exposed only as a downloadable PDF, not a JSON list.
- Webhooks — status callbacks go to a customer-configured URL with no
  documented signature scheme, so no verification is wired.

## Refused fields

- Document content (only metadata is read)
- Per-recipient handwritten / biometric signature bitmaps (`signatureBitmap`)
- Stroke / pressure / device biometric data captured during pad signing
