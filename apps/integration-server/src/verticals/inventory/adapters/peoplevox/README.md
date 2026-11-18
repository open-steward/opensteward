# Peoplevox adapter

Inventory adapter for Descartes Peoplevox WMS — cloud warehouse management system
for e-commerce brands.

Auth: SOAP session — clientId + username + base64(password) via `Authenticate`
call on IntegrationServiceV4. Session token (SessionId + UserId) is acquired
per client instance and passed in `UserSessionCredentials` SOAP header.

Protocol: SOAP 1.2 (`application/soap+xml`), endpoint
`https://wms.peoplevox.net/{clientId}/resources/integrationservicev4.asmx`.

Data: GetData with `TemplateName` returns CSV embedded in `Detail` XML element.
Pagination via `PageNo` (1-based) and `ItemsPerPage` (max 1000).

Webhooks: Peoplevox uses an event-subscription model (`SubscribePostEvent`)
rather than HMAC-signed HTTP webhooks. No webhook verification is implemented.

## Supported resources
- Products — template: "Item Types"
- Stock Levels — template: "Inventory" (per-site rows)
- Locations — template: "Sites"
- Suppliers — template: "Supplier"
- Purchase Orders — templates: "Purchase order" + "Purchase order lines" (merged)
- Stock Adjustments — template: "Item movement history" (Register_Reason-filtered)

## Refused
- Product images / file URLs
- Supplier banking details / payment terms
- Manufacturing BOM / work orders
- Cost-method internal details
- Customer-facing order / despatch data
