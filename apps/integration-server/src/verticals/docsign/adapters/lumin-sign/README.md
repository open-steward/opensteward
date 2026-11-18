# Lumin Sign adapter

Lumin Sign REST API → canonical docsign schema.

## Onboarding

1. Log in to Lumin and open **Settings → Developer settings → API keys**.
2. Click **Generate key**, name it, and click **Create**.
3. Copy the key immediately — Lumin shows it only once.
4. Submit the key (and pick production / sandbox) on the OpenSteward Connect Link form for `lumin-sign`.

Lumin Sign is API-key auth — there is no OAuth authorization-code flow. The key is sent in the `X-API-Key` header on every request.

## Sandbox vs production

- Production: `https://api.luminpdf.com/v1`
- Sandbox: `https://api-sandbox.luminpdf.com/v1`

The Connect form's **Environment** select stores `environment` on `credentials.extra`; the client picks the sandbox base when it is `sandbox`.

## Supported resources

| Canonical resource | Lumin endpoint | Notes |
| --- | --- | --- |
| `getEnvelope` | `GET /signature_request/{id}` | Lumin has no list endpoint, so `listEnvelopes` is unimplemented (501). |
| `voidEnvelope` | `PUT /signature_request/cancel/{id}` | Re-fetches the request to return the canonical envelope. |
| `listSigners` / `getSigner` | embedded `signers[]` on the signature request | Signers have no id; addressed by `<signatureRequestId>:<email>`. |
| `listTemplates` | `GET /templates` | Page-based (`page` + `limit ∈ {10,25,50}`), `X-Lumin-API-Version: 1.1`. |
| `getTemplate` | `GET /templates/{id}` | |

## Webhooks

The adapter verifies the `X-Signature` header — an HMAC-SHA256 hex digest of the raw request body keyed by the **primary API key**. Event types: `signature_request_created`, `_viewed`, `_signed`, `_approved`, `_declined`, `_downloadable`, `_invalid`, `_canceled`, `_cancel_failed`, `_due_date_updated`.

## Refused / unsupported

- **Document content** — Lumin's only document endpoints stream raw PDF *content* (`/signature_request/files/...`), which the canonical `Document` schema firewall refuses. There is no content-free document-metadata surface, so `listDocuments` / `getDocument` are intentionally unimplemented (501).
- **Audit-trail entries** — no audit-trail endpoint; `listAuditTrailEntries` / `getAuditTrailEntry` are unimplemented (501).
- Signature images and identity-verification attachments are never requested.
