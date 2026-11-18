/**
 * ShipMonk list paging. listWarehouses sent no paging params, so page 2
 * repeated page 1 and nothing past ShipMonk's default 50 rows was reachable.
 *
 * First-party spec (ShipMonk API v1.031),
 * https://apidocs.shipmonk.com/reference/get-v1-integrations-warehouses:
 *   page:     "1-based page number to return. Defaults to 1." (1..1000)
 *   pageSize: "Number of results per page." (minimum 1, maximum 1000, default 50)
 * and the response carries `paginator` = { total, pages, page }.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { listPage, parseListQuery, readUpstreamPage, withPageSink } from '@opensteward/shared'

const { getMock, ClientCtor } = vi.hoisted(() => {
  const getMock = vi.fn()
  const ClientCtor = vi.fn().mockImplementation(function ShipmonkClientMock() {
    return { get: getMock }
  })
  return { getMock, ClientCtor }
})

vi.mock('../../../../../../src/verticals/logistics/adapters/shipmonk/client', () => ({
  ShipmonkClient: ClientCtor,
}))

import { ShipmonkAdapter } from '../../../../../../src/verticals/logistics/adapters/shipmonk'
import type {
  Credentials,
  LogisticsAdapter,
} from '../../../../../../src/verticals/logistics/adapter/interface'

const CREDS = { accessToken: 'TEST_key' } as Credentials
const L = 5
const N = 2 * L + 1
const PAGE_SIZE_MAX = 1000
const PAGE_SIZE_DEFAULT = 50
const CALL_BUDGET = 40
const PATH = 'v1/integrations/warehouses'
const ALLOWED = new Set(['page', 'pageSize', 'sortBy', 'sortOrder'])

/**
 * A fake ShipMonk that honours ONLY the documented query params of
 * GET /v1/integrations/warehouses: `page` (default 1, 1..1000) and `pageSize`
 * (default 50, 1..1000), plus the sort params. Anything else is a 400.
 */
function fakeShipmonk(total: number) {
  let calls = 0
  const rows = Array.from({ length: total }, (_, i) => ({
    id: i + 1,
    identifier: `WH${i + 1}`,
    name: `Warehouse ${i + 1}`,
  }))
  getMock.mockImplementation(async (path: string, params?: Record<string, unknown>) => {
    if (++calls > CALL_BUDGET) throw new Error(`call budget (${CALL_BUDGET}) exceeded`)
    if (path !== PATH) throw new Error(`404: ${path}`)
    const q = Object.fromEntries(Object.entries(params ?? {}).filter(([, v]) => v !== undefined))
    const bad = Object.keys(q).filter((k) => !ALLOWED.has(k))
    if (bad.length) throw new Error(`400: undocumented params ${bad.join(',')}`)
    const page = q.page === undefined ? 1 : Number(q.page)
    const pageSize = q.pageSize === undefined ? PAGE_SIZE_DEFAULT : Number(q.pageSize)
    if (!(Number.isInteger(page) && page >= 1 && page <= 1000)) throw new Error(`400: page ${page}`)
    if (!(Number.isInteger(pageSize) && pageSize >= 1 && pageSize <= PAGE_SIZE_MAX)) {
      throw new Error(`400: pageSize ${pageSize}`)
    }
    const start = (page - 1) * pageSize
    return {
      status: 200,
      paginator: { total: rows.length, pages: Math.ceil(rows.length / pageSize), page },
      data: rows.slice(start, start + pageSize),
    }
  })
  return rows.map((r) => String(r.id))
}

beforeEach(() => {
  ClientCtor.mockClear()
  getMock.mockReset()
})

describe('shipmonk listWarehouses paging', () => {
  it('serves every row once, in order, across pages 1..3 with exact hasMore', async () => {
    const expected = fakeShipmonk(N)
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      const rows = await new ShipmonkAdapter().listWarehouses(CREDS, params)
      seen.push(...rows.map((r) => r.id!))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(expected)
    expect(more).toEqual([true, true, false])
  })

  it('the page-2 request carries the documented page and pageSize', async () => {
    fakeShipmonk(N)
    await new ShipmonkAdapter().listWarehouses(CREDS, withPageSink({ page: 2, limit: L }))
    expect(getMock).toHaveBeenCalledTimes(1)
    const [path, params] = getMock.mock.calls[0] as [string, Record<string, unknown>]
    expect(path).toBe(PATH)
    expect(params).toEqual({ page: 2, pageSize: L })
  })

  it('a limit above the documented maximum is clamped to pageSize 1000', async () => {
    const expected = fakeShipmonk(1200)
    const params = withPageSink({ page: 1, limit: 5000 })
    const rows = await new ShipmonkAdapter().listWarehouses(CREDS, params)
    const sent = (getMock.mock.calls[0] as [string, Record<string, unknown>])[1]
    expect(sent.pageSize).toBe(PAGE_SIZE_MAX)
    expect(rows.map((r) => r.id)).toEqual(expected.slice(0, PAGE_SIZE_MAX))
    expect(readUpstreamPage(params)).toEqual(
      expect.objectContaining({ hasMore: true, pageSize: PAGE_SIZE_MAX, totalCount: 1200 }),
    )
  })

  it('a call with no limit sends the documented default pageSize 50', async () => {
    fakeShipmonk(N)
    const params = withPageSink({ page: 1 })
    await new ShipmonkAdapter().listWarehouses(CREDS, params)
    const sent = (getMock.mock.calls[0] as [string, Record<string, unknown>])[1]
    expect(sent).toEqual({ page: 1, pageSize: PAGE_SIZE_DEFAULT })
    expect(readUpstreamPage(params)?.pageSize).toBe(PAGE_SIZE_DEFAULT)
  })

  it('API path: parseListQuery -> adapter -> listPage serves page 2 with exact meta', async () => {
    const expected = fakeShipmonk(N)
    // Typed as the router holds it: the logistics router passes a LogisticsAdapter.
    const adapter: LogisticsAdapter = new ShipmonkAdapter()
    const params = parseListQuery({ page: '2', limit: String(L) }, adapter)
    const env = listPage(await adapter.listWarehouses!(CREDS, params), params, 'shipmonk')
    expect(env.data.map((r) => r.id)).toEqual(expected.slice(L, 2 * L))
    expect(env.meta).toEqual(expect.objectContaining({ page: 2, limit: L, hasMore: true }))
  })
})
