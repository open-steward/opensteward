# EZOfficeInventory (EZO) adapter

Asset-tracking and inventory management platform for physical equipment and consumables.

Auth: Bearer API token + company subdomain. Token generated in Settings → Integrations/API Integration. Both surfaced via `credentialFields()`.

Base URL: `https://<subdomain>.ezofficeinventory.com/api/v2`

Webhook: EZO does not document HMAC/JWT webhook signing — webhook support is omitted.

## Supported resources
- Inventory items (Products)
- Stock levels by location (expanded from inventory history)
- Locations
- Vendors (Suppliers)
- Purchase orders
- Stock transfer events (from inventory history)
- Stock adjustment events (from inventory history)

## Refused
- Product images / file URLs / document attachments
- Supplier banking details / payment terms
- Fixed assets checkout/checkin lifecycle (not part of the canonical inventory schema; never surfaced)
- Customer-facing order data
- BOM / kit components
