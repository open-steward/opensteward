# eSignGlobal adapter

eSignGlobal (eSign.AI) REST API → canonical docsign schema.

## Onboarding

1. Sign in to eSignGlobal and open **Settings > Integration > Apps**.
2. Create an application. Note its **App ID** (sent as `client_id`).
3. Open **App Details** and copy the **Secret Key** (sent as `client_secret`).
4. Identify the **data centre** your eSignGlobal account is hosted in (Hong Kong, Singapore, or EU), or use the Sandbox ("SML") environment for testing.

Credentials are collected through the Connect Link flow — the hosted page renders one input per `credentialFields()` entry (App ID, Secret Key, data centre). There is no interactive OAuth redirect.

## Authentication

eSignGlobal is an API-key platform. The App ID + Secret Key are exchanged for a short-lived access token via the `client_credentials` grant at `POST /esignglobal/v1/oauth2/accessToken` (sent as `multipart/form-data`). The token is valid for ~24h and is presented as `Authorization: Bearer <token>` on every request. The grant returns no refresh token, so `refreshCredentials()` re-mints the token from the stored App ID + Secret Key.

## Sandbox vs production

The resolved data-centre host is stored on `credentials.extra.baseUrl`:

- Sandbox (SML): `https://openapi-sml.esignglobal.com`
- Production — Hong Kong: `https://openapi-as1.esignglobal.com`
- Production — Singapore: `https://openapi-as2.esignglobal.com`
- Production — EU (Frankfurt): `https://openapi-eu1.esignglobal.com`

All resource paths nest under `${baseUrl}/esignglobal/v1/...`. Responses are wrapped in `{ code, data, message }`; `code: "0"` is success and the client unwraps `data`.

## Implemented resources

| Canonical resource | eSignGlobal source |
| --- | --- |
| Envelope (get, void) | `GET /envelope/envelopeDetail`, `POST /envelope/cancel` |
| Signer (list, get) | derived from the envelope `signerInfos` + `CCInfos` |
| Document (list, get) | envelope `signFiles` / `attachments` — metadata only |
| Template (list, get) | `GET /templates/templateList`, `GET /templates/templateDetail` |

Resources eSignGlobal does not expose are left unimplemented and auto-resolve to 501 at the router:

- `listEnvelopes` — there is no envelope list/search endpoint; envelopes are addressed by id.
- audit-trail entries — eSignGlobal exposes no queryable audit-events endpoint.

## Webhooks

eSignGlobal Callback Events (e.g. `ENVELOPE_ALL_SIGNER_SIGNED`) carry no HMAC/signature, so there is nothing to verify. No webhook handler is wired (`verifyWebhook` / `parseWebhookEvents` are intentionally absent).

## Refused fields

- Signed-document content / base64 PDF / download bytes (the Download File endpoint is never called)
- Signature images and digital-certificate bundles
- Identity-verification (eKYC / OTP / ID-number) payloads

These are not on the canonical schema. The adapter never requests them.
