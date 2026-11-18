# SignNow adapter

SignNow REST API → canonical docsign schema.

## Onboarding

1. Create an OAuth client at [app.signnow.com/webapp/api-dashboard](https://app.signnow.com/webapp/api-dashboard).
2. Set the OAuth redirect URI to `<base-url>/auth/docsign/signnow/callback`.

Set in `.env`:

```
SIGNNOW_CLIENT_ID=...
SIGNNOW_CLIENT_SECRET=...
```

## Model quirks

SignNow treats every entity as a **document** — including templates (flagged with `is_template: true`). The adapter splits them: regular records → `Envelope`, template-flagged records → `Template`.

## Webhooks

SignNow signs webhooks with HMAC-SHA256 in the `X-Signnow-Signature` header (hex).

## Refused fields

- Document content (the adapter never downloads bytes)
- Signature images
