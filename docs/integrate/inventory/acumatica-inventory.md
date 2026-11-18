---
vertical: inventory
platform: acumatica-inventory
title: Integrating Acumatica Inventory
auth_type: oauth2
partner_program: false
estimated_time: 25min
last_verified: 2026-05-23
written_by: claude
---

# Acumatica Inventory

Acumatica is a cloud / hybrid ERP whose Distribution Edition includes the inventory module the adapter targets. The adapter wraps Acumatica's REST contract-based API and exposes stock items, warehouses, locations, inventory transactions, and suppliers into the canonical inventory schema.

## Auth model

- **OAuth 2.0 Authorization Code grant** (recommended for multi-user). Authorize at `https://{tenant}/identity/connect/authorize`. Exchange via POST to `https://{tenant}/identity/connect/token`. `{tenant}` is the customer's Acumatica ERP instance URL (e.g. `acmecorp.acumatica.com` or a self-hosted host plus DB name path like `acmecorp.acumatica.com/Production`).
- Client Credentials flow is supported for server-to-server.
- Access tokens expire after `3600` seconds; refresh tokens are issued when `offline_access` is requested.
- Discovery is available at `https://{tenant}/identity/.well-known/openid-configuration`.

## Prerequisites

1. An Acumatica ERP instance (cloud SaaS or self-hosted ≥ 2021 R2 for OAuth 2.0). Customer must enable the Web Services API.
2. A registered Connected Application: **System → Integration → Configure → Connected Applications**, OAuth 2.0 Flow = Authorization Code. Note the **Client ID**, **Client Secret**, and add the redirect URI.
3. The Acumatica user whose credentials will be used must have the inventory + distribution roles assigned.

## Configure in admin

1. Open `/platforms` in the admin UI, filter to **Inventory**, click **Acumatica Inventory**.
2. Fill **Configure**:
   - `clientId` — your Connected Application's client id.
   - `clientSecret` — your Connected Application's client secret.
   - `redirectUri` — `${PUBLIC_BASE_URL}/auth/inventory/acumatica-inventory/callback`.
   - `tenantHost` — the customer's Acumatica instance URL (with DB path if self-hosted).
3. Enable the adapter.

## Required scopes

- `api` — REST contract-based + screen-based API access.
- `offline_access` — refresh-token issuance.

Acumatica does not expose per-module scopes; access is controlled by the **Acumatica role** the authenticating user holds. Lock that role down to the inventory + distribution permissions only.

## Webhooks

Acumatica does not provide first-class outbound webhooks for inventory events. The canonical mechanism is **Push Notifications** (configured under **System → Integration → Push Notifications**) which POSTs JSON payloads to a destination URL on every entity change in a watched view. Signing is configured via a custom header or shared secret on the destination — the adapter supports verifying an `X-Acumatica-Signature` (HMAC-SHA256, hex) when you set one.

If push notifications aren't available, the adapter falls back to a polling sync driven by the `ModifiedDateTime` filter on inventory endpoints.

## Quirks worth knowing

- **Tenant URL contains the DB.** Self-hosted instances embed the database name in the path (`acme.com/Production/identity/...`) — both the OAuth and API URLs must use the full path.
- **Endpoint versions are user-defined.** Acumatica lets admins publish multiple API "endpoints"; pin the version (`Default/22.200.001`) explicitly.
- **Concurrent session cap.** Each user has a small concurrent-session limit on the API. Reuse the OAuth access token rather than re-authenticating per request.
- **MYOB Acumatica is a regional rebrand** (Australia/NZ) — same OAuth surface, different marketing.

## References

- [OAuth 2.0 Authorization Code flow in Acumatica](https://www.acumatica.com/blog/oauth-2-0-authorization/) (vendor blog)
- [Acumatica Integration Development Guide](https://www.acumatica.com/media/2020/02/AcumaticaERP_IntegrationDevelopmentGuide.pdf)
- [Community: connecting to the authorize endpoint](https://community.acumatica.com/develop-integrations-with-web-services-apis-289/connecting-to-authorization-endpoint-oauth-authorization-flow-5564)
