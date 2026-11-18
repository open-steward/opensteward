# Picqer adapter

Picqer is a warehouse management system (WMS) built for e-commerce operations.

Auth: HTTP Basic Auth — API key as username, password blank. Subdomain is required to build the per-tenant base URL (`https://{subdomain}.picqer.com/api/v1`). Both fields are surfaced via `credentialFields()`.

Webhook: HMAC-SHA256 over raw body, result **base64-encoded**, header `X-Picqer-Signature`.

## Supported resources
- Products (`GET /products`)
- Stock levels (`GET /warehouses/{id}/stock`)
- Locations / warehouses (`GET /warehouses`)
- Suppliers (`GET /suppliers`)
- Purchase orders (`GET /purchaseorders`)
- Stock adjustments (`GET /stockhistory`)

## Not supported
- Stock transfers — Picqer has no inter-warehouse transfer API endpoint.

## Refused
- Product images / file URLs
- Supplier banking details / payment terms
- Cost-method internal details
- Customer-facing order data (orders / picklists / shipments)
