---
vertical: customer-support
platform: trengo
title: Integrating Trengo
auth_type: oauth2
partner_program: false
estimated_time: 20min
last_verified: 2026-05-23
written_by: claude
---

# Trengo

Trengo is a multichannel inbox covering WhatsApp, email, SMS, chat, and voice. The adapter targets the Trengo REST API and surfaces tickets, contacts, channels, and teammates into the canonical customer-support schema.

## Auth model

- **OAuth 2.0 Authorization Code grant** for multi-tenant apps, or a **Personal Access Token** for single-account installs.
- Bearer token sent as `Authorization: Bearer <token>` on every request.
- The OAuth `authorize` and `token` URLs are surfaced through the Trengo developer portal once an app is registered; they are not published as a global pair. Copy them into the adapter's `authUrl` / `tokenUrl` settings during configuration.

## Prerequisites

1. A Trengo workspace at [trengo.com](https://trengo.com).
2. For OAuth: a registered app via the Trengo developer portal ([developers.trengo.com](https://developers.trengo.com)) with a redirect URI configured.
3. For single-tenant deploys: a personal access token from **Settings → Apps & Integrations → REST API**.

## Configure in admin

1. Open `/platforms` in the admin UI, filter to **Customer Support**, click **Trengo**.
2. Fill **Configure**:
   - For OAuth: `clientId`, `clientSecret`, and `redirectUri` (`${PUBLIC_BASE_URL}/auth/customer-support/trengo/callback`).
   - For token mode: paste the personal access token as `apiKey`.
3. Enable the adapter.

## Required scopes

Trengo's scope catalog is exposed in the developer portal at app-registration time. Request the minimum needed for the canonical surface: ticket read/write, contact read/write, channel read, team read.

## Webhooks

Configure under **Settings → Webhooks**. Trengo lets you set a shared secret per webhook; deliveries are signed with HMAC-SHA256 in the `X-Trengo-Signature` header. The adapter verifies signatures against the raw body.

Subscribe to `ticket.*` and `message.*` events for full conversation coverage.

## Quirks worth knowing

- **120 requests / minute account-wide.** The adapter back-pressures; bulk imports should be chunked.
- **Channels are first-class.** Conversations are scoped to a specific channel (WhatsApp number, mailbox, etc.) — when creating outbound, the channel id is required.
- **WhatsApp message-template gating.** Outbound WhatsApp outside the 24-hour session window requires a pre-approved template id; the adapter does not auto-approve templates.

## References

- [Trengo developer docs](https://developers.trengo.com/docs/welcome)
- [Trengo API reference](https://developers.trengo.com/docs/reference)
- [Webhook verification](https://developers.trengo.com/docs/configuration)
