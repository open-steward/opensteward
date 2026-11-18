# Yoti Sign adapter

Yoti Sign (eSignatures) REST API (`/v2`) → canonical docsign schema.

## Onboarding

1. Request a Yoti Sign API key from Yoti client support (there is no self-serve developer console for keys).
2. Decide which environment the key targets:
   - Production — `https://api.yotisign.com`
   - Sandbox — `https://demo.api.yotisign.com`
3. In OpenSteward, connect Yoti Sign via the Connect Link form and paste the API key + select the environment.

Auth is a static API key sent as `Authorization: Bearer <API_KEY>`. There is no OAuth flow, so `getAuthUrl()` / `exchangeCode()` are unused; credentials are collected through `credentialFields()`.

## Supported resources

| Canonical surface | Yoti Sign endpoint |
| --- | --- |
| `getEnvelope` | `GET /v2/envelopes/<envelopeId>` |
| `voidEnvelope` (archive / cancel) | `PATCH /v2/envelopes/<envelopeId>` |
| `listSigners` / `getSigner` | derived from `details.recipients[]` of `GET /v2/envelopes/<envelopeId>` |

## Not implemented (returns 501)

- **`listEnvelopes`** — Yoti has no general list endpoint; the only lookup (`POST /v2/organisations/envelopes/find`) requires an explicit `envelope_ids` list.
- **`listDocuments` / `getDocument`** — the only document endpoint (`GET /v2/envelopes/<id>/completed-documents`) streams a ZIP of signed document *content*, which the canonical Document schema forbids. The adapter never calls it.
- **Audit-trail entries** and **templates** — no documented API surface.
- **Webhooks** — Yoti notifications are configured per-envelope at creation time as plain outbound POSTs with no documented signature-verification scheme, so no verify/parse handlers are provided.

## Refused fields

- Signed-document content / coversheets / XML signature bundles (the `completed-documents` ZIP is never requested).
- Signature images and identity-verification (IDV) attachments.

These are not on the canonical schema; the adapter never requests them.
