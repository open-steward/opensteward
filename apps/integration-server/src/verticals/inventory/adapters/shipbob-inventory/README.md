# ShipBob inventory adapter

3PL stock-of-record surface for ShipBob, against `https://api.shipbob.com/2026-01`
(`https://sandbox-api.shipbob.com/2026-01` when the adapter is constructed with
`sandbox: true`).

ShipBob is a third-party logistics provider: the merchant's stock physically
sits in ShipBob's fulfilment centres, so "inventory" here means what ShipBob
holds and what is inbound to it — not a warehouse the merchant runs.

Auth: a ShipBob Personal Access Token, entered via `credentialFields()` and sent
as a `Bearer` token. OAuth is not implemented here (`getAuthUrl` throws); the
sibling `logistics/shipbob` adapter does run ShipBob's OAuth flow against the
same credential.

Webhook: Standard Webhooks — `webhook-id`, `webhook-timestamp` and
`webhook-signature` headers, HMAC-SHA256 base64 over
`${id}.${timestamp}.${body}`, keyed on the base64-decoded `whsec_` secret.

## Two location endpoints, and why this reads the second

ShipBob exposes both, and they answer different questions (verified live
against the sandbox, 2026-09-18):

| Route | Returns | Scope |
|---|---|---|
| `/location` | ShipBob's whole network — 69 centres, 65 `access_granted: false` | `locations_read` |
| `/fulfillment-center` | the 8 centres this merchant uses | none beyond the others |

This adapter reads `/fulfillment-center`. The reason is referential, not
convenience: the location ids `listStockLevels` emits were 7, 9, 10, 80, 81,
82, 83, 85, and `/fulfillment-center` returns exactly that set — so every
`stockLevel.locationId` resolves to a location the adapter actually returned.

It read `/location` until the live run, where a token carrying
`products_read`, `inventory_read` and `receiving_read` served every other
resource and got an empty-bodied 401 here. Granting `locations_read` would
have fixed the symptom, at the cost of downloading 61 warehouses the merchant
cannot use to answer a question the other route answers exactly.

## Three id spaces, and why products are keyed by inventory id

ShipBob identifies one sellable thing three ways:

| Id | Example | What it is |
|---|---|---|
| product | `10343431` | a container — no SKU, no stock |
| variant | `23403772` | where the SKU lives |
| inventory | `16160699` | the stock-of-record |

Stock levels (`/inventory-level/locations`) and purchase-order lines
(`/receiving` `inventory_quantities[]`) reference the **inventory** id, so a
canonical product is **one per variant, keyed by `variants[].inventory.inventory_id`**.
The ShipBob product and variant ids are kept in `metadata.shipbobProductId` /
`metadata.shipbobVariantId`; `parentProductId` stays unset because the product
container is not emitted as a canonical row for it to point at.

Until 2026-09-22 this adapter keyed products by the product id. Every row
passed its canonical schema, and yet on a real sync 0 of 84 stock levels and 0
of 76 PO lines resolved to a product — the break only exists across resources,
which is what `references.test.ts` pins. Keying per variant also stopped
variants two-onward being dropped: the product-keyed transform read
`variants[0]` and nothing else.

`getProduct` filters `/product` on `InventoryId`, since `/product/{productId}`
takes the other id space.

## Resources

| Canonical resource | Route | Paging |
|---|---|---|
| products | `GET /product`, one row per variant | cursor — `next` link, via the shared cursor pager |
| stock levels | `GET /inventory-level/locations` | cursor — `next` link, via the shared cursor pager |
| locations | `GET /fulfillment-center` | none (bare array) |
| purchase orders | `GET /receiving` | `Page` + `Limit` |

## Paging

Until 2026-09-22 a sync of any account with more than 100 of anything stopped
at 100 and marked the collection complete — for all three paged routes, by two
different mechanisms:

- **Cursor routes** have no page number: page N is reached by following page
  N-1's `next` link. The adapter sent `PageSize` and dropped `page`, so every
  page was page 1. They now resolve the worker's page number through
  `pageByCursor` (`@opensteward/shared`), and report `hasMore` from the link.
- **`/receiving`** always honoured `Page`, but capped `Limit` at 100 while the
  worker asked for 500 — so a full page of 100 looked short and the worker
  stopped. The adapter now declares `maxPageSize: 100`, and the worker asks for
  what it will get.

Live `next` links are relative and **unversioned**, with casing of their own
(`/Product?cursor=…`, `/inventory-level?cursor=…`), and the cursor is a
gzipped query string carrying the whole position — filters, `PageSize`, sort,
`CursorId`. So the adapter takes only the cursor and sends it back to the
route that minted it; it never follows the link's path. A `next` link with no
cursor throws rather than ending the collection.

The flattened routes (a product is one row per variant, a stock level one row
per fulfilment centre) return **every** row a page flattens into, and are not
trimmed to `limit`: trimming discards rows the next page will not return. The
API router still truncates what it sends a caller to `meta.limit`.

Cursor walks are keyed by a hash of the refresh token (or the access token,
for a Personal Access Token) — credentials carry no ShipBob account id, and a
refresh token survives the hourly access-token refresh a long sync can span.

### The API router's `hasMore` probe

Every API list request asks the adapter for **one more row** than the caller
wants (`parseListQuery`: `limit: callerLimit + 1`) and drops it — the router's
probe for `hasMore`. Both ShipBob paging shapes turn that into a lost row per
page: a cursor is minted *after* the probe row, and `/receiving` computes its
offset as `(Page − 1) × Limit` from the probe-inflated Limit. Live, a walk at
`limit=10` over 38 products served 35.

So every route asks ShipBob for `callerLimit(params)` — the caller's size,
probe stripped; for the sync worker, which sets no probe, just its `limit`.
The cursor routes report `hasMore` from the `next` link. `/receiving` has no
such signal, so on a full page it looks one order ahead (`Limit=1` at that
offset) and reports it — otherwise a full page could only say
`hasMore: null`, which a client cannot paginate on.

### Verified

- `sync-paging.test.ts` runs the real sync worker, at its production page
  size, against this adapter over pages straddling 100.
- Live against the sandbox (2026-09-22): a sync still collects 38 products,
  84 stock levels, 17 purchase orders, 8 locations in one page each; and an
  API walk at `limit=10` follows real ShipBob cursors across four pages —
  proving a cursor is accepted on the route that minted it, not only on the
  one its link names.

Stock levels read the per-location route rather than plain `/inventory-level`,
which reports quantities summed across every fulfilment centre. A canonical
stock level is per (product, location), so one inventory item held at three
centres becomes three rows.

## Not implemented

ShipBob has no endpoint for these, so they are declared unavailable in
`metadata.ts` rather than stubbed:

- **suppliers** — ShipBob warehouses stock; it models no procurement.
- **stock transfers** — stock moves between ShipBob's own centres internally,
  with no transfer resource to read.
- **stock adjustments** — `POST /inventory/history:query` returns a movement
  feed, not adjustment records.

ShipBob also publishes no product, inventory or stock-level webhook topic, so
stock changes have to be polled. The six `wro.*` topics map to purchase orders.

## Refused
- Product images / 3D assets / file URLs
- Supplier banking details / payment terms
- BOM / kit components / work orders
- Cost-method internal details (FIFO/LIFO/avg)
- Customer-facing order data
