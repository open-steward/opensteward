# Dropbox Sign adapter

Dropbox Sign (formerly HelloSign) REST API → canonical docsign schema.

## Onboarding

1. Create an app at [app.hellosign.com/oauth/createApp](https://app.hellosign.com/oauth/createApp).
2. Set the OAuth callback to `<base-url>/auth/docsign/dropbox-sign/callback`.
3. Note the **Client ID** and **Secret** (under the app details).

Set in `.env` of the integration-server:

```
DROPBOX_SIGN_CLIENT_ID=...
DROPBOX_SIGN_CLIENT_SECRET=...
```

## Quirks

- `signature_request_id` is the canonical envelope id.
- Documents are refused (501 `NOT_SUPPORTED`). `GET /signature_request/files/{id}` "Returns a PDF or ZIP file." (`file_type` is `pdf` or `zip` only; there is no JSON manifest), and no documented operation names a request's documents. Bytes content is never fetched.
- Audit-trail entries are synthesised from per-signer timestamps (`signed_at`, `last_viewed_at`, `last_reminded_at`) because Dropbox Sign has no separate audit-events endpoint.

## Webhooks

Event callbacks sign with HMAC-SHA256 of `<event_time><event_type>` using the app's API key. The signature ships *in the body* as `event.event_hash` (not a header). Verifier reads the body and recomputes.

## Refused fields

- Document content (bytes are never downloaded)
- Signature images
