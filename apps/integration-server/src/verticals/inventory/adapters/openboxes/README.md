# OpenBoxes adapter

Open-source, self-hosted supply chain management system widely used in
humanitarian and healthcare logistics.

Auth: username + password POSTed to `/openboxes/api/login` returns a
`JSESSIONID` session cookie. The instance base URL is user-provided.

Webhook: none — no HMAC-signed webhook mechanism is documented in the
public OpenBoxes API.

## Supported resources

- Products (`/openboxes/api/products`)
- Locations (`/openboxes/api/locations`)
- Stock Levels (`/openboxes/api/generic/inventoryItem`)
- Suppliers (locations with `locationTypeCode=SUPPLIER`)
- Purchase Orders (inbound stock movements via `/openboxes/api/stockMovements?direction=INBOUND`)
- Stock Transfers (outbound stock movements via `/openboxes/api/stockMovements?direction=OUTBOUND`)
- Stock Adjustments (`/openboxes/api/generic/transaction`)

## Refused

- Product images / file URLs
- Supplier banking details / payment terms
- BOM / kit components / work orders
- Cost-method internal details
- Customer-facing order data
