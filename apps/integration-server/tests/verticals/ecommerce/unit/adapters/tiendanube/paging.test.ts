/**
 * Tiendanube listLocations paging contract.
 *
 * `GET /{store_id}/locations` is documented as "Receive a list of all
 * Locations." with no parameter table, and its example response is a bare
 * array (https://tiendanube.github.io/api-documentation/resources/location).
 * The sibling `GET /locations/{id}/inventory-levels` on the same page does
 * document `page`/`per_page`, so their absence here is deliberate. The adapter
 * must fetch the whole list once and window it locally (pageLocally), so each
 * location is served once at the caller's page size.
 *
 * The fake upstream below honours only what the docs describe: it ignores
 * every query parameter and returns every location.
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
import { TiendanubeAdapter } from '../../../../../../src/verticals/ecommerce/adapters/tiendanube/index'
import type { EcommerceAdapter } from '../../../../../../src/verticals/ecommerce/adapter/interface'

const CREDS = { accessToken: 'tok', storeId: '12345' } as never

interface Call {
  path: string
  params: Record<string, unknown> | undefined
}

function fakeLocations(count: number): { calls: Call[]; ids: string[] } {
  const ids = Array.from(
    { length: count },
    (_, i) => `01HTMFDH09VC6E2Q8KGTGP${String(i).padStart(4, '0')}`,
  )
  const calls: Call[] = []
  const get = vi.fn(async (path: string, cfg?: { params?: Record<string, unknown> }) => {
    calls.push({ path, params: cfg?.params })
    // Documented: no parameters, a bare array of every location.
    if (path === 'locations') {
      return {
        data: ids.map((id, i) => ({
          id,
          name: { es_AR: `Deposito ${i}` },
          store_id: '12345',
          priority: i,
          is_default: i === 0,
        })),
        headers: {},
      }
    }
    throw new Error(`unexpected path in test: ${path}`)
  })
  vi.spyOn(axios, 'create').mockReturnValue({ get, defaults: {} } as never)
  return { calls, ids }
}

const newAdapter = (): EcommerceAdapter =>
  new TiendanubeAdapter({ clientId: 'cid', clientSecret: 'secret' })

afterEach(() => {
  vi.restoreAllMocks()
})

describe('Tiendanube listLocations paging', () => {
  it('serves 2L+1 locations once each, in order, across pages 1..3 with exact hasMore', async () => {
    const L = 4
    const { ids } = fakeLocations(2 * L + 1)
    const adapter = newAdapter()
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
    const { calls, ids } = fakeLocations(2 * L + 1)
    const adapter = newAdapter()
    const params = withPageSink({ page: 2, limit: L } as QueryParams)
    const rows = await adapter.listLocations!(CREDS, params)
    // GET /locations documents no page/per_page keys: the page is cut
    // locally, so the request carries none.
    expect(calls).toEqual([{ path: 'locations', params: undefined }])
    expect(rows.map((l) => l.id)).toEqual(ids.slice(L, 2 * L))
    expect(readUpstreamPage(params)).toMatchObject({
      pagedLocally: true,
      totalCount: 2 * L + 1,
      hasMore: true,
    })
  })

  it('a limit above the maximum is clamped and still serves every row', async () => {
    const N = 2 * MAX_PAGE_LIMIT + 1
    const { ids } = fakeLocations(N)
    const adapter = newAdapter()
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
    const { ids } = fakeLocations(5)
    const adapter = newAdapter()

    const p1 = parseListQuery({ limit: '2', page: '1' }, adapter)
    const r1 = listPage(await adapter.listLocations!(CREDS, p1), p1, 'tiendanube')
    expect(r1.data.map((l) => l.id)).toEqual(ids.slice(0, 2))
    expect(r1.meta.hasMore).toBe(true)
    expect(r1.meta.totalCount).toBe(5)

    const p3 = parseListQuery({ limit: '2', page: '3' }, adapter)
    const r3 = listPage(await adapter.listLocations!(CREDS, p3), p3, 'tiendanube')
    expect(r3.data.map((l) => l.id)).toEqual(ids.slice(4))
    expect(r3.meta.hasMore).toBe(false)
  })
})
