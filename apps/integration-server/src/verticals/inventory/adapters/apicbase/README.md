# Apicbase adapter

Food & beverage inventory management platform. Covers ingredient (product) management,
outlet (location) inventory, supplier management, and procurement.

Auth: OAuth2 Bearer access token sent as `Authorization: Bearer <token>`. Token is surfaced
via `credentialFields()` as a single `apiKey` field (the access token). Stock levels and
transfers need the `inventory` scope ("Access to inventory events and stock data.").

Base URL: `https://api.apicbase.com/api/v2`

## Supported resources

- **Products** → Apicbase ingredients (`GET /products/ingredients/`)
- **Stock Levels** → outlet stock items (`GET /inventory/outlets/{outlet_id}/stock_items/stock/`)
- **Locations** → outlets (`GET /accounts/outlets/`)
- **Suppliers** → suppliers (`GET /suppliers/`)
- **Purchase Orders** → procurement orders (`GET /procurement/purchase_orders/`)
- **Stock Transfers** → outlet transfer events (`GET /inventory/outlets/{outlet_id}/transfer_events/incoming/` and `.../outgoing/`)
- **Stock Adjustments** → outlet top counts (`GET /inventory/outlets/{outlet_id}/count_events/`), each
  count's lines from `GET /inventory/outlets/{outlet_id}/count_events/{top_count_id}/stocks/`

## Paging

Every list is a Django REST Framework envelope, `{ count, next, previous, results[] }`, paged
by `page` (1-based) and `page_size`: "with 10 results being shown by page by default", and "In
most cases, the maximum amount of items that can be requested is **200**."
([pagination](https://developers.apicbase.com/reference/pagination)). The Apicbase docs do
not say what a page past the end returns; Django REST Framework answers it with 404 "Invalid
page.", and the adapter reads a 404 on page 2 or later as an empty last page.

No `capabilities.maxPageSize` is declared: every list serves the caller's limit, the
per-outlet walks by cutting rows out of smaller upstream pages.

- **Products, locations, suppliers, purchase orders, and one outlet's stock levels**
  (`filter.outletId`): one caller page is one upstream page. `page_size` is the caller's
  limit, at most 200; a larger limit is sent as 200 and reported as the page size, so the
  router, the cache and the sync worker judge a page of 200 as full. `hasMore` comes from
  `next`, the total from `count`, and a 404 past the end is an empty last page.
- **Stock levels and stock transfers across outlets** (and one outlet's transfers, which are
  two lists): the adapter walks outlet by outlet, each outlet's list page by page at the
  caller's limit (at most 200), and cuts exactly the caller's rows out of that stream with
  `pageByRows`. Outlets are read from `GET /accounts/outlets/` 200 at a time, following
  `next`, as the walk reaches them. One call may walk up to 10,000 upstream pages, because
  every empty outlet list still costs one.
- **Stock adjustments** walk outlets the same way over `GET …/count_events/` (reference/get-top-counts),
  whose `page_size` is "Defaults to 10, capped at 100.", so it is sent as at most 100. The
  retired `count_events/aggregated/` ("That path still works but is no longer documented and
  will be retired") is no longer called. "The response no longer embeds a `counted_items`
  array", so each top count served is expanded with one request to its `stocks/` list (five at
  a time); a line's delta is the sum of its `inventory_log_entries[].variance_quantity`, which
  "is only populated in closed top counts", so an open count has no lines. Ids are
  `{topCountId}:{outletId}`, which `getStockAdjustment` reads back. The vendor's order is not
  stable: "Counts still open are listed first, then the most recently submitted ones.", so a
  count that closes (or a new one opened) between two caller pages moves, and a walk held
  across those pages can skip or repeat it. The docs offer no other sort order.

## Errors in a per-outlet walk

A per-outlet list that answers 403 (an outlet the token may not read) or 404 (an outlet
deleted since it was listed) is skipped. If every list the walk read answered 403 and none
answered at all, the 403 is thrown rather than served as a complete, empty collection. Any
other error fails the call, and so does a failed `GET /accounts/outlets/`. Before, every
per-outlet error was swallowed, which cut syncs short without saying so.

These status codes are assumptions, not vendor fact: the spec documents only a 200 for
`/accounts/outlets/`, the stock list and both transfer lists, and 403 and 404 are what Django
REST Framework answers. The all-refused case is expected from a token that has the `accounts`
scope ("Access to user, library, and outlet endpoints.") and not `inventory`, since the two are
documented as separate scopes; the docs do not say how such a token is answered.

## Ids

- Outlets are identified by `id`; they carry no `uid`. Location ids, stock-level
  `locationId`s and transfer location ids are all outlet ids and match each other.
- A stock level's `productId` is a **stock item** id: the stock endpoint lists "Only base
  stock items of ingredients". Products are ingredients, which name their stock items only
  through `main_stock_items` URLs, so a stock level's `productId` never equals a Product id.
  Stock-level ids are `{stockItemId}:{outletId}`, which `getStockLevel` accepts.
- A stock transfer's id is the transfer event's id. Rows name only the other end of the
  transfer (`origin_outlet` / `destination_outlet`, as URLs), so the outlet the row was listed
  from is filled in by the adapter. A transfer listed at both of its outlets under one id is
  served once, where it first appears. The documentation does not say whether the two sides
  of one transfer share an id; if they do not, a transfer is listed once per side, and
  `metadata.direction` tells them apart.
- `getStockTransfer` takes `{eventId}:{outletId}:{direction}`, not the bare id the list
  serves, and only the outgoing detail (`transfer_events/outgoing/{event_apic_id}/`) is
  documented.

## Unsupported Resources

- **Webhooks** — Apicbase has no documented HMAC/JWT webhook signing scheme; `parseWebhookEvents` is not implemented.

## Schema-firewall

- Product images / 3D assets / file URLs are not passed through
- Supplier banking details / payment terms are not surfaced
- Recipe BOM / kit components / nutritional calculations are not passed through
- Customer-facing order data is not surfaced
