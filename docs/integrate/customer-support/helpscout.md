---
vertical: customer-support
platform: helpscout
title: Integrating Help Scout
auth_type: oauth2
partner_program: false
estimated_time: 20min
last_verified: 2026-05-23
written_by: claude
---

# Help Scout

Help Scout is a shared-inbox / help-desk platform aimed at small teams. The adapter wraps the Mailbox API v2 and surfaces conversations, customers, mailboxes, and users into the canonical customer-support schema.

## Auth model

- **OAuth 2.0 Authorization Code grant.** Authorize at `https://secure.helpscout.net/authentication/authorizeClientApplication`. Exchange via POST to `https://api.helpscout.net/v2/oauth2/token`.
- Access tokens last `172800` seconds (2 days). Refresh tokens rotate on every refresh — store the new one each time. A 401 from the API is the canonical "token expired" signal.
- A **Client Credentials** flow is also available for internal-use integrations against a single Help Scout account.

## Prerequisites

1. A Help Scout account with admin rights at [secure.helpscout.net](https://secure.helpscout.net).
2. A registered application under **Your Profile → My Apps**. Note the **App ID** (client id) and **App Secret**, and register the exact redirect URI.

## Configure in admin

1. Open `/platforms` in the admin UI, filter to **Customer Support**, click **Help Scout**.
2. Fill **Configure**:
   - `clientId` — your Help Scout App ID.
   - `clientSecret` — your Help Scout App Secret.
   - `redirectUri` — `${PUBLIC_BASE_URL}/auth/customer-support/helpscout/callback`.
3. Enable the adapter.

## Required scopes

Help Scout does not enforce OAuth scopes — the issued token inherits the role + permissions of the authorizing user. Have the connecting user be an account owner if you need full Mailbox API access; otherwise the adapter will silently 403 on writes they cannot make in the UI.

## Webhooks

Configure under **Manage → Webhooks**. Help Scout signs each delivery with HMAC-SHA1 (base64) in the `X-HelpScout-Signature` header — the adapter verifies the secret you supply against the raw body.

Subscribe to `convo.*`, `convo.note.*`, `convo.reply.*`, and `customer.*` events at minimum.

## Quirks worth knowing

- **Refresh tokens rotate.** Always persist the new `refresh_token` returned from a refresh call — the previous one is invalidated immediately.
- **Rate limit is account-wide.** 400 requests per minute per Mailbox API client, shared across all installed integrations under the same app.
- **No "list everything" endpoint for threads.** Pull conversations first, then drill in — the adapter does this in two passes.
- **Webhook signature is SHA-1, not SHA-256.** A common bug when porting verification code from other Help Scout-style platforms.

## References

- [Mailbox API authentication](https://developer.helpscout.com/mailbox-api/overview/authentication/)
- [Webhooks](https://developer.helpscout.com/webhooks/)
- [Signature validation](https://developer.helpscout.com/apps/guides/signature-validation/)
