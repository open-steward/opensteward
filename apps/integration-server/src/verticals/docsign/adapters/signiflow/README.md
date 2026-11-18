# SigniFlow adapter

SigniFlow PowerFlow JSON/REST API → canonical docsign schema.

SigniFlow models a signing job as a **document** carrying a **workflow** of
**worksteps**. This adapter maps:

- document → canonical `Envelope`
- worksteps → `Signer` (the workstep `Action` — SignDocument / ViewDocument /
  ApproveDocument — sets the role)
- the document payload → a single metadata-only `Document`
- real per-event audit records from `/GetDocumentAudit` → `AuditTrailEntry`
- Prepper templates from `/GetPrepperTemplateList` → `Template`

## Onboarding

1. Sign in to SigniFlow (public cloud at `web1.signiflow.com`, or your private
   install).
2. In the OpenSteward Connect Link form, enter your SigniFlow **username
   (email)** and **password**, and (if you run a private install or a
   non-default cloud node) your SigniFlow host.
3. The adapter calls POST `/Login` with `UserNameField`/`PasswordField` to
   obtain a session token (`TokenField`), which is embedded in the JSON body
   of every subsequent request. There is no Authorization header.

## Sandbox vs production

- Production (public cloud): `https://web1.signiflow.com`
- Pre-production / sandbox: `https://preprod.signiflow.com`

The host is part of the submitted credentials (`credentials.extra.host`) and
defaults to the public-cloud host. REST operations are served under
`/API/SignFlowAPIServiceRest.svc/` and are POST-JSON throughout.

## Supported resources

- Envelopes: get (`GetDoc`), void (`CancelFlow`)
- Signers: list (derived from document worksteps if present)
- Documents: metadata only (one per envelope)
- Audit-trail entries: from real `GetDocumentAudit` activity records
- Templates: list (`GetPrepperTemplateList`)

Note: SigniFlow has no list-documents endpoint, so `listEnvelopes` is not
implemented (the router returns 501 for that operation).

## Refused fields

- Document content (`DocField`, base64) — only filename / extension are mapped
- Signature images
- Identity-verification (KYC) attachments

These are not on the canonical schema. The adapter never requests them.
