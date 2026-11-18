# Lightspeed Commerce (Retail/Inventory) adapter

Cloud retail POS platform (formerly Vend) with multi-outlet inventory management.

Auth: OAuth2 Authorization Code Grant. Authorize URL: `https://secure.retail.lightspeed.app/connect`.
Token URL: `https://{domain_prefix}.retail.lightspeed.app/api/1.0/token`.
The `domain_prefix` is returned in the token response and stored in `credentials.extra.domainPrefix`.

Base URL: `https://{domain_prefix}.retail.lightspeed.app/api/2.0`

Pagination: the API 2.0 version keyset — `version.max` from each response is the next `after` query parameter, until an empty collection. Pages are at most 200 (`maxPageSize`), the documented default Lightspeed advises not to exceed.

Webhook: HMAC-SHA256 over body, header `X-Signature: signature=<hex>,algorithm=HMAC-SHA256`.
Key is the application `client_secret`.

## Supported resources
- Products (`GET /products`)
- Inventory records / stock levels (`GET /inventory`)
- Outlets / locations (`GET /outlets`)
- Suppliers (`GET /suppliers`)
- Purchase orders — type=SUPPLIER consignments (`GET /consignments?type=SUPPLIER`)
- Stock transfers — type=OUTLET consignments (`GET /consignments?type=OUTLET`)
- Stock adjustments — type=STOCKTAKE consignments (`GET /consignments?type=STOCKTAKE`)

## Refused
- Product images / file URLs
- Supplier banking details / payment terms
- BOM / composite product internals
- Customer-facing sale / order data
