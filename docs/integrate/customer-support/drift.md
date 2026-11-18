---
vertical: customer-support
platform: drift
title: Integrating Drift
auth_type: oauth2
partner_program: false
estimated_time: 20min
last_verified: 2026-05-23
written_by: claude
---

# Drift

Drift is a B2B conversational marketing + live-chat platform (now part of Salesloft). The adapter wraps the Drift REST API and surfaces conversations, contacts, and users into the canonical customer-support schema.

## Auth model

- **OAuth 2.0 Authorization Code grant.** Authorize at `https://dev.drift.com/authorize`. Exchange via POST to `https://driftapi.com/oauth2/token`.
- Access tokens expire after `7200` seconds (2 hours). The response includes a `refresh_token` (long-lived) and an `orgId` identifying the installed organization — store it alongside the credential.

## Prerequisites

1. A Drift account with admin access at [app.drift.com](https://app.drift.com).
2. A registered app in Drift's developer console at [dev.drift.com](https://dev.drift.com). Note your **Client ID** and **Client Secret** and add a redirect URI.

## Configure in admin

1. Open `/platforms` in the admin UI, filter to **Customer Support**, click **Drift**.
2. Fill **Configure**:
   - `clientId` — from the Drift developer console.
   - `clientSecret` — from the Drift developer console.
   - `redirectUri` — `${PUBLIC_BASE_URL}/auth/customer-support/drift/callback`.
3. Enable the adapter.

## Required scopes

Drift declares scopes statically in the developer console. Once a token is issued you cannot widen them without re-installing the app. Request:

- `contact_read`, `contact_write` — contacts.
- `conversation_read`, `conversation_write` — conversations + messages.
- `user_read` — agents / teammates.

`gdpr_read` / `gdpr_write` are only needed if you intend to drive subject-access workflows through the adapter.

## Webhooks

Drift webhooks are configured per-app in the developer console. Each delivery is signed with HMAC-SHA256 using your app's client secret; verify against the `X-Drift-Signature` header (base64). Subscribe to:

- `new_message`, `new_conversation`
- `conversation_status_changed`
- `contact_created`, `contact_updated`

## Quirks worth knowing

- **One token per org.** The `orgId` in the token response is canonical — Drift does not let one token operate against multiple organizations.
- **Scopes are immutable.** Adding a new scope to an existing app requires every install to re-authorize; Drift will not silently top up the granted scope set.
- **Drift is being consolidated into Salesloft.** The `driftapi.com` host and developer console remain available as of mid-2026, but expect URL changes during the migration — pin a feature flag if you need to switch hosts later.

## References

- [Drift authentication and scopes](https://devdocs.drift.com/docs/authentication-and-scopes)
- [Making a public integration](https://devdocs.drift.com/docs/publishing-an-app)
- [Drift dev portal](https://dev.drift.com)
