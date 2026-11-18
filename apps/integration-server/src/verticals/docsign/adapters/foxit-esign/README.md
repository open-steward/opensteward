# Foxit eSign adapter

Foxit eSign (formerly eSignGenie) REST API → canonical docsign schema.

## Onboarding

1. Sign in to your Foxit eSign / eSignGenie account.
2. Open **Settings → API** and generate an API key.
3. The Connect Link hosted form collects this key in a single `apiKey` field;
   the adapter wraps it as `accessToken` and uses it as a Bearer token.
4. There is no OAuth flow. `getAuthUrl`, `exchangeCode`, and OAuth-style
   `refreshCredentials` throw / no-op accordingly.

## Endpoints

Signers, documents and the audit trail are read from the documented
"Get Envelope Details" endpoint, `GET /folders/myfolder?folderId=` on
`https://na1.foxitesign.foxit.com/api` (Foxit eSign OpenAPI at
https://developers.foxitesign.foxit.com/), sent with
`Authorization: Bearer <token>`. The response carries
`folder.folderRecipientParties`, `folder.documentsList` and
`Folder History` whole, so each list is paged locally.

Only the US server is used; the EU (`eu1`), AU (`au1`) and CA (`na2`)
servers are not selectable yet. Envelopes, templates and void still call
older, undocumented `api.esigngenie.com/rest/v1` paths.

## Webhooks

The adapter verifies the `X-Esign-Signature` header (HMAC-SHA256 of the
raw body, hex-encoded). Both bare-hex and `sha256=<hex>` formats are
accepted. Configure the webhook destination in Foxit eSign → Webhooks.

## Refused fields

- Document content / preview URLs
- Signature images
- Identity-verification (KYC) attachments

These are not on the canonical schema. The adapter never requests them.
