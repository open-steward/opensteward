# Annature adapter

Annature (Australian e-signature) REST API → canonical docsign schema.

- Base URL `https://api.annature.com.au`, with the version in each path
  ([introduction](https://docs.annature.com.au/api-reference/introduction.md)).
- Auth: a static key pair sent as `X-Annature-Id` (public key) and
  `X-Annature-Key` (private key)
  ([authentication](https://docs.annature.com.au/api-reference/authentication.md)).
  Connections store `{ accessToken: privateKey, extra: { publicKey } }`.

| Method        | Endpoint                                                                                    | Paging                                   |
| ------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------- |
| listEnvelopes | `GET /v2/envelopes`, then `GET /v2/envelopes?status=draft` (drafts are excluded by default) | cursor / `has_more`, cut by `pageByRows` |
| getEnvelope   | `GET /v1/envelopes/:id`                                                                     | none                                     |
| listSigners   | `recipients` of `GET /v1/envelopes/:id`                                                     | local                                    |
| listDocuments | `GET /v1/documents?envelope_id=`                                                            | local                                    |
| listTemplates | `GET /v1/templates` (at most 250 per response), keyset on `created_before`                  | local over the full set                  |
| getTemplate   | `GET /v1/templates/:id`                                                                     | none                                     |

Refused with 501 `NOT_SUPPORTED`: audit-trail entries (no endpoint documented),
getSigner (the recipient object has no envelope id) and getDocument
(`GET /v1/documents/:id` requires `envelope_id`).

Not yet verified against the docs: `voidEnvelope`, which still posts to an
undocumented path (the documented one is `POST /v1/envelopes/:id/void`), and
`webhook.ts` (event names and signature header).
