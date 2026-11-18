# GoCodes adapter

Asset-tracking platform mapped to the inventory vertical.

Auth: Static API key passed as the `apikey` query parameter on every request. Connect Link surfaces it via `credentialFields()`.

Webhooks: GoCodes does not document an HMAC request-signing scheme; no `parseWebhookEvents` method is implemented.

## Supported resources

| Resource     | Endpoint          | Notes |
|--------------|-------------------|-------|
| products     | `GET /assets`     | Each asset record becomes one Product; `asset_tag` → SKU |
| stock-levels | `GET /assets`     | Synthesised: every asset at a location contributes qty=1 |
| locations    | `GET /locations`  | |

## Unsupported Resources

- **supplier**: GoCodes is an asset-tracking platform, not a procurement or supply-chain system. It has no vendor/supplier concept or API endpoint; a `transform/supplier.ts` is therefore not present and should not be created.
- **purchase-order**: GoCodes does not model purchasing workflows. There is no purchase-order endpoint in the public REST API; a `transform/purchase-order.ts` is therefore not present and should not be created.
- **stock-transfer**: GoCodes tracks individual asset records rather than bulk inventory movements between locations. No stock-transfer endpoint exists in the public API; a `transform/stock-transfer.ts` is therefore not present and should not be created.
- **stock-adjustment**: GoCodes has no dedicated stock-adjustment or inventory-transaction endpoint. Quantity changes are implicit (assets are checked in/out or reassigned); a `transform/stock-adjustment.ts` is therefore not present and should not be created.
- **webhook**: GoCodes does not document an HMAC request-signing scheme or event-subscription endpoint. `parseWebhookEvents` is not implemented.

## Refused by schema-firewall

- Product images / file URLs
- Supplier banking details / payment terms
- Customer-facing order data
- Manufacturing BOM / work orders
