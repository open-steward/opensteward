/**
 * PlentyONE listLocations paging contract.
 *
 * `GET /rest/stockmanagement/warehouses` ("List warehouses") declares only the
 * query params `with` and `sortingOrder` — no `page`, no `itemsPerPage` — and
 * its 200 response is a plain `Collection`, not the `{ page, isLastPage,
 * entries }` envelope that paginated siblings declare
 * (https://developers.plentymarkets.com/rest-api/openApiV2WithExamples.min.json).
 * Every call returns every warehouse, so the adapter must window that whole
 * list locally (pageLocally).
 *
 * The fake upstream honours only what the spec documents: it ignores every
 * other query parameter and returns every warehouse as a bare array.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { withPageSink, readUpstreamPage, parseListQuery, listPage } from '@opensteward/shared'
import type { QueryParams } from '@opensteward/shared'
import { PlentyoneAdapter } from '../../../../../../src/verticals/ecommerce/adapters/plentyone/index'
import { MAX_PAGE_SIZE } from '../../../../../../src/verticals/ecommerce/adapters/plentyone/constants'

const CREDS = { accessToken: 'plenty-token', extra: { plentyId: '54321' } }

interface Call {
  path: string
  params: Record<string, unknown>
}

function fakeWarehouses(
  count: number,
  shape: 'array' | 'envelope' = 'array',
): { calls: Call[]; ids: string[] } {
  const ids = Array.from({ length: count }, (_, i) => String(i + 1))
  const calls: Call[] = []
  const get = vi.fn(async (path: string, cfg?: { params?: Record<string, unknown> }) => {
    calls.push({ path, params: cfg?.params ?? {} })
    if (path === '/stockmanagement/warehouses') {
      // Documented: no paging params; every warehouse on every call. Without
      // `sortingOrder[id]=asc` the "natural order" is unspecified, so the
      // fake flips it on every other call to expose unstable windows.
      const sorted = cfg?.params?.['sortingOrder[id]'] === 'asc'
      const ordered = sorted || calls.length % 2 === 1 ? ids : [...ids].reverse()
      const rows = ordered.map((id) => ({ id: Number(id), name: `Warehouse ${id}`, typeId: 1 }))
      return { data: shape === 'array' ? rows : { entries: rows } }
    }
    throw new Error(`unexpected path in test: ${path}`)
  })
  vi.spyOn(axios, 'create').mockReturnValue({ get, defaults: {} } as never)
  return { calls, ids }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('PlentyONE listLocations paging', () => {
  it('serves 2L+1 warehouses once each, in order, across pages 1..3 with exact hasMore', async () => {
    const L = 4
    const { ids } = fakeWarehouses(2 * L + 1)
    const adapter = new PlentyoneAdapter()
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

  it('page 2 sends no undocumented paging keys and reports pagedLocally', async () => {
    const L = 3
    const { calls, ids } = fakeWarehouses(2 * L + 1)
    const adapter = new PlentyoneAdapter()
    const params = withPageSink({ page: 2, limit: L } as QueryParams)
    const rows = await adapter.listLocations!(CREDS, params)
    expect(rows.map((l) => l.id)).toEqual(ids.slice(L, 2 * L))
    // The endpoint documents no page/itemsPerPage: the page is cut locally.
    // Only the documented sortingOrder is sent, to pin the window order.
    expect(calls).toEqual([
      { path: '/stockmanagement/warehouses', params: { 'sortingOrder[id]': 'asc' } },
    ])
    expect(readUpstreamPage(params)).toMatchObject({
      pagedLocally: true,
      totalCount: 2 * L + 1,
      hasMore: true,
    })
  })

  it('a limit far above any page size serves every warehouse, not a 250-row clamp', async () => {
    const N = MAX_PAGE_SIZE + 1
    const { ids } = fakeWarehouses(N)
    const adapter = new PlentyoneAdapter()
    const params = withPageSink({ page: 1, limit: MAX_PAGE_SIZE * 5 } as QueryParams)
    const rows = await adapter.listLocations!(CREDS, params)
    expect(rows.map((l) => l.id)).toEqual(ids)
    expect(readUpstreamPage(params)).toMatchObject({ hasMore: false, totalCount: N })
  })

  it('also reads an entries envelope, should the Collection come back wrapped', async () => {
    const { ids } = fakeWarehouses(5, 'envelope')
    const adapter = new PlentyoneAdapter()
    const params = withPageSink({ page: 2, limit: 2 } as QueryParams)
    const rows = await adapter.listLocations!(CREDS, params)
    expect(rows.map((l) => l.id)).toEqual(ids.slice(2, 4))
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
  })

  it('API path: parseListQuery then listPage gives the right meta.hasMore', async () => {
    const { ids } = fakeWarehouses(5)
    const adapter = new PlentyoneAdapter()

    const p1 = parseListQuery({ limit: '2', page: '1' })
    const r1 = listPage(await adapter.listLocations!(CREDS, p1), p1, 'plentyone')
    expect(r1.data.map((l) => l.id)).toEqual(ids.slice(0, 2))
    expect(r1.meta.hasMore).toBe(true)

    const p3 = parseListQuery({ limit: '2', page: '3' })
    const r3 = listPage(await adapter.listLocations!(CREDS, p3), p3, 'plentyone')
    expect(r3.data.map((l) => l.id)).toEqual(ids.slice(4))
    expect(r3.meta.hasMore).toBe(false)
  })
})
