# 3PL Central adapter

Inventory adapter for 3PL Central (Extensiv Warehouse Manager), a cloud-based 3PL WMS.

Auth: per-warehouse client credentials entered in the connect form. POST to
`https://secure-wms.com/AuthServer/api/Token` with `Authorization: Basic base64(clientId:clientSecret)`
and a JSON body `{ "grant_type": "client_credentials", "user_login_id": ..., "tpl": ... (optional) }`,
as the vendor Postman collection documents. The form also collects the Customer ID and Facility ID
that the read endpoints below put in their path or query.
Tokens expire after ~60 minutes; the adapter re-requests on expiry (no refresh_token).

Webhook: RSA-SHA256. Body signed with platform's private key; signature delivered
base64-encoded in the `Signature` header. Fetch public key from
`GET https://secure-wms.com/events/webhook/key`.

## Supported resources

| Resource          | Endpoint                                      |
|-------------------|-----------------------------------------------|
| Products (items)  | `GET /customers/{customerId}/items`           |
| Stock Levels      | `GET /inventory/stockdetails`                 |
| Locations (bins)  | `GET /inventory/facilities/{id}/locations`    |
| Purchase Orders   | `GET /inventory/receivers`                    |
| Stock Adjustments | `GET /inventory/adjustments`                  |

## Not supported (no public REST endpoint)

- Suppliers — appear as embedded identifiers only; no `/suppliers` list endpoint
- Stock Transfers — no transfer endpoint in the public API
- Product images / file URLs
- Supplier banking / payment terms
- BOM / kit components
- Cost-method internal details (FIFO/LIFO/avg)
- Customer-facing order / shipment data
