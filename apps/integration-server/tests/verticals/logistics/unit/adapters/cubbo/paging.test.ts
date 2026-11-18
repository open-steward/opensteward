/**
 * Cubbo listOrders paging and the reads Cubbo's API cannot serve.
 *
 * First-party docs: the public Postman collection behind
 * https://developers.cubbo.com/ ("Get Orders"):
 *   "page (default 1) and per_page (default 10, max 100 — a larger value is
 *    silently clamped to 100). The response carries a meta object"
 * and the collection overview:
 *   "Detecting the last page: use next_page == null. Do not rely on last_page"
 * The documented 200 body is { "orders": [...], "meta": { "current_page",
 * "next_page", "prev_page", "total_pages", "first_page", "last_page",
 * "per_page", "total_count" } }.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { listPage, parseListQuery, readUpstreamPage, withPageSink } from '@opensteward/shared'

const { getMock, ClientCtor } = vi.hoisted(() => {
  const getMock = vi.fn()
  const ClientCtor = vi.fn().mockImplementation(function CubboClientMock() {
    return { get: getMock }
  })
  return { getMock, ClientCtor }
})

vi.mock('../../../../../../src/verticals/logistics/adapters/cubbo/client', () => ({
  CubboClient: ClientCtor,
}))

import { CubboAdapter } from '../../../../../../src/verticals/logistics/adapters/cubbo'
import type {
  Credentials,
  LogisticsAdapter,
} from '../../../../../../src/verticals/logistics/adapter/interface'
import { OrderSchema } from '../../../../../../src/verticals/logistics/schema/order'

const CREDS = { accessToken: 'TEST_token' } as Credentials
const L = 5
const N = 2 * L + 1
const MAX = 100
const DEFAULT = 10
const CALL_BUDGET = 40
/** The documented Get Orders query: store_id, shipping_email, per_page, page, sort, sort_by. */
const ALLOWED = new Set(['store_id', 'shipping_email', 'per_page', 'page', 'sort', 'sort_by'])

/**
 * A fake Cubbo that honours only the documented GET /orders query, silently
 * clamps per_page to 100 as documented, and answers with the documented
 * { orders, meta } envelope.
 */
function fakeCubbo(total: number) {
  let calls = 0
  const rows = Array.from({ length: total }, (_, i) => ({
    id: 1000 + i,
    store_id: 3,
    order_number: `ORD-${i + 1}`,
    status: 'pending',
    shipping_status: null,
    order_lines: [],
  }))
  getMock.mockImplementation(async (path: string, params?: Record<string, unknown>) => {
    if (++calls > CALL_BUDGET) throw new Error(`call budget (${CALL_BUDGET}) exceeded`)
    if (path !== 'orders') throw new Error(`404: ${path}`)
    const q = Object.fromEntries(Object.entries(params ?? {}).filter(([, v]) => v !== undefined))
    const bad = Object.keys(q).filter((k) => !ALLOWED.has(k))
    if (bad.length) throw new Error(`400: undocumented params ${bad.join(',')}`)
    const page = q.page === undefined ? 1 : Number(q.page)
    const perPage = Math.min(q.per_page === undefined ? DEFAULT : Number(q.per_page), MAX)
    const totalPages = Math.ceil(rows.length / perPage)
    return {
      orders: rows.slice((page - 1) * perPage, page * perPage),
      meta: {
        current_page: page,
        next_page: page < totalPages ? page + 1 : null,
        prev_page: page > 1 ? page - 1 : null,
        total_pages: totalPages,
        first_page: page === 1,
        last_page: page === totalPages,
        per_page: perPage,
        total_count: rows.length,
      },
    }
  })
  return rows.map((r) => String(r.id))
}

beforeEach(() => {
  ClientCtor.mockClear()
  getMock.mockReset()
})

describe('cubbo listOrders paging', () => {
  it('serves every order once, in order, across pages 1..3 with exact hasMore', async () => {
    const expected = fakeCubbo(N)
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      const rows = await new CubboAdapter().listOrders(CREDS, params)
      rows.forEach((r) => OrderSchema.parse(r))
      seen.push(...rows.map((r) => r.id!))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(expected)
    expect(new Set(seen).size).toBe(N)
    expect(more).toEqual([true, true, false])
  })

  it('the page-2 request carries only the documented page and per_page on GET orders', async () => {
    fakeCubbo(N)
    const params = withPageSink({ page: 2, limit: L, updatedAfter: new Date('2026-01-01') })
    await new CubboAdapter().listOrders(CREDS, params)
    expect(getMock).toHaveBeenCalledTimes(1)
    expect(getMock.mock.calls[0]).toEqual(['orders', { page: 2, per_page: L }])
    expect(readUpstreamPage(params)).toEqual(
      expect.objectContaining({ hasMore: true, totalCount: N, pageSize: L }),
    )
  })

  it('a limit above the documented maximum is clamped to per_page 100 and reported', async () => {
    const expected = fakeCubbo(250)
    const params = withPageSink({ page: 1, limit: 500 })
    const rows = await new CubboAdapter().listOrders(CREDS, params)
    expect((getMock.mock.calls[0] as [string, Record<string, unknown>])[1].per_page).toBe(MAX)
    expect(rows.map((r) => r.id)).toEqual(expected.slice(0, MAX))
    expect(readUpstreamPage(params)).toEqual(
      expect.objectContaining({ hasMore: true, pageSize: MAX, totalCount: 250 }),
    )
  })

  it('a call with no limit sends the documented default per_page 10', async () => {
    fakeCubbo(N)
    await new CubboAdapter().listOrders(CREDS, withPageSink({}))
    expect(getMock.mock.calls[0]).toEqual(['orders', { page: 1, per_page: DEFAULT }])
  })

  it('an empty result ends the collection on next_page == null', async () => {
    fakeCubbo(0)
    const params = withPageSink({ page: 1, limit: L })
    expect(await new CubboAdapter().listOrders(CREDS, params)).toEqual([])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('a response without the documented orders array throws instead of reading as empty', async () => {
    getMock.mockResolvedValue({ data: [] })
    await expect(
      new CubboAdapter().listOrders(CREDS, withPageSink({ page: 1, limit: L })),
    ).rejects.toThrow(/orders array/)
  })

  it('declares the documented per_page maximum, so the router asks for at most 100', async () => {
    const expected = fakeCubbo(250)
    const adapter: LogisticsAdapter = new CubboAdapter()
    const params = parseListQuery({ page: '1', limit: '500' }, adapter)
    expect(params.limit).toBe(MAX)
    const env = listPage(await adapter.listOrders!(CREDS, params), params, 'cubbo')
    expect(env.data.map((r) => r.id)).toEqual(expected.slice(0, MAX))
    expect(env.meta).toEqual(expect.objectContaining({ limit: MAX, hasMore: true }))
  })

  it('API path: parseListQuery -> adapter -> listPage serves page 2 with exact meta', async () => {
    const expected = fakeCubbo(N)
    const adapter: LogisticsAdapter = new CubboAdapter()
    const params = parseListQuery({ page: '2', limit: String(L) }, adapter)
    const env = listPage(await adapter.listOrders!(CREDS, params), params, 'cubbo')
    expect(env.data.map((r) => r.id)).toEqual(expected.slice(L, 2 * L))
    expect(env.meta).toEqual(expect.objectContaining({ page: 2, limit: L, hasMore: true }))
  })
})

describe('cubbo reads with no documented endpoint', () => {
  const adapter = new CubboAdapter()
  const cases: Array<[string, () => Promise<unknown>]> = [
    ['getOrder', () => adapter.getOrder(CREDS, '230')],
    ['listShipments', () => adapter.listShipments(CREDS, { page: 1, limit: L })],
    ['getShipment', () => adapter.getShipment(CREDS, 'x')],
    ['listTrackingEvents', () => adapter.listTrackingEvents(CREDS, { page: 1, limit: L })],
    ['getTrackingEvents', () => adapter.getTrackingEvents(CREDS, 'GETCUBBOCDMX9999999')],
    ['listWarehouses', () => adapter.listWarehouses(CREDS, { page: 1, limit: L })],
    ['getWarehouse', () => adapter.getWarehouse(CREDS, 'x')],
  ]
  it.each(cases)('%s refuses with 501 NOT_SUPPORTED and sends no request', async (_name, call) => {
    await expect(call()).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
      message: expect.stringMatching(/^Cubbo cannot /),
    })
    expect(ClientCtor).not.toHaveBeenCalled()
    expect(getMock).not.toHaveBeenCalled()
  })
})
