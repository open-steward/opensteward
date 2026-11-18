# Restaurant365 adapter

Inventory adapter for Restaurant365 (R365), a restaurant-focused ERP for multi-unit operators.

Auth: Bearer token issued by R365 Support to integration partners + tenant subdomain.
  - `apiKey` — the bearer token (stored as `credentials.accessToken`)
  - `subdomain` — the tenant subdomain (e.g. `mycompany` from `mycompany.restaurant365.com`)

API surfaces:
  - OData read API: `https://odata.restaurant365.net/api/v2/views/` (bearer token, used for all reads)
  - REST write API: `https://{tenant}.restaurant365.com/APIv1` (used for AP Invoices / Journal Entries — write-only, not needed here)

Webhooks: R365 does not publish HMAC/JWT webhook signing documentation; webhooks are not supported.

## Refused
- Product images / 3D assets / file URLs
- Supplier banking details / payment terms
- Cost-method internal details
- Customer-facing order data
- Write operations (AP Invoices, Journal Entries) via the REST API
