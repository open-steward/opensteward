---
vertical: customer-support
platform: kustomer
title: Integrating Kustomer
auth_type: oauth2
partner_program: false
estimated_time: 20min
last_verified: 2026-05-23
written_by: claude
---

# Kustomer

Kustomer (Meta) is a customer-context-first support platform — conversations are organised around a customer timeline rather than tickets. The adapter wraps the Kustomer REST API and surfaces conversations, customers, messages, and users into the canonical customer-support schema.

## Auth model

- **OAuth 2.0 Authorization Code grant.** Authorize at `https://api.apps.kustomerapp.com/oauth/authorize`. Exchange via POST to `https://api.apps.kustomerapp.com/oauth/token`.
- Access tokens last `86400` seconds (1 day). Refresh tokens expire after **two weeks of inactivity** — re-prompt the user if your worker has been idle.
- The adapter also accepts a static API key (created under **Settings → Security → API Keys**) for single-tenant deploys.

## Prerequisites

1. A Kustomer org at [kustomer.com](https://www.kustomer.com).
2. A registered **private OAuth app** under the apps platform. **Install the app before initiating the OAuth flow** — Kustomer returns `400 Invalid Client` if you try to authorize an uninstalled app.
3. Note the **Client ID** and generated **Client Secret**.

## Configure in admin

1. Open `/platforms` in the admin UI, filter to **Customer Support**, click **Kustomer**.
2. Fill **Configure**:
   - `clientId` — from your Kustomer OAuth app.
   - `clientSecret` — from your Kustomer OAuth app.
   - `redirectUri` — `${PUBLIC_BASE_URL}/auth/customer-support/kustomer/callback`.
3. Enable the adapter.

## Required scopes

Request at minimum:

- `org.permission.customer` — read / write customers.
- `org.permission.conversation` — read / write conversations and messages.
- `offline_access` — required to receive a refresh token.

Additional `org.permission.*` scopes exist for teams, settings, search, and workflow if you need them.

## Webhooks

Kustomer signs webhook deliveries with HMAC-SHA256 — supply a shared secret when you create the webhook subscription under **Settings → Webhooks**. The signature header is `x-kustomer-signature` (hex). Subscribe to `customer.*`, `conversation.*`, and `message.*` events.

## Quirks worth knowing

- **Install before authorize.** This is the single most common setup error — apps have to be installed to the org *before* the OAuth dance, not after.
- **Refresh tokens decay on idle.** Two weeks of no activity = full re-auth.
- **Permission model is role-based.** Scopes are coarse; effective permissions come from the API role attached to the app.
- **Timeline-centric data model.** Kustomer does not have "tickets" in the Zendesk sense — conversations live on the customer timeline. Map carefully.

## References

- [Kustomer OAuth 2.0 provider](https://developer.kustomer.com/kustomer-apps-platform/docs/oauth-provider)
- [Authentication and API keys](https://developer.kustomer.com/kustomer-api-docs/reference/authentication)
