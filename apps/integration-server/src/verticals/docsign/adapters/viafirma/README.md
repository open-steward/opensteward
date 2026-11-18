# Viafirma adapter

Viafirma Documents REST API → canonical docsign schema.

Viafirma Documents models a signature request as a **SET** — a set of
messages sent to one or more recipients with one or more documents. The
adapter maps:

| Canonical          | Viafirma                                              |
| ------------------ | ----------------------------------------------------- |
| Envelope           | SET (`GET /set/summary/{code}`)                       |
| Signer             | SET recipient (`links[]` on the SET summary)          |
| Document           | SET message (`messages[]` on the SET summary)         |
| Template           | User template (`GET /template/list/{userCode}`)       |

## Onboarding

1. Obtain a Viafirma Documents account (sandbox is managed by Viafirma).
2. In the Documents control panel under **Applications**, note your
   `groupCode` and `appCode` (default `com.viafirma.documents`).
3. Register an OAuth2 application in Viafirma Fortress with the OpenSteward
   redirect URI: `<base-url>/auth/docsign/viafirma/callback`.
4. Note the `client_id` and `client_secret`.

Set in `.env` of the integration-server:

```
VIAFIRMA_CLIENT_ID=...
VIAFIRMA_CLIENT_SECRET=...
```

## Authentication

Authentication is delegated to Viafirma Fortress's OAuth2 server
(Authorization-Code grant). The authorize endpoint is
`{fortress}/oauth2/v1/auth`; the token endpoint is
`{fortress}/fortress/oauth2/v1/token`. The resulting access token is sent as
`Authorization: Bearer <token>` on every Documents request.

## Sandbox vs production

Defaults target the public sandbox (`sandbox.viafirma.com`, Fortress at
`sandbox.viafirma.com/fortress`). For production, point the host at
`documents.viafirma.com` (stored on `credentials.extra.baseUrl`) and the
Fortress base at `fortress.viafirma.com/fortress`.

## Unsupported / not implemented

The router returns 501 for resources Viafirma does not expose:

- **listEnvelopes** — Documents has no SET list/search endpoint; SETs are
  addressed by `code`.
- **getTemplate** — only a per-user template list is offered, no get-by-id.
- **audit-trail entries** — the audit trail is delivered as a short-lived PDF
  download link (`GET /documents/download/trail/{messageCode}`), not as
  queryable events, so it cannot back the canonical AuditTrailEntry resource.
- **webhooks** — the auto-response callback POSTs the message JSON but carries
  no signature/HMAC, so there is nothing to verify and no handler is wired.

## Refused fields

- Signed-document content (the binary download endpoint is intentionally not
  called)
- Signature images and identity-verification evidence files

These are not on the canonical schema. The adapter never requests them.
