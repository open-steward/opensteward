# InfoCert adapter

InfoCert GoSign5 REST API → canonical docsign schema. Italian eIDAS QTSP.

Source: GoSign5 OpenAPI ("GoSign5 API (Preview)", 5.0.PREVIEW),
https://devportal.infocert.digital/gosign/documentation/GoSign5 (raw
`specs/GoSign5.yaml` from https://devportal.infocert.digital:8443/gosign/files).
Server `https://api.infocert.digital/gosign/v5`. Bearer token from GoSign's
OAuth2 token endpoint (`https://gosign-be.infocert.it/gosign/oauth/token`).

| Resource | Source | Paging |
|---|---|---|
| Envelope (get) | `GET /dossiers/{dossierExternalId}` | — |
| Envelope (list) | refused 501: no GoSign5 list path (`/dossiers` is POST only) | — |
| Signer (list) | `Dossier.process.tasks[].actors[]` (`ActorUser` only) | local |
| Document (list) | `Dossier.documents[]` | local |
| Audit trail, templates, get-by-id for signer/document | refused 501: no GoSign5 path | — |

Not reachable from this connection: GoSign4 OAuth API v2 `GET /envelopes`
(its two servers, `https://gosigncl-infocert.enel.com/gosign/secure/oauth/api/v2`
and `https://gosign-infocert.enel.com/gosign/secure/oauth/api/v2`, are both one
customer's installations; required `folder`/`subfolder`; separate envelope ids).

Signer email: `ActorUser` documents none. `Task.authorization.email` ("User
email") belongs to the task, not a named actor, so it is not mapped;
`Task.authorization.pin` is removed from `raw`.

Signing order: from `Task.order` ("Number that determines the parallelism of
the task"). One task or none reads as parallel; several tasks with any
`order` missing throw rather than guess. `signerIds` follow `Task.order`.

Rebuild backlog: `voidEnvelope` posts to `/dossiers/{id}/cancel`, which GoSign5
does not document (it has `DELETE /dossiers/{dossierExternalId}`). The webhook
header and event names are not in the GoSign5 spec either.

Refused: document content, signature images, qualified certificate payloads.
