# Adobe Acrobat Sign adapter

Adobe Acrobat Sign REST API (v6) → canonical docsign schema.

## Onboarding

1. Visit the [Adobe Sign API Applications](https://secure.na1.adobesign.com/account/accountSettingsPage) page and create an OAuth application.
2. Configure scopes: `agreement_read:account`, `agreement_write:account`, `agreement_send:account`, `library_read:account`.
3. Register the OAuth redirect URI: `<base-url>/auth/docsign/adobe-acrobat-sign/callback`.

Set in `.env`:

```
ADOBE_ACROBAT_SIGN_CLIENT_ID=...
ADOBE_ACROBAT_SIGN_CLIENT_SECRET=...
```

## Shards

Adobe Sign assigns each account to a regional shard (na1, na2, eu1, eu2, jp1). The `api_access_point` returned from the token exchange tells the adapter where to route REST calls. It's persisted on `credentials.extra.apiAccessPoint`.

## Webhooks

Adobe Sign webhooks ship the HMAC as `X-AdobeSign-ClientSecret` (base64). Registration also requires the URL to respond to a verification GET — the unified webhook handler does that.

## Refused fields

- Document content (only metadata via `/documents`)
- Signature images / participant security selfies
