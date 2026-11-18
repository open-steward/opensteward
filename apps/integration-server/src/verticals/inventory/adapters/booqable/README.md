# Booqable adapter

Rental management platform. Exposes product groups (rentable SKUs), individual stock items,
locations, rental orders, and stock adjustments.

Auth: Bearer access token + company slug (subdomain). Both surfaced via `credentialFields()`.
API: JSON:API v4 at `https://{company_slug}.booqable.com/api/4/`

Webhook: No HMAC/JWT signing documented in public API docs — `verifyWebhook` is not implemented.

## Supported resources
- `product_groups` → products
- `stock_items` → stock levels (one record per physical item)
- `locations`
- `orders` → purchase orders (rental orders mapped onto PO schema)
- `stock_adjustments`

## Unsupported Resources
- **supplier**: Booqable is a rental management platform with no vendor/supplier management concept. There is no contacts or suppliers endpoint in the Booqable v4 API — `transform/supplier.ts` cannot be implemented.
- **stock-transfer**: Booqable has no warehouse-to-warehouse stock transfer concept. Inventory moves between locations via rental order fulfilment, not discrete transfer records — `transform/stock-transfer.ts` cannot be implemented.
- **product images / file URLs**: Not surfaced — schema firewall on binary/CDN data.
- **customer-facing payment details**: Not surfaced — excluded by the inventory schema firewall.
- **BOM / kit components**: Booqable has no bill-of-materials concept.
