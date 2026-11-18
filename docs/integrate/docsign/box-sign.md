---
vertical: docsign
platform: box-sign
title: Integrating Box Sign
auth_type: oauth2
partner_program: false
estimated_time: 20min
last_verified: 2026-05-20
written_by: claude
---

# Box Sign

Box-native e-signature embedded in Box Business+ workflows. The same Box OAuth credentials that read files can also drive the Sign API.

## Auth model

OAuth 2.0 Authorization Code grant via Box. Authorize at `https://developer.box.com/guides/authentication/oauth2/`; exchange at `https://api.box.com/oauth2/token`.

## Prerequisites

1. Create a Box Custom App at the [Box Developer Console](https://account.box.com/login?redirect_url=%2Fdevelopers%2Fconsole).
2. Enable **App Access Only** or **User Authentication (OAuth 2.0)** depending on integration mode.
3. Grant scope **Write all files and folders stored in Box** + **Manage signature requests**.
4. Add `<base-url>/auth/docsign/box-sign/callback` to the redirect URIs.

Set the client credentials as the adapter's config — on the platform's page in
the admin UI (`/platforms/docsign/box-sign`), or:

```bash
curl -X POST "$INTEGRATION_SERVER_URL/admin/platforms/docsign/box-sign/enable" \
  -H "X-Admin-Secret: $ADMIN_SECRET" -H "Content-Type: application/json" \
  -d '{"config":{"clientId":"...","clientSecret":"...","redirectUri":"<base-url>/auth/docsign/box-sign/callback"}}'
```

These are adapter settings, not environment variables: nothing reads a
`BOX_SIGN_CLIENT_ID` from `.env`. See
[OAuth adapter credentials](../../environment/environment-variables.md#oauth-adapter-credentials).

## Webhooks

Box signs webhook deliveries with HMAC-SHA1 of `<timestamp><body>` using the webhook key. The signature ships in `X-Box-Signature-Primary` (base64). Key rotation supported via `X-Box-Signature-Secondary`.

## Refused fields

- Document content — this adapter does not expose Box file bodies
- Signature images

## Scope

This adapter covers only the **sign-request** subset of the Box API; it does not read or manage Box files.
