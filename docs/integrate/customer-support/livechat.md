---
vertical: customer-support
platform: livechat
title: Integrating LiveChat
auth_type: oauth2
partner_program: true
estimated_time: 25min
last_verified: 2026-05-23
written_by: claude
---

# LiveChat

LiveChat (now branded as Text Platform) provides web chat and messaging for sales + support. The adapter wraps the Text Platform Agent + Configuration APIs and surfaces chats, customers, agents, tags, and canned responses into the canonical customer-support schema.

## Auth model

- **OAuth 2.1 Authorization Code grant** (with PKCE recommended). Authorize at `https://accounts.livechat.com/v2/authorize`. Exchange via POST to `https://accounts.livechat.com/v2/token`.
- Access tokens last `28800` seconds (8 hours). Refresh tokens rotate on use.
- Token response includes `account_id` and `organization_id` — store both alongside the credential.

## Prerequisites

1. A LiveChat (Text) account at [livechat.com](https://www.livechat.com).
2. A registered app in the **Developer Console** (`platform.text.com/console`). Add the redirect URI(s) — the platform enforces exact scheme + host + port + path matching, and disallows query strings and fragments.
3. To publish the app on the **LiveChat / HelpDesk Marketplace** it must pass review. Private apps used by your own license skip the marketplace and are usable as soon as you authorize them.

## Configure in admin

1. Open `/platforms` in the admin UI, filter to **Customer Support**, click **LiveChat**.
2. Fill **Configure**:
   - `clientId` — from the Developer Console.
   - `clientSecret` — from the Developer Console.
   - `redirectUri` — `${PUBLIC_BASE_URL}/auth/customer-support/livechat/callback`.
3. Enable the adapter.

## Required scopes

LiveChat scopes follow `{resource}--{filter}:{access}`. Common defaults:

- `chats--all:ro`, `chats--all:rw` — read/write all chats on the license.
- `customers:rw` — manage customers (plus `customers:own` if you need a customer-side token for the Customer Chat API).
- `agents--all:ro` — list agents.
- `tags--all:rw` — manage tags.
- `canned_responses--all:rw` — manage canned responses.
- `webhooks--all:rw` — manage webhooks programmatically.

Scopes must be declared at app registration; requesting an undeclared scope at runtime fails.

## Webhooks

Webhooks are configured via the Configuration API or the Developer Console. Verify deliveries with the shared secret on the subscription — the signature header is `X-LiveChat-Signature` (HMAC-SHA256, hex).

Subscribe to `incoming_chat`, `chat_deactivated`, `incoming_event`, `event_updated`, `customer_created`, and `agent_*` events at minimum.

## Quirks worth knowing

- **Marketplace review required for public distribution.** Allow 1-2 review cycles; LiveChat scrutinises scope justifications.
- **Redirect URI matching is strict.** No path-prefix or wildcard support; multiple URIs supported as a comma-separated list.
- **3 redirects per 30 seconds.** Per client per user account — chained re-auth attempts will rate-limit.
- **"Text Platform" branding.** The developer docs have largely migrated from `developers.livechat.com` to `platform.text.com`; both still resolve.

## References

- [OAuth authorization](https://platform.text.com/docs/authorization/oauth-authorization)
- [Scopes catalog](https://platform.text.com/docs/authorization/scopes)
- [Authorizing API calls](https://platform.text.com/docs/authorization/authorizing-api-calls/)
