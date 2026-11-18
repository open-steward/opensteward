---
vertical: inventory
platform: ordoro
title: Integrating Ordoro
auth_type: api_key
partner_program: false
estimated_time: 15min
last_verified: 2026-05-23
written_by: claude
---

# Ordoro

Ordoro is a shipping + inventory + dropshipping platform aimed at SMB ecommerce merchants. The adapter wraps the Ordoro API v3 and surfaces products, warehouses, suppliers, stock levels, and inventory adjustments into the canonical inventory schema.

## Auth model

- **HTTP Basic auth** with a per-account API key pair. Despite calling them `Client ID` and `Client Secret`, Ordoro does **not** implement OAuth 2.0 — the pair is sent on every request as `Authorization: Basic base64(client_id:client_secret)`.
- The adapter exposes the credential as an `apiKey` setting that accepts the colon-joined pair.

## Prerequisites

1. An Ordoro account at [ordoro.com](https://www.ordoro.com). API access is a paid feature gated to specific plans — confirm with Ordoro before integrating.
2. Generate keys under **Company Name → Account Settings → API Keys → Add an API Key**. Record both the **Client ID** and **Client Secret** at creation time — they cannot be retrieved later.

## Configure in admin

1. Open `/platforms` in the admin UI, filter to **Inventory**, click **Ordoro**.
2. Fill **Configure**:
   - `apiKey` — paste as `{clientId}:{clientSecret}`.
3. Enable the adapter.

## Required scopes

Ordoro has no scope concept — issued keys carry full account access. Manage least-privilege by limiting which users can create API keys and rotating keys on offboarding.

## Webhooks

Ordoro supports **HTTPS webhooks** for order, shipping, and inventory events configured under **Apps → API Webhooks**. Deliveries include a `X-Ordoro-Signature` header (HMAC-SHA256, hex) computed from the per-subscription shared secret and the raw body. The adapter verifies this signature.

Subscribe to `product.updated`, `inventory.updated`, and `warehouse.updated` for the canonical inventory surface.

## Quirks worth knowing

- **Not OAuth.** The "Client ID / Client Secret" naming is misleading — this is HTTP Basic.
- **Keys are uncoverable after creation.** Store immediately; lost keys must be regenerated and re-issued to integration partners.
- **Plan-gated API access.** Lower-tier Ordoro plans don't expose API at all; check before building.
- **Cap on key count.** Ordoro limits the number of active API keys per account (currently 10).

## References

- [Ordoro API documentation](https://docs.ordoro.com/)
- [Creating an API key](https://support.ordoro.com/how-to-create-an-api-key-for-ordoro/)
- [Ordoro API introduction](https://support.ordoro.com/ordoro-api-introduction/)
