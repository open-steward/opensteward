# Namirial adapter

Namirial eSignAnyWhere REST API v6 → canonical docsign schema.

Reference: https://demo.esignanywhere.net/swagger/jsons/swagger.v6.json
(`basePath: /api`) and the API Documentation page,
https://namirial.atlassian.net/wiki/pages/viewpage.action?pageId=91882730.

## EU residency

Namirial is an Italian eIDAS-qualified trust service provider (QTSP).
Use for Italian- and EU-resident customers requiring QES with EU data
residency.

## Onboarding

1. Create an API token in eSignAnyWhere under Settings → API Tokens and Apps.
2. Note the environment your account lives on (e.g. `saas.esignanywhere.net`,
   `demo.esignanywhere.net`, or an on-premise host).

The Connect Link form collects the token and the host. The token is stored
as `credentials.accessToken` and sent as `Authorization: Bearer <token>`;
the host is stored as `credentials.extra.host` and must be https and resolve
to a public address. Requests go to `https://<host>/api/v6/…`.

`getAuthUrl()` throws — the adapter uses API-token auth.

## Reads

| Resource | Route | Paging |
|---|---|---|
| Envelopes | `POST /v6/envelope/find`, then `GET /v6/envelope/{id}` + `/files` per row | local |
| Signers | `Activities` of `GET /v6/envelope/{id}` | local |
| Documents | `Documents` of `GET /v6/envelope/{id}/files` | local |
| Audit trail | completed `Events` of `GET /v6/envelope/{id}/history` | local |
| Templates | `POST /v6/template/find`, then `GET /v6/template/{id}` + `/files` per row | local |

None of these routes takes a paging parameter, so each list is fetched
whole and cut to the caller's page. Signer, document and audit-trail ids
are `<envelopeId>:<childId>`.

Documents come from `EnvelopeGetFilesResponse.Documents`, which the
swagger describes as "The finished documents of the envelope." It is the
only documented per-envelope document list, so an envelope that is still
active may report fewer documents (or none) than it will once finished.
This applies to `listDocuments`, `getDocument` and `Envelope.documentIds`.

Signing order is `sequential` when the Sign activities span more than one
`SigningGroup`, or the SignAsP7M activities span more than one
`SignAsP7MGroup`; otherwise `parallel`. The docs do not say whether the two
group numberings share one sequence, so they are not compared with each other.

## Not yet verified against the docs

- `voidEnvelope` still posts to `/envelopes/{id}/cancel`; the documented
  route is `POST /v6/envelope/cancel` with `{ EnvelopeId }`.
- Webhooks: the API Documentation describes callback URLs with
  `##EnvelopeId##` / `##Action##` placeholders and no signature; the
  `X-Namirial-Signature` HMAC check in `webhook.ts` is not documented there.

## Refused fields

- Document content
- Per-recipient handwritten / biometric signature images
- Stroke / pressure data captured during pad-based signing
