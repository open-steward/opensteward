import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ShipBobInventoryAdapter } from '../../../../../../src/verticals/inventory/adapters/shipbob-inventory/index'
import {
  _resetCursorPager,
  listPage,
  parseListQuery,
  readUpstreamPage,
  withPageSink,
  type Credentials,
} from '@opensteward/shared'

/**
 * What this adapter ASKS FOR, as opposed to what it does with the answer.
 *
 * ShipBob's inventory routes do not page uniformly — `/product` and
 * `/inventory-level` are cursor routes taking `PageSize` with no page number,
 * `/receiving` takes classic `Page` + `Limit`, and `/location` takes no paging
 * at all. Sending a page number to a cursor route silently truncates a sync,
 * which is invisible in transform tests because the transform never sees the
 * request. These tests pin the request instead.
 */
const calls: Array<{ path: string; params?: Record<string, unknown> }> = []
let nextResponse: unknown = null
/** Consecutive responses, for walks across pages; `nextResponse` once empty. */
let queue: unknown[] = []
/** A route that answers from its params, when a test needs real paging semantics. */
let responder: ((path: string, params?: Record<string, unknown>) => unknown) | null = null

vi.mock(
  '../../../../../../src/verticals/inventory/adapters/shipbob-inventory/client',
  () => ({
    ShipBobInventoryClient: class {
      async get(path: string, params?: Record<string, unknown>) {
        calls.push({ path, params })
        const res = responder
          ? responder(path, params)
          : queue.length > 0
            ? queue.shift()
            : nextResponse
        if (res instanceof Error) throw res
        return res
      }
      async post() {
        return null
      }
    },
  }),
)

const creds = { accessToken: 'tok' } as Credentials

beforeEach(() => {
  calls.length = 0
  nextResponse = null
  queue = []
  responder = null
  // Every test here shares one token, so they would share one memoised walk.
  _resetCursorPager()
})

describe('shipbob-inventory request contracts', () => {
  it('asks a cursor route for PageSize and never for a page number', async () => {
    nextResponse = { items: [] }
    await new ShipBobInventoryAdapter().listProducts(creds, { limit: 50, page: 3 })
    expect(calls[0]!.path).toBe('/product')
    expect(calls[0]!.params).toEqual({ PageSize: 50 })
    expect(calls[0]!.params).not.toHaveProperty('Page')
  })

  it('caps PageSize at the vendor maximum rather than sending a larger one', async () => {
    nextResponse = { items: [] }
    await new ShipBobInventoryAdapter().listProducts(creds, { limit: 5000 })
    expect(calls[0]!.params).toEqual({ PageSize: 100 })
  })

  it('reads stock levels from the per-location route, not the network-total one', async () => {
    // `/inventory-level` returns total_* quantities summed across every
    // fulfilment centre. Attributing those to one warehouse would be wrong in
    // a way nothing downstream could detect.
    nextResponse = { items: [] }
    await new ShipBobInventoryAdapter().listStockLevels(creds, {})
    expect(calls[0]!.path).toBe('/inventory-level/locations')
  })

  it('pages receiving orders with Page and Limit, which is what that route takes', async () => {
    nextResponse = []
    await new ShipBobInventoryAdapter().listPurchaseOrders(creds, { page: 2, limit: 25 })
    expect(calls[0]!.path).toBe('/receiving')
    expect(calls[0]!.params).toEqual({ Page: 2, Limit: 25 })
  })


  it('rejects a stock level id that is not the composite listStockLevels emits', async () => {
    await expect(new ShipBobInventoryAdapter().getStockLevel(creds, '16160673')).rejects.toThrow(
      /inventoryId>:<locationId/,
    )
  })
})

describe('shipbob-inventory flattened pages', () => {
  /**
   * A page is one upstream page of ShipBob records, and it returns EVERY row
   * those records flatten into — never trimmed to the caller's `limit`.
   *
   * `/inventory-level/locations` answers one item per inventory id holding a
   * `locations[]`, so 3 items is ~19 stock levels. On 2026-09-18 that tripped
   * the router's "adapter ignored the requested limit" warning, and the adapter
   * started slicing to `limit` to silence it. That was only harmless while
   * the adapter could not reach page 2 anyway. Once pages advance, a slice
   * throws away every row past `limit` on each page: a sync page of 100 items
   * across 6 centres is ~600 rows, and slicing kept 100 of them.
   *
   * The API router still truncates what it SENDS to `meta.limit`; that is its
   * job, and the warning it logs for a flattened list is accurate. This is the
   * precedent Shopify's fulfillments set (see page-meta.ts).
   */
  function itemWithLocations(inventoryId: number, count: number) {
    return {
      inventory_id: inventoryId,
      sku: `SKU-${inventoryId}`,
      locations: Array.from({ length: count }, (_, i) => ({
        location_id: 80 + i,
        on_hand_quantity: i,
      })),
    }
  }

  it('returns every stock level a page flattens into, even past the limit', async () => {
    nextResponse = { items: [itemWithLocations(1, 6), itemWithLocations(2, 6), itemWithLocations(3, 6)] }
    const rows = await new ShipBobInventoryAdapter().listStockLevels(creds, { limit: 3 })
    expect(rows).toHaveLength(18)
  })

  it('returns every product variant a page flattens into, even past the limit', async () => {
    nextResponse = {
      items: [1, 2].map((p) => ({
        id: p,
        variants: [1, 2, 3].map((v) => ({ id: p * 10 + v, sku: `S${p}${v}`, inventory: { inventory_id: p * 10 + v } })),
      })),
    }
    const rows = await new ShipBobInventoryAdapter().listProducts(creds, { limit: 2 })
    expect(rows).toHaveLength(6)
  })
})

describe('shipbob-inventory cursor paging', () => {
  /**
   * `/product` and `/inventory-level/locations` have no page number: page N is
   * reached by following page N-1's `next` link, through the shared cursor
   * pager. The worker asks for pages by number, so an adapter that drops
   * `page` answers every page with page 1.
   *
   * Live `next` links (2026-09-22) are relative and UNVERSIONED, with casing of
   * their own — `/Product?cursor=…`, `/inventory-level?cursor=…` — and the
   * cursor is a gzipped query string carrying the whole position (filters,
   * PageSize, sort, CursorId). So the adapter keeps calling ITS OWN route and
   * sends only the cursor: following the link verbatim would rely on the base
   * path joining right, on case-insensitive routing, and — for the stock-level
   * route — on ShipBob not pointing `/locations` at the network-total route.
   */
  const productPage = (ids: number[], next: string | null) => ({
    items: ids.map((id) => ({ id, variants: [{ id: id + 100, sku: `S${id}`, inventory: { inventory_id: id } }] })),
    next,
  })

  it('reaches page 2 by following page 1’s cursor', async () => {
    queue = [productPage([1, 2], '/Product?cursor=C2'), productPage([3], null)]
    const rows = await new ShipBobInventoryAdapter().listProducts(creds, { limit: 2, page: 2 })
    expect(rows.map((r) => r.id)).toEqual(['3'])
    expect(calls.map((c) => c.params)).toEqual([{ PageSize: 2 }, { cursor: 'C2' }])
  })

  it('sends the cursor to its own route, not to the route the next link names', async () => {
    queue = [
      { items: [{ inventory_id: 1, locations: [{ location_id: 80 }] }], next: '/inventory-level?cursor=S2' },
      { items: [{ inventory_id: 2, locations: [{ location_id: 80 }] }], next: null },
    ]
    await new ShipBobInventoryAdapter().listStockLevels(creds, { limit: 1, page: 2 })
    expect(calls.map((c) => c.path)).toEqual(['/inventory-level/locations', '/inventory-level/locations'])
  })

  it('reports hasMore from the next link, so the worker does not guess from row counts', async () => {
    queue = [productPage([1], '/Product?cursor=C2')]
    const first = withPageSink({ limit: 1, page: 1 })
    await new ShipBobInventoryAdapter().listProducts(creds, first)
    expect(readUpstreamPage(first)).toEqual({ hasMore: true })

    queue = [productPage([2], null)]
    const second = withPageSink({ limit: 1, page: 2 })
    await new ShipBobInventoryAdapter().listProducts(creds, second)
    expect(readUpstreamPage(second)).toEqual({ hasMore: false })
  })

  it('answers a page past the end with nothing, and no request', async () => {
    queue = [productPage([1], null)]
    const a = new ShipBobInventoryAdapter()
    await a.listProducts(creds, { limit: 1, page: 1 })
    const before = calls.length
    expect(await a.listProducts(creds, { limit: 1, page: 2 })).toEqual([])
    expect(calls.length).toBe(before)
  })

  it('fails loudly on a next link with no cursor, rather than ending the collection', async () => {
    // Ending here would mark a truncated collection complete — the defect this
    // exists to remove. A format change should stop the sync, visibly.
    nextResponse = productPage([1], '/Product?page=2')
    await expect(new ShipBobInventoryAdapter().listProducts(creds, { limit: 1 })).rejects.toThrow(/cursor/)
  })

  it('keeps separate walks for separate page sizes', async () => {
    // A cursor encodes its PageSize: page 2 of a walk at 2 is rows 3–4, of a
    // walk at 5 rows 6–10. The pager key must include it, or a size-5 caller
    // is handed the size-2 walk's page-2 cursor. Only a page past the first
    // can show this — page 1 always re-sends its own PageSize.
    queue = [
      productPage([1, 2], '/Product?cursor=A2'),
      productPage([3, 4], null),
      productPage([1, 2, 3, 4, 5], '/Product?cursor=B2'),
      productPage([6], null),
    ]
    const a = new ShipBobInventoryAdapter()
    await a.listProducts(creds, { limit: 2, page: 2 })
    await a.listProducts(creds, { limit: 5, page: 2 })
    expect(calls.map((c) => c.params)).toEqual([
      { PageSize: 2 },
      { cursor: 'A2' },
      { PageSize: 5 },
      { cursor: 'B2' },
    ])
  })
})

describe('shipbob-inventory API paging through the router’s hasMore probe', () => {
  /**
   * The API router asks every adapter for ONE MORE row than the caller wants
   * (`parseListQuery`: `limit: callerLimit + 1`) and drops it (`listPage`) —
   * its probe for `hasMore`. On an offset route the probe costs nothing. On a
   * cursor route it loses a row per page: ShipBob mints the next cursor AFTER
   * the probe row, the router throws that row away, and no page ever serves
   * it. Live, 2026-09-22: a walk at limit=10 over 38 products returned 35 —
   * pages of 10, 10, 10, then 5, which is 38 − 3×11.
   *
   * So a cursor page is sized by the CALLER's limit (`callerLimit`), and the
   * end is reported through `hasMore`, which the router takes in place of a
   * probe row. The sync worker sets no probe; `callerLimit` falls back to its
   * `limit`.
   */
  const ALL = Array.from({ length: 38 }, (_, i) => i + 1)

  /** ShipBob's cursor semantics: the cursor carries the position AND the page size it was minted at. */
  function cursorRoute(_path: string, params?: Record<string, unknown>) {
    const [start, size] = params?.['cursor']
      ? String(params['cursor']).split(':').map(Number)
      : [0, Number(params?.['PageSize'])]
    const end = start! + size!
    return {
      items: ALL.slice(start, end).map((id) => ({
        id,
        variants: [{ id: id + 100, sku: `S${id}`, inventory: { inventory_id: id } }],
      })),
      next: end < ALL.length ? `/Product?cursor=${end}:${size}` : null,
    }
  }

  it('serves every product exactly once across a walk of API pages', async () => {
    responder = cursorRoute
    const a = new ShipBobInventoryAdapter()
    const served: string[] = []
    for (let page = 1; page <= 10; page++) {
      const params = parseListQuery({ limit: '10', page: String(page) })
      const envelope = listPage(await a.listProducts(creds, params), params, 'shipbob-inventory')
      served.push(...envelope.data.map((r) => r.id))
      if (envelope.meta.hasMore === false) break
    }
    expect(served).toHaveLength(38)
    expect(new Set(served).size).toBe(38)
  })

  it('asks ShipBob for the caller’s page size, not the probe’s', async () => {
    nextResponse = { items: [], next: null }
    await new ShipBobInventoryAdapter().listProducts(creds, parseListQuery({ limit: '10' }))
    expect(calls[0]!.params).toEqual({ PageSize: 10 })
  })

  it('still asks a sync for its whole page size', async () => {
    nextResponse = { items: [], next: null }
    await new ShipBobInventoryAdapter().listProducts(creds, withPageSink({ page: 1, limit: 100 }))
    expect(calls[0]!.params).toEqual({ PageSize: 100 })
  })

  /**
   * `/receiving` pages by `Page` + `Limit`, and ShipBob derives the offset from
   * the Limit it was sent: (Page−1)×Limit. Sent the probe's 11, page 2 starts
   * at order 12 while page 1 showed 1–10 — order 11 is on no page. So it is
   * sent the caller's Limit, and on a full page the adapter looks ONE order
   * ahead (Limit 1 at that offset) to report `hasMore` itself. Without the
   * look-ahead a full page could only say `hasMore: null`, and a client that
   * pages while `hasMore === true` would stop after page 1.
   */
  const ORDERS = Array.from({ length: 25 }, (_, i) => i + 1)
  function pageRoute(_path: string, params?: Record<string, unknown>) {
    const page = Number(params?.['Page'])
    const limit = Number(params?.['Limit'])
    return ORDERS.slice((page - 1) * limit, page * limit).map((id) => ({
      id,
      status: 'Awaiting',
      fulfillment_center: { id: 80 },
      inventory_quantities: [],
    }))
  }

  it('serves every receiving order exactly once across a walk of API pages', async () => {
    responder = pageRoute
    const a = new ShipBobInventoryAdapter()
    const served: string[] = []
    const hasMore: Array<boolean | null> = []
    for (let page = 1; page <= 10; page++) {
      const params = parseListQuery({ limit: '10', page: String(page) })
      const envelope = listPage(await a.listPurchaseOrders(creds, params), params, 'shipbob-inventory')
      served.push(...envelope.data.map((o) => o.id))
      hasMore.push(envelope.meta.hasMore)
      if (envelope.meta.hasMore === false) break
    }
    expect(served).toHaveLength(25)
    expect(new Set(served).size).toBe(25)
    // A definite answer on every page — never null on a full one.
    expect(hasMore).toEqual([true, true, false])
  })

  it('says a full LAST page is the last, when the orders are an exact multiple of the page', async () => {
    // The case a look-ahead exists for, and the one an off-by-one in its
    // offset gets wrong: page 2 is full, and nothing follows it.
    responder = (path, params) => pageRoute(path, params).filter((o) => Number(o.id) <= 20)
    const a = new ShipBobInventoryAdapter()
    const hasMore: Array<boolean | null> = []
    for (const page of [1, 2]) {
      const params = parseListQuery({ limit: '10', page: String(page) })
      hasMore.push(listPage(await a.listPurchaseOrders(creds, params), params, 'x').meta.hasMore)
    }
    expect(hasMore).toEqual([true, false])
  })

  it('looks ahead on a full page for a sync too, so its end is known', async () => {
    // The look-ahead used to run only when the adapter detected the router's
    // limit+1 probe. The router no longer sends one, so detection would
    // switch it off for API callers — and a sync gains from it as well: a
    // reported `hasMore` is a KNOWN end, which the sync worker vouches for.
    responder = pageRoute
    const params = withPageSink({ page: 1, limit: 10 })
    await new ShipBobInventoryAdapter().listPurchaseOrders(creds, params)
    expect(calls).toHaveLength(2)
    expect(readUpstreamPage(params)).toEqual({ hasMore: true })
  })

  it('does not look ahead on a short page, which already ends the collection', async () => {
    responder = pageRoute
    const params = withPageSink({ page: 3, limit: 10 })
    await new ShipBobInventoryAdapter().listPurchaseOrders(creds, params)
    expect(calls).toHaveLength(1)
  })
})

describe('shipbob-inventory page-size declaration', () => {
  it('declares the page size it caps every route at', async () => {
    // Without it the worker asks for 500, gets a full page of 100, reads that
    // as short, and marks the collection complete after one page. `/receiving`
    // was truncated exactly that way even though it honours Page.
    const a = new ShipBobInventoryAdapter()
    expect(a.capabilities.maxPageSize).toBe(100)
    nextResponse = []
    await a.listPurchaseOrders(creds, { limit: 500, page: 2 })
    expect(calls[0]!.params).toEqual({ Page: 2, Limit: 100 })
  })
})

describe('shipbob-inventory product limits and lookup', () => {
  /**
   * A canonical product is one per VARIANT, keyed by its inventory id, so
   * `/product` now flattens the way `/inventory-level/locations` does: asking
   * ShipBob for 2 products can yield more than 2 rows (see "flattened pages").
   *
   * And a product id is an INVENTORY id now, which `/product/{productId}` does
   * not accept. The by-id lookup filters `/product` on `InventoryId` instead —
   * a documented query parameter ("Looks for variants by its associated
   * inventory id"), verified live 2026-09-22 to return the owning product.
   */
  function productWithVariants(productId: number, inventoryIds: number[]) {
    return {
      id: productId,
      name: `Product ${productId}`,
      variants: inventoryIds.map((inventoryId) => ({
        id: inventoryId + 1_000_000,
        sku: `SKU-${inventoryId}`,
        inventory: { inventory_id: inventoryId, on_hand_qty: 1 },
      })),
    }
  }

  it('returns one row per variant', async () => {
    nextResponse = { items: [productWithVariants(1, [11, 12, 13]), productWithVariants(2, [21])] }
    const rows = await new ShipBobInventoryAdapter().listProducts(creds, {})
    expect(rows.map((r) => r.id)).toEqual(['11', '12', '13', '21'])
  })

  it('looks a product up by its inventory id, not through /product/{productId}', async () => {
    nextResponse = { items: [productWithVariants(1, [11])] }
    await new ShipBobInventoryAdapter().getProduct(creds, '11')
    expect(calls[0]!.path).toBe('/product')
    expect(calls[0]!.params).toEqual({ InventoryId: '11' })
  })

  it('returns the variant the id names, not the first variant of its product', async () => {
    // The filter matches a VARIANT and answers with its owning product. Whether
    // siblings ride along was not observable (no multi-variant product in the
    // sandbox), so this pins the safe reading: they might.
    nextResponse = { items: [productWithVariants(1, [11, 12, 13])] }
    const p = await new ShipBobInventoryAdapter().getProduct(creds, '12')
    expect(p.id).toBe('12')
    expect(p.sku).toBe('SKU-12')
  })

  it('reports not found when no variant carries the id', async () => {
    nextResponse = { items: [] }
    await expect(new ShipBobInventoryAdapter().getProduct(creds, '99')).rejects.toThrow(/not found/)
  })
})

describe('shipbob-inventory location route', () => {
  /**
   * ShipBob has two location-shaped endpoints and this adapter reads the one
   * that matches what a canonical inventory Location means.
   *
   * Verified live 2026-09-18: `/location` is the whole network (69 centres, 65
   * of them `access_granted: false`) and needs the `locations_read` scope,
   * which a token carrying products_read, inventory_read and receiving_read
   * does not have — it 401s there while reading every other resource fine.
   * `/fulfillment-center` is the 8 centres the merchant uses and needs no
   * extra scope.
   *
   * The decisive test is referential: `listStockLevels` emitted location ids
   * 7, 9, 10, 80, 81, 82, 83, 85 and `/fulfillment-center` returned exactly
   * that set.
   */
  it('reads the merchant fulfilment centres, not the whole ShipBob network', async () => {
    nextResponse = []
    await new ShipBobInventoryAdapter().listLocations(creds, {})
    expect(calls[0]!.path).toBe('/fulfillment-center')
  })

  it('needs no scope-gated route, so sends no access filter', async () => {
    // The /location workaround took AccessGranted=true to trim 69 down to 4.
    // This route returns the merchant's own centres already.
    nextResponse = []
    await new ShipBobInventoryAdapter().listLocations(creds, {})
    expect(calls[0]!.params ?? {}).not.toHaveProperty('AccessGranted')
  })

  it('does not forward paging to a route that takes none', async () => {
    nextResponse = []
    await new ShipBobInventoryAdapter().listLocations(creds, { page: 2, limit: 10 })
    const params = calls[0]!.params ?? {}
    expect(params).not.toHaveProperty('Page')
    expect(params).not.toHaveProperty('Limit')
    expect(params).not.toHaveProperty('PageSize')
  })

  it('resolves a location by id from the same route', async () => {
    nextResponse = [{ id: 9, name: 'Bethlehem (PA)' }]
    const l = await new ShipBobInventoryAdapter().getLocation(creds, '9')
    expect(calls[0]!.path).toBe('/fulfillment-center')
    expect(l.name).toBe('Bethlehem (PA)')
  })
})
