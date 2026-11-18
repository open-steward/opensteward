# Zoho Sign adapter

Zoho Sign REST API → canonical docsign schema.

## Onboarding

1. Sign in to the Zoho Developer Console at [api-console.zoho.com](https://api-console.zoho.com).
2. Create a **Server-based Application** and register the OpenSteward redirect URI: `<base-url>/auth/docsign/zoho-sign/callback`.
3. Note `Client ID` and `Client Secret`.
4. Grant the scopes `ZohoSign.documents.ALL` and `ZohoSign.templates.ALL`.

Set in `.env` of the integration-server:

```
ZOHO_SIGN_CLIENT_ID=...
ZOHO_SIGN_CLIENT_SECRET=...
```

## Data-center hosts

Zoho operates regional clones — `.com` (US), `.eu` (EU), `.in` (India), `.com.au` (AU), `.jp` (Japan). The OAuth token response includes `api_domain`; the client picks that up automatically. Defaults target `sign.zoho.com`.

## Webhooks

Zoho Sign signs deliveries with an HMAC-SHA256 of the raw body using the per-organization webhook secret. The signature header is `X-ZohoSign-Webhook-Signature` (hex).

## Refused fields

- Document content (the `image_string` field on `document_ids[]` is never copied out)
- Signature images
- Identity-verification (KYC) attachments

These are not on the canonical schema. The adapter never requests them.

## Refused resources

- **Audit-trail entries.** `listAuditTrailEntries` and `getAuditTrailEntry` throw `501 NOT_SUPPORTED` before sending anything. Zoho Sign's first-party OpenAPI (https://api.swaggerhub.com/apis/zohosign/zohosign_api/1.0.0) has no audit-log path; the only audit artifact is the completion-certificate PDF (`GET /requests/{Request_Id}/completioncertificate`, "Retrieves the completion certificate pdf content.").
