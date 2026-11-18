# GetAccept adapter

GetAccept REST API → canonical docsign schema.

GetAccept is a sales-focused proposal + e-signature platform.

## Onboarding

1. Sign in to GetAccept and open **Settings → Integrations → API keys**.
2. Create an **App** to obtain `client_id` and `client_secret` for OAuth Authorization-Code flow.
3. Register the OpenSteward redirect URI: `<base-url>/auth/docsign/getaccept/callback`.

Set in `.env` of the integration-server:

```
GETACCEPT_CLIENT_ID=...
GETACCEPT_CLIENT_SECRET=...
```

## OAuth oddity

The authorize endpoint is at `app.getaccept.com/oauth/authorize` (consumer host) but the token endpoint is at `api.getaccept.com/v1/auth` — the adapter handles the split.

## Webhooks

GetAccept signs deliveries with an HMAC-SHA256 of the raw body using the per-webhook secret. The signature header is `X-GetAccept-Signature` (hex).

## Refused fields

- Document content (`/documents/{id}/download` is intentionally not called)
- Signature images
- Identity-verification (KYC) attachments

These are not on the canonical schema. The adapter never requests them.
