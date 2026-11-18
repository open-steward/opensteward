# Jubelio adapter

Indonesian omnichannel inventory platform (jubelio.com).

Auth: POST /login {email, password} → {token} → Authorization: <token> header. Credentials
are stored as email + password in `credentialFields()`; `refreshCredentials()` re-logs in to
obtain a fresh token.

Base URL: https://api.jubelio.com

Pagination: `page` (1-based) + `pageSize` query parameters; response envelope: `{data: [], count: N}`.

Webhook: Jubelio provides outbound webhook endpoints for pushing events (stock, orders, etc.)
but no documented HMAC-signed inbound webhook mechanism — `verifyWebhook` is not implemented.

## Supported resources
- Products (`/inventory/items/`)
- Stock levels (`/inventory/`)
- Locations (`/locations/`)
- Suppliers (`/contacts/suppliers/`)
- Purchase orders (`/purchase/orders/`)
- Stock transfers (`/inventory/transfers/`)
- Stock adjustments (`/inventory/adjustments/`)

## Refused (schema-firewall)
- Product images / file URLs
- Supplier banking details / payment terms
- Cost-method internal details (FIFO/avg)
- Customer-facing order data
- Sales invoices / payments
