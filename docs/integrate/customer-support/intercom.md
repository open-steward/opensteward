---
vertical: customer-support
platform: intercom
title: Integrating Intercom
auth_type: oauth2
partner_program: true
estimated_time: 25min
last_verified: 2026-05-23
written_by: claude
---

# Intercom

Intercom is a messaging-first customer-support and engagement platform. The adapter wraps the Intercom REST API and exposes conversations, contacts, companies, admins, and tags into the canonical customer-support schema.

## Auth model

- **OAuth 2.0 Authorization Code grant.** Authorize at `https://app.intercom.com/oauth`. Exchange via POST to `https://api.intercom.io/auth/eagle/token`.
- Access tokens are long-lived bearer tokens; Intercom does not currently rotate them on a fixed schedule. Use the `/me` endpoint to validate and re-prompt the user if it 401s.

## Prerequisites

1. An Intercom workspace at [intercom.com](https://www.intercom.com).
2. A registered app in the **Developer Hub** (`developers.intercom.com`). On the **Authentication** page, tick **Use OAuth** and supply at least one HTTPS redirect URL.
3. To distribute the app to other Intercom customers, the app must be **submitted for review and listed on the Intercom App Store**. Internal apps used only by your own workspace can skip review.

## Configure in admin

1. Open `/platforms` in the admin UI, filter to **Customer Support**, click **Intercom**.
2. Fill **Configure**:
   - `clientId` — from your Intercom app's Basic Information page.
   - `clientSecret` — from your Intercom app's Basic Information page.
   - `redirectUri` — `${PUBLIC_BASE_URL}/auth/customer-support/intercom/callback`.
3. Enable the adapter.

## Required scopes

Intercom scopes are declared on the **Authentication** page and granted at install. Common selections for the canonical schema:

- `Read and list users and companies`, `Write users and companies`
- `Read conversations`, `Write conversations`
- `Read admins`
- `Read tags`, `Write tags`
- `Read tickets`, `Write tickets`
- `Read events`, `Write events`

Over-scoping is the most common reason apps are rejected in the marketplace review — request only what the integration needs.

## Webhooks

Configure webhooks under your app's **Webhooks** page. Intercom signs each delivery with HMAC-SHA1 using your app's **Client Secret** as the key; the signature arrives in the `X-Hub-Signature` header as `sha1=<hex>`.

Verify against the raw request body byte-for-byte — re-serialising JSON changes the digest. Subscribe to `conversation.*`, `contact.*`, `company.*`, and `ticket.*` topics.

## Quirks worth knowing

- **Marketplace review for production distribution.** Internal apps run without review; public distribution requires Intercom App Store approval. Plan for revisions if you ask for write scopes beyond your stated use case.
- **`X-Hub-Signature` is SHA-1.** Many platforms use SHA-256 — Intercom does not.
- **Regional hosts exist** (`api.eu.intercom.io`, `api.au.intercom.io`). Read `app.region` from the token response; the adapter routes requests accordingly.
- **JWT signing of body affects verification.** When porting verification code, use the exact raw body — Python's `json.dumps(...)` re-serialisation breaks signature comparison.

## References

- [Setting up OAuth](https://developers.intercom.com/docs/build-an-integration/learn-more/authentication/setting-up-oauth)
- [OAuth scopes](https://developers.intercom.com/docs/build-an-integration/learn-more/authentication/oauth-scopes)
- [Webhook topics](https://developers.intercom.com/docs/references/webhooks/webhook-models)
