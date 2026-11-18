# Snipe-IT adapter

IT asset management mapped to the inventory vertical.

Auth: Bearer API token, generated in Snipe-IT under **Settings → API**. The user also supplies their self-hosted or cloud instance URL (e.g. `https://assets.example.com`).

Webhooks: Snipe-IT does not document HMAC request signing; `verifyWebhook` always returns `false`.

## Supported resources

| Resource       | Endpoint        | Notes |
|----------------|-----------------|-------|
| products       | `GET /hardware` | Each hardware asset becomes one Product record |
| stock-levels   | `GET /hardware` | Synthesised: qty=1 per asset at its current location |
| locations      | `GET /locations` | |
| suppliers      | `GET /suppliers` | |

## Unsupported Resources

- **purchase-order**: Snipe-IT is an IT asset management system, not a procurement platform. It has no purchase-order concept or `/purchase-orders` API endpoint; a `transform/purchase-order.ts` is therefore not present and should not be created.
- **stock-transfer**: Snipe-IT tracks individual hardware assets rather than bulk inventory movements between locations. Assets can be checked in/out but there is no stock-transfer or inter-location transfer endpoint; a `transform/stock-transfer.ts` is therefore not present and should not be created.
- **stock-adjustment**: Snipe-IT does not expose a dedicated inventory-adjustment or quantity-correction endpoint. Asset status changes are made via checkout/checkin actions rather than adjustments; a `transform/stock-adjustment.ts` is therefore not present and should not be created.
- **webhooks**: Snipe-IT does not document HMAC request signing for webhooks; `verifyWebhook` always returns `false` and `parseWebhookEvents` is not implemented.

## Refused by schema-firewall

- Product images / file URLs
- Supplier banking details / payment terms
- Customer-facing order data
- Manufacturing BOM / work orders
