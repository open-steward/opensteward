# FPT.eContract adapter

FPT.eContract REST API → canonical docsign schema.

FPT.eContract (FPT IS) is a Vietnamese electronic-contract platform. A
*contract* (hợp đồng) maps to the canonical `Envelope`; its inline recipients
map to `Signer`, its file manifest to `Document` (metadata only), its history
to `AuditTrailEntry`, and contract templates to `Template`.

## Onboarding

1. Obtain a partner / API-integration account from FPT IS for FPT.eContract.
2. Issue a partner **API key** from the integration settings.
3. In the OpenSteward Connect Link form, paste the API key and pick the
   environment (Production or Sandbox/UAT).

The adapter authenticates every request with the `api-key` request header.
There is no OAuth flow.

## Environments

- Production: `https://api-econtract.fpt.com.vn`
- Sandbox / UAT: `https://api-econtract-uat.fpt.com.vn`

Resource paths nest under `/api/v1`. List endpoints are `page` + `pageSize`
paginated (max 100).

## Webhooks (callbacks)

FPT.eContract pushes contract status-change callbacks to a partner-registered
URL. The adapter verifies the HMAC-SHA256 of the raw body (hex or base64) sent
in the `x-econtract-signature` header against the partner callback secret.

## Refused fields

- Document content (the manifest returns metadata; the binary download
  endpoint is intentionally not called)
- Signature images
- eKYC / identity-verification attachments

These are not on the canonical schema. The adapter never requests them.
