---
vertical: customer-support
platform: hiver
title: Integrating Hiver
auth_type: oauth2
partner_program: false
estimated_time: 25min
last_verified: 2026-05-23
written_by: claude
---

# Hiver

Hiver bolts shared-inbox and ticketing functionality onto Gmail and Microsoft 365. The adapter targets the Hiver REST API and exposes conversations, contacts, and agents into the canonical customer-support schema.

## Auth model

- **OAuth 2.0 Authorization Code grant.** Hiver issues OAuth credentials through the in-app developer console at **Admin → Developer settings → Create app**.
- The adapter also accepts a static API key when a tenant prefers a single-account integration over user-delegated OAuth.

Exact `authorize` and `token` URLs are scoped to your tenant — Hiver provisions them when you create the app and surfaces them in the developer console rather than publishing them as a global pair. Copy them into the adapter's `authUrl` / `tokenUrl` settings as part of configuration.

## Prerequisites

1. A Hiver account with admin access at [hiverhq.com](https://hiverhq.com). The underlying mailbox (Gmail or Microsoft 365) must already be authorized to Hiver — the adapter does **not** re-mint Gmail / Graph tokens on Hiver's behalf.
2. An app registered in **Admin → Developer settings**. Note the generated **Client ID** and **Client Secret**, and add the redirect URI.

## Configure in admin

1. Open `/platforms` in the admin UI, filter to **Customer Support**, click **Hiver**.
2. Fill **Configure**:
   - `clientId` — from Hiver Developer settings.
   - `clientSecret` — from Hiver Developer settings.
   - `redirectUri` — `${PUBLIC_BASE_URL}/auth/customer-support/hiver/callback`.
   - `authUrl` / `tokenUrl` — copy from the developer console.
3. Enable the adapter.

## Required scopes

Scope catalog is exposed through the developer console rather than as a public list — request only the scopes covering conversations, contacts, and agents for the canonical surface. Hiver's defaults grant read access; writes (assign, status change, reply) require explicit write scopes.

## Webhooks

Hiver delivers webhook events for conversation lifecycle changes. Configure them under **Admin → Webhooks**; HMAC-SHA256 signing is supported when you set a shared secret. Subscribe to conversation create / update / assignment / status events.

## Quirks worth knowing

- **Rate limit is 1 RPS per account.** The strictest in the vertical — the adapter throttles and serialises writes per tenant. Bulk operations must be paced by the caller.
- **Mailbox provider tokens stay with Hiver.** The adapter never touches Gmail or Graph directly; threads return Hiver-side IDs.
- **Tenant-pinned endpoints.** Even token URLs are tenant-scoped — do not hardcode them across tenants.

## References

- [Hiver developer docs](https://developer.hiverhq.com/hiver-api)
- [Hiver API help](https://help.hiverhq.com/hiver-api/hiver-api)
