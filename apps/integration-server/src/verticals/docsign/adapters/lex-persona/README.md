# Lex Persona adapter

Lex Persona is now Goodflag (www.lex-persona.com redirects to goodflag.com). This
adapter reads the Goodflag Signature **Workflow Manager** API
(https://docs.goodflag.com/wm/api-reference/introduction.md).

- Host: the customer's own tenant, collected as `baseUrl` and stored on
  `credentials.extra.baseUrl`; endpoints live under `/api`.
- Auth: `Authorization: Bearer act_<id>.<secret>`.
- Paging: `itemsPerPage` (max 50) + 0-based `pageIndex`; `totalItems` ends the walk.

| Canonical | Endpoint |
|---|---|
| Envelope | `GET /api/workflows`, `GET /api/workflows/{workflowId}` |
| Signer | `steps[].recipients[]` of `GET /api/workflows/{workflowId}`, paged locally |
| Document | `GET /api/documents?items.workflowId=`, `GET /api/documents/{documentId}` |
| Template | `GET /api/templates`, `GET /api/templates/{templateId}`; count from `GET /api/templateDocuments?items.templateId=` |
| AuditTrailEntry | refused (501): evidence is a PDF certificate / ZIP of XML files |

Not yet rebuilt: `voidEnvelope` (still posts an undocumented `/transactions/{id}/cancel`;
the documented stop is `PATCH /api/workflows/{id}` with `workflowStatus: stopped`) and
the webhook verifier/parser.
