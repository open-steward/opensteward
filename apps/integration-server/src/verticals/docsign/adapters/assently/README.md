# Assently adapter

Assently E-Sign REST API (v3) → canonical docsign schema.

## Onboarding

1. Sign in to Assently and open **Settings → API**.
2. Create an **Agent** and generate an **API Key + API Secret**. The secret is shown only once — store it securely.
3. In OpenSteward's Connect Link form, enter the **API Key** and **API Secret**.

The adapter exchanges the key/secret for a short-lived bearer token via the OAuth 2.0 client-credentials grant (`POST /apiv3/token`, `grant_type=client_credentials`, `Authorization: Basic base64(key:secret)`), and re-mints the token on refresh from the stored key/secret.

## Sandbox vs production

Defaults target production (`https://assently.com/apiv3`). For the test environment, point `API_BASE_URL` / `TOKEN_URL` in `constants.ts` at `https://test.assently.com/apiv3`.

## Resources

| Canonical | Assently endpoint |
| --- | --- |
| Envelopes (list) | `POST /api/cases/find` → `{ cases }` |
| Envelope (get) | `GET /api/cases/{id}` |
| Envelope (void) | `PUT /api/cases/{id}/recall` |
| Signers | case `parties[]` from `GET /api/cases/{id}` |
| Documents | case `documents[]` (metadata only) |
| Audit trail | synthesised from case + party signing timestamps |
| Templates | `POST /api/templates/find`, `GET /api/templates/{id}` |

## Webhooks

Assently delivers case lifecycle callbacks but documents no signature-verification mechanism (HMAC / signing secret), so this adapter ships no webhook verification or parsing.

## Refused fields

- Document content (`DocumentModel.data`, base64) is never read or surfaced.
- Signature images and eID certificate data (`SignatureData`) are not on the canonical schema and never requested.
