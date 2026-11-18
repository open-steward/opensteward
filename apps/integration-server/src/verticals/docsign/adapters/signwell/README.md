# SignWell adapter

SignWell (formerly Docsketch) REST API → canonical docsign schema.

## Onboarding

1. Sign in to SignWell and open **Settings → API**.
2. Generate an API key. SignWell scopes a key to one account.
3. The adapter sends the key as `X-Api-Key: <apiKey>` on every request.

The adapter is static-API-key based — no OAuth flow. Customers paste the key into the Connect Link form.

Set in `.env` of the integration-server only if you want to pre-bake a key for testing:

```
SIGNWELL_API_KEY=...
```

## Webhooks

SignWell signs deliveries with an HMAC-SHA256 of the raw body using the per-webhook secret. The signature header is `X-SignWell-Signature` (hex).

## Refused fields

- Document content (`/documents/{id}/files` is intentionally not called)
- Signature images
- Identity-verification (KYC) attachments

These are not on the canonical schema. The adapter never requests them.
