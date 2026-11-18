# Unicommerce adapter

Inventory surface for Unicommerce (Uniware), the India-focused multichannel
WMS/OMS platform.

Auth: OAuth2 password grant. `credentialFields()` collects the tenant
subdomain, username, password, and an optional default facility code. The
token comes from `https://<tenant>.unicommerce.com/oauth/token` using the
fixed public client id `my-trusted-client`, is sent as
`Authorization: bearer <token>`, and is refreshed via the `refresh_token`
grant. No browser OAuth flow.

Base URL: tenant-specific,
`https://<tenant>.unicommerce.com/services/rest/v1`. Reads are POSTs.
Facility-level endpoints (inventory snapshots, purchase-order details,
gatepasses) additionally send a
`Facility: <code>` header when a facility code is configured.

Webhook: none — `verifyWebhook` / `parseWebhookEvents` are not implemented.

Pagination: product search uses `displayStart` / `displayLength`
(default page size 50). Inventory snapshots, facility search and
purchase-order search document no paging parameter and no order: each
answers with every row matching its request. Every page therefore re-sends
the same request, sorts the answer by id and slices the caller's page from
it locally, reporting the number of matching rows as the total.
Purchase-order codes are sliced before the per-code detail calls, so a page
fetches only its own orders' details.

What those totals count:
- Stock levels: the SKUs updated in the last 24 hours (see below), not every
  SKU in the facility. The window is measured from each request's own time,
  so a SKU can enter or leave it between two pages of one walk.
- Purchase orders: the codes the search returned. An order whose detail call
  Uniware refuses (an HTTP 4xx other than 401 or 429, or a body with no
  order) is left out of its page, so that page is short of the total. Any
  other failure (no response, a timeout, an expired token, a 429 or 5xx after
  retries) fails the page instead of shortening it.

## Resources
- Products (item types; single fetch by SKU code)
- Stock levels — inventory snapshots. Bulk list requires a filter, so with no
  params it requests the last 24 h of updates (`updatedSinceInMinutes`,
  overridable via `params.updatedSinceMinutes`); single fetch queries by SKU
- Locations (facilities)
- Purchase orders — search returns codes only, so each order's detail is
  fetched per code
- Stock transfers — gatepasses of type `STOCK_TRANSFER`; there is no list-all
  endpoint, so `listStockTransfers` requires gatepass codes via `params.ids`
  and returns an empty list without them

## Not supported
- Suppliers — no public vendor list/get API
- Stock adjustments — write-only single-item API; no list/get endpoint
