# Autenti adapter

Autenti Document Process API v2 (`https://api.autenti.com/api/v2`) → canonical docsign schema. Polish e-signature provider.

Reference: developers.autenti.com, served from Stoplight project `cHJqOjQxMTI4`
(`https://stoplight.io/api/v1/projects/cHJqOjQxMTI4/table-of-contents`; the OpenAPI is node `111e9353643f4`).

OAuth2 authorization code grant: `GET /api/v2/auth/authorization`, `POST /api/v2/auth/token` (JSON body). Default scope `read`.

| Method                                           | Endpoint                                                                                             | Paging                                                                           |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| listEnvelopes                                    | `GET /document-processes?status=DRAFT` then `?status=DOCUMENT_PROCESS`, `offset` + `limit` (max 128) | `pageByRows`; a short page ends a status chain (EVERYTHING caps `offset` at 256) |
| getEnvelope                                      | `GET /document-processes/{id}`                                                                       | —                                                                                |
| listSigners                                      | `GET /document-processes/{id}/parties` (SENDER left out)                                             | streamed whole (`Accept: application/stream+json`), then `pageLocally`           |
| listDocuments                                    | `GET /document-processes/{id}/files`                                                                 | streamed whole (`Accept: application/stream+json`), then `pageLocally`           |
| listAuditTrailEntries                            | `GET /document-processes/{id}/actions`                                                               | streamed whole (`Accept: application/stream+json`), then `pageLocally`           |
| listTemplates / getTemplate / getAuditTrailEntry | none documented                                                                                      | 501 `NOT_SUPPORTED`, no request                                                  |

Sub-collections are streamed because the paginated JSON array stops at the default 64 (maximum 128) rows, while "the streaming response is unbounded" ("Streaming vs JSON array queries", node `aeea144bc9795`, which covers "lists of participants, files, events").

Open questions for a live probe:

- `offset`: the Pagination article says default 0, rows skipped; the OpenAPI parameter says "the number of the item to start from", default 1. The adapter follows the article. If the spec is right, each page after the first repeats one row.
- `DOCUMENT_PROCESS` is defined as `PROCESSING`, `COMPLETED` and `WITHDRAWN`; `REJECTED` and `ERROR` processes are not named, so they may be missing from the DRAFT + DOCUMENT_PROCESS walk.

Not rebuilt: `voidEnvelope` (`POST /documents/{id}/cancel` is not in the documented API; withdrawal is a document action) and the webhook verifier (`X-Autenti-Signature` is not in the documented callbacks).

Refused: document content, signature images, qualified certificate payloads.
