# Pipe17 adapter

Enterprise order-operations platform (ecommerce hub + 3PL) inventory adapter.

Auth: single API key sent as `X-Pipe17-Key` header. Connect Link surfaces it via `credentialFields()`.

Webhook: Pipe17 does not publish a documented HMAC signing scheme — webhook verification is not implemented.

## Supported resources

| Resource | Endpoint |
|---|---|
| Products | `GET /items`, `GET /items/{id}` |
| Stock Levels | `GET /inventory` (bulk only) |
| Locations | `GET /locations`, `GET /locations/{id}` |
| Suppliers | `GET /suppliers`, `GET /suppliers/{id}` |
| Purchase Orders | `GET /purchases`, `GET /purchases/{id}` |
| Stock Transfers | `GET /transfers`, `GET /transfers/{id}` |
| Stock Adjustments | `GET /inventory/events?eventType=adjust`, `GET /inventory/events/{id}` |

Stock adjustments map Pipe17's inventory event ledger (`eventType=adjust`) — each event represents a single-SKU user adjustment.

## Refused
- Product images / 3D assets / file URLs
- Supplier banking details / payment terms
- Cost-method internal details
- Customer-facing order data
