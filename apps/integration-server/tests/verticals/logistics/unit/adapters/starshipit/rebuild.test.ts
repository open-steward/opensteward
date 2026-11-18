/**
 * Starshipit rebuild: listOrders / getOrder onto the documented GET /api/orders,
 * and listLabels / getLabel / listCarriers refused (no documented endpoint).
 *
 * First-party docs: https://api-docs.starshipit.com/ (Postman collection
 * https://api-docs.starshipit.com/api/collections/7606649/TVRg69NS), "Get Order(s)":
 *   "If neither order_id or order_number is provided, this endpoint can be
 *    used to return multiple orders that match the criteria."
 *   order_id:    "The unique numeric identifier for the order"
 *   status:      "The order status to filter orders for (default: unshipped)"
 *                accepted values "Unshipped, Shipped, Printed"
 *   page_number: "Page number to return (default: 1)"
 *   page_size:   "Number of results to return (default: 500, maximum: 500)"
 * Multi-order example: { page_number, page_size, total_pages, total_records,
 * data: { orders: [...] } }; by-id example: { order: {...}, success: true }.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import axios from 'axios'
import {
  _resetRowPager,
  listPage,
  parseListQuery,
  readUpstreamPage,
  withPageSink,
  type QueryParams,
} from '@opensteward/shared'
import { StarshipitAdapter } from '../../../../../../src/verticals/logistics/adapters/starshipit/index'
import { OrderSchema } from '../../../../../../src/verticals/logistics/schema/order'

const CREDS = { accessToken: 'ssit_api_key', refreshToken: 'ssit_sub_key' }
const MAX = 500
const DOCUMENTED = new Set([
  'order_id',
  'order_number',
  'status',
  'filter',
  'include',
  'sort_column',
  'sort_direction',
  'page_number',
  'page_size',
])

type Row = { order_id: number; order_status: string; order_number: string; order_date: string }

/**
 * A fake GET /api/orders honouring only the documented params: `status`
 * defaults to Unshipped, `page_number` to 1, `page_size` to 500 (max 500).
 */
function fakeOrders(counts: { Unshipped: number; Printed: number; Shipped: number }) {
  const log: Array<Record<string, unknown>> = []
  let next = 1
  const byStatus: Record<string, Row[]> = {}
  for (const status of ['Unshipped', 'Printed', 'Shipped'] as const) {
    byStatus[status] = Array.from({ length: counts[status] }, () => {
      const id = next++
      return {
        order_id: id,
        order_status: status,
        order_number: `N${id}`,
        order_date: '2025-07-08T23:29:42.3545569',
      }
    })
  }
  const byId = new Map(Object.values(byStatus).flatMap((rows) => rows.map((r) => [r.order_id, r])))
  const get = vi.fn(async (path: string, cfg?: { params?: Record<string, unknown> }) => {
    const params = Object.fromEntries(
      Object.entries(cfg?.params ?? {}).filter(([, v]) => v !== undefined),
    )
    log.push(params)
    if (path !== 'orders') throw new Error(`unexpected path ${path}`)
    const bad = Object.keys(params).filter((k) => !DOCUMENTED.has(k))
    if (bad.length) throw new Error(`400: undocumented params ${bad.join(',')}`)
    if (params.order_id !== undefined) {
      const hit = byId.get(Number(params.order_id))
      return {
        data: hit
          ? {
              order: {
                order_id: hit.order_id,
                order_number: hit.order_number,
                order_date: '2020-04-29T22:46:59.7155669Z',
                status: hit.order_status,
              },
              success: true,
            }
          : { success: false, errors: [{ message: 'Order not found' }] },
      }
    }
    const status = String(params.status ?? 'Unshipped')
    const size = params.page_size === undefined ? MAX : Number(params.page_size)
    if (!(Number.isInteger(size) && size >= 1 && size <= MAX)) throw new Error(`400: page_size`)
    const pn = params.page_number === undefined ? 1 : Number(params.page_number)
    if (!(Number.isInteger(pn) && pn >= 1)) throw new Error(`400: page_number`)
    const rows = byStatus[status] ?? []
    return {
      data: {
        page_number: pn,
        page_size: size,
        total_pages: Math.ceil(rows.length / size),
        total_records: rows.length,
        data: { orders: rows.slice((pn - 1) * size, pn * size) },
        succeeded: true,
      },
    }
  })
  vi.spyOn(axios, 'create').mockImplementation((() => ({
    get,
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  })) as never)
  return { get, log, total: next - 1 }
}

const ids = (n: number) => Array.from({ length: n }, (_, i) => String(i + 1))

beforeEach(() => _resetRowPager())
afterEach(() => vi.restoreAllMocks())

describe('starshipit listOrders (GET /api/orders, status × page_number/page_size)', () => {
  it('walks 2L+1 rows across the three documented statuses: every id once, hasMore exact', async () => {
    const L = 3
    // Uneven upstream pages: Unshipped 4 rows (pages of 3 and 1), Printed 0, Shipped 3.
    const { total } = fakeOrders({ Unshipped: 4, Printed: 0, Shipped: 2 * L + 1 - 4 })
    expect(total).toBe(2 * L + 1)
    const adapter = new StarshipitAdapter()
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      const rows = await adapter.listOrders(CREDS, params)
      rows.forEach((r) => OrderSchema.parse(r))
      seen.push(...rows.map((r) => String(r.id)))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(ids(2 * L + 1))
    expect(more).toEqual([true, true, false])
  })

  it('sends the documented status, page_number and page_size, never limit or updated_after', async () => {
    const { log } = fakeOrders({ Unshipped: 2, Printed: 2, Shipped: 2 })
    const params = withPageSink({ page: 1, limit: 10, updatedAfter: new Date('2024-01-01') })
    const rows = await new StarshipitAdapter().listOrders(CREDS, params)
    expect(rows).toHaveLength(6)
    expect(log).toEqual([
      { status: 'Unshipped', page_number: 1, page_size: 10 },
      { status: 'Printed', page_number: 1, page_size: 10 },
      { status: 'Shipped', page_number: 1, page_size: 10 },
    ])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('reaches shipped and printed orders, not only the default unshipped', async () => {
    fakeOrders({ Unshipped: 1, Printed: 1, Shipped: 1 })
    const rows = await new StarshipitAdapter().listOrders(
      CREDS,
      withPageSink({ page: 1, limit: 5 }),
    )
    expect(rows.map((r) => r.status)).toEqual(['AWAITING_SHIPMENT', 'AWAITING_SHIPMENT', 'SHIPPED'])
  })

  it('follows page_number within a status to its total_pages', async () => {
    const { log } = fakeOrders({ Unshipped: 5, Printed: 0, Shipped: 0 })
    const rows = await new StarshipitAdapter().listOrders(
      CREDS,
      withPageSink({ page: 1, limit: 2 }),
    )
    expect(rows.map((r) => r.id)).toEqual(['1', '2'])
    const p3 = withPageSink({ page: 3, limit: 2 })
    const last = await new StarshipitAdapter().listOrders(CREDS, p3)
    expect(last.map((r) => r.id)).toEqual(['5'])
    expect(readUpstreamPage(p3)?.hasMore).toBe(false)
    expect(log.filter((p) => p.status === 'Unshipped').map((p) => p.page_number)).toContain(3)
  })

  it('clamps page_size to the documented maximum of 500', async () => {
    const { log } = fakeOrders({ Unshipped: MAX + 2, Printed: 0, Shipped: 0 })
    const params = withPageSink({ page: 1, limit: 800 })
    const rows = await new StarshipitAdapter().listOrders(CREDS, params)
    expect(log[0]).toEqual({ status: 'Unshipped', page_number: 1, page_size: MAX })
    expect(rows).toHaveLength(MAX + 2)
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('serves page 2 through the API path (parseListQuery → listPage)', async () => {
    fakeOrders({ Unshipped: 3, Printed: 3, Shipped: 3 })
    const params: QueryParams = withPageSink(parseListQuery({ page: '2', limit: '4' }))
    const rows = await new StarshipitAdapter().listOrders(CREDS, params)
    const env = listPage(rows, params, 'starshipit')
    expect(env.data.map((r) => String(r.id))).toEqual(['5', '6', '7', '8'])
    expect(env.meta).toMatchObject({ page: 2, limit: 4, hasMore: true })
  })

  it('refuses rows without the documented total_pages rather than guessing the end', async () => {
    const get = vi.fn(async () => ({
      data: { data: { orders: [{ order_id: 1, order_status: 'Unshipped' }] } },
    }))
    vi.spyOn(axios, 'create').mockImplementation((() => ({ get })) as never)
    await expect(
      new StarshipitAdapter().listOrders(CREDS, withPageSink({ page: 1, limit: 5 })),
    ).rejects.toThrow(/total_pages/)
  })
  it('takes an empty page as the end of its status, and moves to the next', async () => {
    const get = vi.fn(async () => ({ data: { data: { orders: [] } } }))
    vi.spyOn(axios, 'create').mockImplementation((() => ({ get })) as never)
    const params = withPageSink({ page: 1, limit: 5 })
    expect(await new StarshipitAdapter().listOrders(CREDS, params)).toEqual([])
    expect(get.mock.calls.map((c) => (c as unknown[])[1])).toEqual([
      { params: { status: 'Unshipped', page_number: 1, page_size: 5 } },
      { params: { status: 'Printed', page_number: 1, page_size: 5 } },
      { params: { status: 'Shipped', page_number: 1, page_size: 5 } },
    ])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('serves the right rows when one connection changes its limit between walks', async () => {
    // A cursor saved at page_size 2 means a different row offset at page_size 3,
    // so the pager key must carry the upstream page size.
    fakeOrders({ Unshipped: 9, Printed: 0, Shipped: 0 })
    const adapter = new StarshipitAdapter()
    for (const page of [1, 2, 3]) {
      await adapter.listOrders(CREDS, withPageSink({ page, limit: 2 }))
    }
    const rows = await adapter.listOrders(CREDS, withPageSink({ page: 2, limit: 3 }))
    expect(rows.map((r) => String(r.id))).toEqual(['4', '5', '6'])
  })

  it('never serves one connection the cursors another connection cached', async () => {
    const adapter = new StarshipitAdapter()
    // Connection A: all nine orders unshipped. Walk it so its cursors are cached.
    fakeOrders({ Unshipped: 9, Printed: 0, Shipped: 0 })
    for (const page of [1, 2, 3]) {
      await adapter.listOrders(CREDS, withPageSink({ page, limit: 3 }))
    }
    // Connection B (another API key): its orders are split across statuses.
    const other = { accessToken: 'other_api_key', refreshToken: 'ssit_sub_key' }
    const { log } = fakeOrders({ Unshipped: 1, Printed: 1, Shipped: 7 })
    const rows = await adapter.listOrders(other, withPageSink({ page: 3, limit: 3 }))
    expect(rows.map((r) => String(r.id))).toEqual(['7', '8', '9'])
    // B's walk starts from its own first page, not from A's cached cursor.
    expect(log[0]).toEqual({ status: 'Unshipped', page_number: 1, page_size: 3 })
  })
})

describe('starshipit getOrder (GET /api/orders?order_id=)', () => {
  it('reads one order by the documented order_id param from `order`', async () => {
    const { log } = fakeOrders({ Unshipped: 0, Printed: 2, Shipped: 0 })
    const o = OrderSchema.parse(await new StarshipitAdapter().getOrder(CREDS, '2'))
    expect(log).toEqual([{ order_id: '2' }])
    expect(o.id).toBe('2')
    expect(o.status).toBe('AWAITING_SHIPMENT')
  })

  it('reads back an id that listOrders returned', async () => {
    fakeOrders({ Unshipped: 1, Printed: 1, Shipped: 1 })
    const adapter = new StarshipitAdapter()
    const [, , third] = await adapter.listOrders(CREDS, withPageSink({ page: 1, limit: 3 }))
    expect((await adapter.getOrder(CREDS, String(third!.id))).id).toBe(third!.id)
  })

  it('404s when the response carries no order', async () => {
    fakeOrders({ Unshipped: 0, Printed: 0, Shipped: 0 })
    await expect(new StarshipitAdapter().getOrder(CREDS, '99')).rejects.toMatchObject({
      statusCode: 404,
    })
  })
})

describe('starshipit methods with no documented endpoint refuse before sending', () => {
  const cases: Array<[string, (a: StarshipitAdapter) => Promise<unknown>]> = [
    ['listLabels', (a) => a.listLabels(CREDS, { page: 1, limit: 5 })],
    ['getLabel', (a) => a.getLabel(CREDS, '1')],
    ['listCarriers', (a) => a.listCarriers(CREDS, { page: 1, limit: 5 })],
  ]
  it.each(cases)('%s throws 501 NOT_SUPPORTED and sends no request', async (_name, call) => {
    const { get } = fakeOrders({ Unshipped: 1, Printed: 0, Shipped: 0 })
    const create = vi.mocked(axios.create)
    create.mockClear()
    await expect(call(new StarshipitAdapter())).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
    })
    expect(get).not.toHaveBeenCalled()
    expect(create).not.toHaveBeenCalled()
  })
})
