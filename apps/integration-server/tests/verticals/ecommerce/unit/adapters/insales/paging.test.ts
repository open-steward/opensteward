/**
 * InSales listLocations paging contract.
 *
 * `GET /admin/warehouses.json` documents no parameters at all
 * (https://api.insales.ru/, "Get warehouses list") and its example response
 * is a bare array of every warehouse: no envelope, no next signal. The
 * adapter must fetch the whole list once and window it locally
 * (pageLocally), so each warehouse is served once at the caller's page size.
 *
 * The fake upstream below honours only what the docs describe: it ignores
 * every query parameter and returns every warehouse.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import {
  withPageSink,
  readUpstreamPage,
  parseListQuery,
  listPage,
  MAX_PAGE_LIMIT,
} from '@opensteward/shared'
import type { QueryParams } from '@opensteward/shared'
import { InsalesAdapter } from '../../../../../../src/verticals/ecommerce/adapters/insales/index'
import type { EcommerceAdapter } from '../../../../../../src/verticals/ecommerce/adapter/interface'

const CREDS = { accessToken: 'api-id', extra: { apiSecret: 'api-secret', shop: 'myshop' } }

interface Call {
  path: string
  params: Record<string, unknown> | undefined
}

function fakeWarehouses(count: number): { calls: Call[]; ids: string[] } {
  const ids = Array.from({ length: count }, (_, i) => String(1000 + i))
  const calls: Call[] = []
  const get = vi.fn(async (path: string, cfg?: { params?: Record<string, unknown> }) => {
    calls.push({ path, params: cfg?.params })
    // Documented: no parameters, a bare array of every warehouse.
    if (path === '/warehouses.json') {
      return { data: ids.map((id) => ({ id: Number(id), title: `WH ${id}`, active: true })) }
    }
    throw new Error(`unexpected path in test: ${path}`)
  })
  vi.spyOn(axios, 'create').mockReturnValue({ get, defaults: {} } as never)
  return { calls, ids }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('InSales listLocations paging', () => {
  it('serves 2L+1 warehouses once each, in order, across pages 1..3 with exact hasMore', async () => {
    const L = 4
    const { ids } = fakeWarehouses(2 * L + 1)
    const adapter = new InsalesAdapter()
    const seen: string[] = []
    const hasMore: (boolean | undefined)[] = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L } as QueryParams)
      const rows = await adapter.listLocations!(CREDS, params)
      seen.push(...rows.map((l) => l.id))
      hasMore.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(ids)
    expect(hasMore).toEqual([true, true, false])
  })

  it('page 2 sends the documented request (no params) and reports pagedLocally', async () => {
    const L = 3
    const { calls, ids } = fakeWarehouses(2 * L + 1)
    const adapter = new InsalesAdapter()
    const params = withPageSink({ page: 2, limit: L } as QueryParams)
    const rows = await adapter.listLocations!(CREDS, params)
    // warehouses.json documents no page/per_page keys: the page is cut
    // locally, so the request carries none.
    expect(calls).toEqual([{ path: '/warehouses.json', params: undefined }])
    expect(rows.map((l) => l.id)).toEqual(ids.slice(L, 2 * L))
    expect(readUpstreamPage(params)).toMatchObject({
      pagedLocally: true,
      totalCount: 2 * L + 1,
      hasMore: true,
    })
  })

  it('the synthetic default location is served on page 1 only', async () => {
    fakeWarehouses(0)
    const adapter = new InsalesAdapter()
    const p1 = withPageSink({ page: 1, limit: 5 } as QueryParams)
    expect((await adapter.listLocations!(CREDS, p1)).map((l) => l.id)).toEqual(['default'])
    expect(readUpstreamPage(p1)).toMatchObject({ hasMore: false, totalCount: 1 })
    const p2 = withPageSink({ page: 2, limit: 5 } as QueryParams)
    expect(await adapter.listLocations!(CREDS, p2)).toEqual([])
  })

  it('when warehouses.json errors, the synthetic default is still paged locally', async () => {
    const get = vi.fn(async () => {
      throw Object.assign(new Error('Not Found'), { response: { status: 404 } })
    })
    vi.spyOn(axios, 'create').mockReturnValue({ get, defaults: {} } as never)
    const adapter = new InsalesAdapter()
    const p1 = withPageSink({ page: 1, limit: 5 } as QueryParams)
    expect((await adapter.listLocations!(CREDS, p1)).map((l) => l.id)).toEqual(['default'])
    expect(readUpstreamPage(p1)).toMatchObject({
      pagedLocally: true,
      hasMore: false,
      totalCount: 1,
    })
    const p2 = withPageSink({ page: 2, limit: 5 } as QueryParams)
    expect(await adapter.listLocations!(CREDS, p2)).toEqual([])
    expect(readUpstreamPage(p2)).toMatchObject({ hasMore: false })
  })

  it('a limit above the maximum is clamped and still serves every row', async () => {
    const N = 2 * MAX_PAGE_LIMIT + 1
    const { ids } = fakeWarehouses(N)
    const adapter: EcommerceAdapter = new InsalesAdapter()
    const seen: string[] = []
    let page = 1
    for (;;) {
      const params = parseListQuery(
        { limit: String(MAX_PAGE_LIMIT * 5), page: String(page) },
        adapter,
      )
      expect(params.limit).toBe(MAX_PAGE_LIMIT)
      const rows = await adapter.listLocations!(CREDS, params)
      expect(rows.length).toBeLessThanOrEqual(MAX_PAGE_LIMIT)
      seen.push(...rows.map((l) => l.id))
      if (!readUpstreamPage(params)?.hasMore) break
      page++
      expect(page).toBeLessThan(10)
    }
    expect(page).toBe(3)
    expect(seen).toEqual(ids)
  })

  it('API path: parseListQuery then listPage gives the right meta.hasMore', async () => {
    const { ids } = fakeWarehouses(5)
    // Typed as the router holds it, so parseListQuery reads its declared max.
    const adapter: EcommerceAdapter = new InsalesAdapter()

    const p1 = parseListQuery({ limit: '2', page: '1' }, adapter)
    const r1 = listPage(await adapter.listLocations!(CREDS, p1), p1, 'insales')
    expect(r1.data.map((l) => l.id)).toEqual(ids.slice(0, 2))
    expect(r1.meta.hasMore).toBe(true)

    const p3 = parseListQuery({ limit: '2', page: '3' }, adapter)
    const r3 = listPage(await adapter.listLocations!(CREDS, p3), p3, 'insales')
    expect(r3.data.map((l) => l.id)).toEqual(ids.slice(4))
    expect(r3.meta.hasMore).toBe(false)
  })
})
