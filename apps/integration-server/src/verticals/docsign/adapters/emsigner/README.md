# emSigner adapter

emSigner (eMudhra, India) REST API → canonical docsign schema.

Sources: the vendor's Swagger for the production API,
<https://api.emsigner.com/swagger/docs/v1> (host `api.emsigner.com`), its
ASP.NET help pages (<https://api.emsigner.com/Help>, which carry a JSON sample
of every reply), and the Postman collection
<https://documenter.getpostman.com/view/40123569/2sAYBbe8yV>.

## Auth

AppName + SecretKey (created under Settings → API Settings → Manage Apps) and
the user's email. The client trades AppName + SecretKey for an AuthToken with
`POST /api/AuthorizeApp`, then sends `Authorization: Basic <AuthToken>` and
`UserName: <email>` on every request.

No doc says how long an AuthToken lives or how the API answers an expired
one. Probed on 2026-09-24, the live API answers a request with no Basic scheme
with HTTP 401 but an unrecognised Basic token with HTTP 500 and an empty body.
So the client drops its cached token on a data call's first 401 **or** 5xx,
authorises again and sends the call once more; only that second send backs
off and retries 5xx.

## Resources

| Method                      | Endpoint                                                                       | Paging                                                             |
| --------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| listEnvelopes               | `POST /api/GetAllDocuments`, each row completed by `POST /api/GetWorkflowInfo` | `pagenumber` + `PageSize` = caller's page and limit (`pageByRows`) |
| getEnvelope                 | `POST /api/GetWorkflowInfo` + its `GetAllDocuments` row by `Referenceno`       | —                                                                  |
| listSigners                 | `POST /api/GetWorkflowInfo` → `Signatories`                                    | whole, `pageLocally`                                               |
| listDocuments               | `POST /api/GetWorkflowInfo` → `DocumentInfo`                                   | whole, `pageLocally`                                               |
| listAuditTrailEntries       | `GET /api/GetDocumentLog?workflowId=`                                          | whole, `pageLocally`                                               |
| listTemplates / getTemplate | refused, 501 `NOT_SUPPORTED`                                                   | —                                                                  |

`ListTemplates` exists, but its reply (TemplateId, TemplateName, ParentId,
TemplateType, SubscriberId) has no document count, which the canonical
Template requires, and there is no template-by-id endpoint.

## Judgment calls and known failure modes

- **Status `Pending` → `sent`.** The only documented status values are
  Postman's example for GetAllDocuments' request filter, "Status of the
  workflow (e.g., Pending, Completed)". The reply's `FilesView.Status` has no
  documented values, and `WorkflowInfo.WorkflowStatus` is documented with
  other examples ("In Progress", "Completed"). Reading `Pending` as out for
  signature is an inference; the raw value is kept in
  `metadata.emsignerStatus`. Every other value is `unknown`.
- **`WorkflowType` other than `Serial` / `Parallel` throws.** Postman lists
  those two only as examples ("e.g."), and other bodies name more workflow
  kinds ("2 for Serial Flexiform, 5 for In-person"). The canonical
  `signingOrder` is required and has no `unknown`, so an undocumented type
  is an error rather than a guess. Because listEnvelopes transforms a page's
  rows together, one such workflow fails every page that contains it, and
  getEnvelope for it.

## Not rebuilt

`voidEnvelope` still posts to `/envelopes/{id}/cancel`, which emSigner does not
document (its recall endpoint is `POST /api/RecallWorkflow`). The webhook
verifier and parser in `webhook.ts` are not from emSigner docs either
(emSigner documents `POST /api/SaveWebhookSettings`).

## Refused fields

- Document content
- Aadhaar XML KYC responses
- eSign certificate payloads
- Signature images
