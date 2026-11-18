---
vertical: customer-support
platform: groove
title: Integrating GrooveHQ
auth_type: oauth2
partner_program: false
estimated_time: 20min
last_verified: 2026-05-23
written_by: claude
---

# GrooveHQ

Groove is a small-business help-desk built around shared inboxes. The adapter targets Groove's REST API and exposes conversations, contacts, mailboxes, and agents into the canonical customer-support schema.

## Auth model

- **OAuth 2.0 Authorization Code grant.** Authorize at `https://api.groovehq.com/oauth/authorize`. Exchange via POST to `https://api.groovehq.com/oauth/token` (`application/x-www-form-urlencoded`).
- Access tokens expire after `7200` seconds. Refresh tokens are issued on the same exchange and rotate on refresh.

## Prerequisites

1. A Groove account at [groovehq.com](https://www.groovehq.com).
2. A registered OAuth application in your Groove account. Note the **Client ID**, **Client Secret**, and pre-register the exact redirect URI you will use — Groove rejects mismatched redirects at the token exchange.

## Configure in admin

1. Open `/platforms` in the admin UI, filter to **Customer Support**, click **GrooveHQ**.
2. Fill **Configure**:
   - `clientId` — from your Groove OAuth app.
   - `clientSecret` — from your Groove OAuth app.
   - `redirectUri` — `${PUBLIC_BASE_URL}/auth/customer-support/groove/callback`.
3. Enable the adapter.

## Required scopes

Groove does not publish a granular OAuth scope catalog — tokens issued through the standard authorization flow inherit the connecting user's permissions across the account. If a stricter model is required, fall back to a per-agent personal API token and supply it via the credential form.

## Webhooks

Configure webhooks under **Settings → Webhooks** in your Groove inbox. Groove signs each delivery with HMAC-SHA256 in the `X-Groove-Signature` header (base64). Subscribe to `conversation_*`, `message_*`, and `customer_*` events.

## Quirks worth knowing

- **REST API is legacy.** Groove now recommends its GraphQL API for new integrations; the REST endpoints (which the adapter currently targets) remain supported but the documentation is no longer actively maintained.
- **Redirect URI must match exactly.** Trailing slashes, query parameters, and scheme are all compared verbatim.
- **No sandbox tenant.** Test against a free Groove trial account — there is no separate dev environment.

## References

- [Groove OAuth docs](https://doc.groovehq.com/oauth)
- [Groove API documentation](https://doc.groovehq.com/)
