# DocHub adapter

> **Partly rebuilt onto the documented API.** DocHub documents "DocHub Public
> API V2" at https://dev.dochub.com/api-reference/openapi.yaml and its OAuth
> server at https://dochub.com/.well-known/oauth-authorization-server.
> OAuth (authorization code + PKCE S256, client Basic auth at
> `/api/v2/oauth/token`), signer and document reads, and `voidEnvelope`
> (`POST /api/v2/sign-requests/{id}/void`) run on that API.
> `listEnvelopes`, `getEnvelope`, `listTemplates` and `getTemplate` still
> call an unverified placeholder host. Webhooks are not implemented.

DocHub is a browser-based PDF editor and e-signature tool that integrates
with Google Workspace (Google Drive, Gmail, Google Classroom).

## Onboarding

1. Create a confidential OAuth application (`POST /api/v2/oauth/applications`
   with `confidential: true`) and note the `Client ID` and `Client Secret`.
2. Register the OpenSteward redirect URI: `<base-url>/auth/docsign/dochub/callback`.
3. Default scopes: `sign_requests:read sign_requests:write`.

Set in `.env` of the integration-server:

```
DOCHUB_CLIENT_ID=...
DOCHUB_CLIENT_SECRET=...
```

## Resource mapping (placeholder — unverified)

| Canonical | DocHub (assumed)                    |
|-----------|-------------------------------------|
| Envelope  | sign request                        |
| Signer    | recipient on a sign request         |
| Document  | document attached to a sign request |
| Template  | template                            |

Audit-trail entries are not implemented. Webhooks are not implemented
(no verifiable signature scheme).

## Refused fields

- Document content (the binary download endpoint is intentionally never called)
- Signature images
- Identity-verification attachments
