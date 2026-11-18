/**
 * KitchenHub read methods, rebuilt onto the first-party OpenAPI reference
 * (https://kitchenhub.readme.io/reference/, server https://api.kitchenhub.app):
 *
 *  - listCarriers   -> GET /v2/providers/   "parameters": [], bare array   (pageLocally)
 *  - listWarehouses -> GET /v2/stores/      { stores }, filter only         (pageLocally)
 *  - listShipments  -> GET /v2/deliveries/  { deliveries }, filters only    (pageLocally)
 *  - listOrders     -> GET /v2/orders/?page bare array, page only           (pageByRows)
 *  - getTrackingEvents -> refused (no status history is documented)
 *
 * The fakes honour only documented parameters and throw on anything else.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import axios from 'axios'
import {
  _resetRowPager,
  listPage,
  readUpstreamPage,
  withPageSink,
  type QueryParams,
} from '@opensteward/shared'
import { KitchenHubAdapter } from '../../../../../../src/verticals/logistics/adapters/kitchenhub/index'
import { CarrierSchema } from '../../../../../../src/verticals/logistics/schema/carrier'
import { OrderSchema } from '../../../../../../src/verticals/logistics/schema/order'
import { ShipmentSchema } from '../../../../../../src/verticals/logistics/schema/shipment'
import { WarehouseSchema } from '../../../../../../src/verticals/logistics/schema/warehouse'
import {
  documentedDelivery,
  documentedOrder,
  documentedProvider,
  documentedStore,
} from './fixtures/documented'

const CREDS = { accessToken: 'kh_access', refreshToken: 'kh_refresh' }
const L = 3
const N = 2 * L + 1
const CALL_BUDGET = 100

type Params = Record<string, unknown>
interface Call {
  path: string
  params: Params
}

/** Mock axios.create so KitchenHubClient talks to `handler`; records the client config too. */
function install(handler: (path: string, params: Params) => unknown) {
  const calls: Call[] = []
  const get = vi.fn(async (path: string, cfg?: { params?: Params }) => {
    if (calls.length >= CALL_BUDGET) throw new Error('call budget exceeded')
    const params = cfg?.params ?? {}
    calls.push({ path, params })
    return { data: handler(path, params) }
  })
  const create = vi.spyOn(axios, 'create').mockReturnValue({
    get,
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    defaults: { headers: { common: {} } },
  } as never)
  return { calls, create }
}

function noParams(path: string, params: Params): void {
  if (Object.keys(params).length)
    throw new Error(`${path} takes no params here, got ${Object.keys(params).join(', ')}`)
}

async function walk<T extends { id?: string }>(
  list: (p: QueryParams) => Promise<T[]>,
  limit: number,
  pages: number,
) {
  const seen: string[] = []
  const hasMore: boolean[] = []
  for (let k = 1; k <= pages; k++) {
    const params = withPageSink({ page: k, limit })
    const env = listPage(await list(params), params, 'kitchenhub')
    seen.push(...env.data.map((r) => r.id!))
    hasMore.push(env.meta.hasMore as boolean)
    expect(readUpstreamPage(params)).toEqual(expect.objectContaining({ pagedLocally: true }))
  }
  return { seen, hasMore }
}

const adapter = () => new KitchenHubAdapter()

beforeEach(() => _resetRowPager())
afterEach(() => vi.restoreAllMocks())

describe('kitchenhub client', () => {
  it('calls the documented server https://api.kitchenhub.app with a Bearer access token', async () => {
    const { create } = install(() => [])
    await adapter().listCarriers(CREDS, { page: 1, limit: L })
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        baseURL: 'https://api.kitchenhub.app/v2/',
        headers: expect.objectContaining({ Authorization: 'Bearer kh_access' }),
      }),
    )
  })
})

// ── listCarriers / getCarrier ────────────────────────────────────────────────

describe('kitchenhub listCarriers (GET /v2/providers/)', () => {
  const providers = Array.from({ length: N }, (_, i) => ({
    ...documentedProvider(),
    provider_id: `p${i}`,
    provider_name: `Provider ${i}`,
  }))
  const fake = (path: string, params: Params) => {
    if (path !== 'providers/') throw new Error(`unexpected path ${path}`)
    noParams(path, params)
    return providers
  }

  it('sends GET providers/ with no parameters', async () => {
    const { calls } = install(fake)
    await adapter().listCarriers(CREDS, { page: 2, limit: L })
    expect(calls).toEqual([{ path: 'providers/', params: {} }])
  })

  it('walks N = 2L+1 providers: every id once, hasMore exact', async () => {
    install(fake)
    const { seen, hasMore } = await walk((p) => adapter().listCarriers(CREDS, p), L, 3)
    expect(seen).toEqual(providers.map((p) => p.provider_id))
    expect(hasMore).toEqual([true, true, false])
  })

  it('returns rows that parse with CarrierSchema', async () => {
    install(fake)
    const rows = await adapter().listCarriers(CREDS, { page: 1, limit: L })
    for (const r of rows) expect(() => CarrierSchema.parse(r)).not.toThrow()
  })

  it('getCarrier returns the provider whose provider_id matches', async () => {
    install(fake)
    const c = await adapter().getCarrier(CREDS, 'p4')
    expect(c).toEqual(expect.objectContaining({ id: 'p4', name: 'Provider 4' }))
  })

  it('getCarrier throws 404 for an unknown provider_id', async () => {
    install(fake)
    await expect(adapter().getCarrier(CREDS, 'nope')).rejects.toMatchObject({ statusCode: 404 })
  })
})

// ── listWarehouses / getWarehouse ────────────────────────────────────────────

describe('kitchenhub listWarehouses (GET /v2/stores/)', () => {
  const stores = Array.from({ length: N }, (_, i) => ({ ...documentedStore(), id: `s${i}` }))
  const fake = (path: string, params: Params) => {
    if (path === 'stores/') {
      noParams(path, params)
      return { stores }
    }
    const m = /^stores\/([^/]+)\/$/.exec(path)
    if (m) return stores.find((s) => s.id === m[1])
    throw new Error(`unexpected path ${path}`)
  }

  it('sends GET stores/ with no parameters', async () => {
    const { calls } = install(fake)
    await adapter().listWarehouses(CREDS, { page: 1, limit: L })
    expect(calls).toEqual([{ path: 'stores/', params: {} }])
  })

  it('walks N = 2L+1 stores: every id once, hasMore exact', async () => {
    install(fake)
    const { seen, hasMore } = await walk((p) => adapter().listWarehouses(CREDS, p), L, 3)
    expect(seen).toEqual(stores.map((s) => s.id))
    expect(hasMore).toEqual([true, true, false])
  })

  it('getWarehouse reads GET stores/{store_id}/ and parses with WarehouseSchema', async () => {
    const { calls } = install(fake)
    const w = await adapter().getWarehouse(CREDS, 's2')
    expect(calls).toEqual([{ path: 'stores/s2/', params: {} }])
    expect(WarehouseSchema.parse(w).id).toBe('s2')
  })
})

// ── listShipments / getShipment ──────────────────────────────────────────────

describe('kitchenhub listShipments (GET /v2/deliveries/)', () => {
  const deliveries = Array.from({ length: N }, (_, i) => ({
    ...documentedDelivery(),
    delivery_id: `d${i}`,
  }))
  const fake = (path: string, params: Params) => {
    if (path === 'deliveries/') {
      noParams(path, params)
      return { deliveries }
    }
    const m = /^deliveries\/([^/]+)\/$/.exec(path)
    if (m) return deliveries.find((d) => d.delivery_id === m[1])
    throw new Error(`unexpected path ${path}`)
  }

  it('sends GET deliveries/ with no parameters', async () => {
    const { calls } = install(fake)
    await adapter().listShipments(CREDS, { page: 1, limit: L })
    expect(calls).toEqual([{ path: 'deliveries/', params: {} }])
  })

  it('walks N = 2L+1 deliveries: every id once, hasMore exact', async () => {
    install(fake)
    const { seen, hasMore } = await walk((p) => adapter().listShipments(CREDS, p), L, 3)
    expect(seen).toEqual(deliveries.map((d) => d.delivery_id))
    expect(hasMore).toEqual([true, true, false])
  })

  it('getShipment reads GET deliveries/{delivery_id}/ and parses with ShipmentSchema', async () => {
    const { calls } = install(fake)
    const s = await adapter().getShipment(CREDS, 'd5')
    expect(calls).toEqual([{ path: 'deliveries/d5/', params: {} }])
    expect(ShipmentSchema.parse(s).id).toBe('d5')
  })
})

// ── listOrders / getOrder ────────────────────────────────────────────────────

/**
 * A fake GET /v2/orders/: `page` is the only parameter ("1 by default"), the
 * body is a bare array, and a page past the end is empty. `sizes` sets how
 * many rows each upstream page holds, so pages can be uneven.
 */
function ordersFake(sizes: number[]) {
  const pages: ReturnType<typeof documentedOrder>[][] = []
  let n = 0
  for (const size of sizes) {
    pages.push(
      Array.from({ length: size }, () => {
        const o = documentedOrder()
        o.order.id = 1000 + n++
        return o
      }),
    )
  }
  const handler = (path: string, params: Params) => {
    const m = /^orders\/([^/]+)\/$/.exec(path)
    if (m) return pages.flat().find((o) => String(o.order.id) === m[1])
    if (path !== 'orders/') throw new Error(`unexpected path ${path}`)
    const extra = Object.keys(params).filter((k) => k !== 'page')
    if (extra.length) throw new Error(`undocumented params sent: ${extra.join(', ')}`)
    const page = params.page === undefined ? 1 : Number(params.page)
    return pages[page - 1] ?? []
  }
  return { handler, ids: pages.flat().map((o) => String(o.order.id)) }
}

describe('kitchenhub listOrders (GET /v2/orders/?page)', () => {
  const list = (p: QueryParams) => adapter().listOrders(CREDS, p)

  it('sends only the documented page parameter, starting at 1', async () => {
    const { handler } = ordersFake([4, 3])
    const { calls } = install(handler)
    await list({ page: 1, limit: L })
    expect(calls[0]).toEqual({ path: 'orders/', params: { page: 1 } })
  })

  it('walks N = 2L+1 orders over uneven upstream pages: every id once, hasMore exact', async () => {
    const { handler, ids } = ordersFake([4, 1, 2])
    expect(ids).toHaveLength(N)
    const { calls } = install(handler)
    const { seen, hasMore } = await walk(list, L, 3)
    expect(seen).toEqual(ids)
    expect(hasMore).toEqual([true, true, false])
    // Upstream pages 1..3 once each, plus the empty page 4 that ends the list.
    expect(calls.map((c) => c.params.page)).toEqual([1, 2, 3, 4])
  })

  it('reports hasMore false once an empty upstream page ends the list', async () => {
    const { handler } = ordersFake([2])
    install(handler)
    const params = withPageSink({ page: 1, limit: L })
    const rows = await list(params)
    expect(rows.map((r) => r.id)).toEqual(['1000', '1001'])
    expect(readUpstreamPage(params)).toEqual(expect.objectContaining({ hasMore: false }))
  })

  it('returns rows that parse with OrderSchema', async () => {
    const { handler } = ordersFake([2])
    install(handler)
    for (const r of await list({ page: 1, limit: L }))
      expect(() => OrderSchema.parse(r)).not.toThrow()
  })

  it('getOrder reads GET orders/{order_id}/', async () => {
    const { handler } = ordersFake([2])
    const { calls } = install(handler)
    const o = await adapter().getOrder(CREDS, '1001')
    expect(calls).toEqual([{ path: 'orders/1001/', params: {} }])
    expect(OrderSchema.parse(o).id).toBe('1001')
  })
})

// ── getTrackingEvents ────────────────────────────────────────────────────────

describe('kitchenhub getTrackingEvents', () => {
  it('refuses with 501 NOT_SUPPORTED and sends no request', async () => {
    const { calls } = install(() => {
      throw new Error('no request expected')
    })
    await expect(adapter().getTrackingEvents(CREDS, 'dsd-abc123')).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
    })
    expect(calls).toEqual([])
  })
})

// ── Response shape guard ─────────────────────────────────────────────────────

describe('kitchenhub list methods refuse an undocumented response shape', () => {
  // The Locations & Stores guide shows GET /stores as a bare array, against the
  // OpenAPI's { stores }. Reading either mismatch as [] would pass an empty,
  // complete collection to a locally paged sync, which then drops its cache.
  it.each([
    ['listWarehouses', { data: [documentedStore()] }],
    ['listWarehouses', [documentedStore()]],
    ['listShipments', { data: [documentedDelivery()] }],
    ['listShipments', [documentedDelivery()]],
    ['listCarriers', { providers: [documentedProvider()] }],
    ['listOrders', { orders: [documentedOrder()] }],
  ] as const)('%s throws 502 on %j instead of returning an empty list', async (method, body) => {
    install(() => body)
    await expect(adapter()[method](CREDS, { page: 1, limit: L })).rejects.toMatchObject({
      statusCode: 502,
      code: 'UPSTREAM_ERROR',
    })
  })

  it('getCarrier throws 502, not 404, when providers/ is not an array', async () => {
    install(() => ({ providers: [documentedProvider()] }))
    await expect(adapter().getCarrier(CREDS, 'doordash')).rejects.toMatchObject({
      statusCode: 502,
    })
  })
})
