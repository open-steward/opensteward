/**
 * MyCashflow stock locations: request shape and paging.
 *
 * MyCashflow's OpenAPI spec (embedded in https://support.mycashflow.com/api/):
 *
 *   "/v1/stock-locations":{"get":{"summary":"Retrieve a list of stock locations",
 *   "operationId":"indexStockLocations", ...}}
 *
 * The operation declares no parameters, and its `Stock Locations Response`
 * is `{ data: Stock Location[] }` with no `meta`: every location in one
 * response. The fake honours no parameter and returns the whole collection,
 * so the adapter must slice it itself (pageLocally).
 *
 * `GET /v1/stock-locations/{locationCode}` (getStockLocation) reads one.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { withPageSink, readUpstreamPage } from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import { MycashflowAdapter } from '../../../../../../src/verticals/ecommerce/adapters/mycashflow/index'

const CREDS: Credentials = {
  accessToken: '',
  extra: { storeName: 'myshop', username: 'api-user', password: 'secret' },
}

type Raw = Record<string, unknown>

interface Call {
  path: string
  params: unknown
}

const pad = (i: number): string => String(i + 1).padStart(4, '0')

function locations(n: number): Raw[] {
  return Array.from({ length: n }, (_, i) => ({
    created_at: '2013-06-19T20:41:47+03:00',
    updated_at: '2013-06-19T20:41:47+03:00',
    name: `Warehouse ${i}`,
    code: `loc-${pad(i)}`,
  }))
}

function fake(rows: Raw[]) {
  const calls: Call[] = []
  const creates: unknown[] = []
  const get = vi.fn(async (path: string, config?: { params?: unknown }) => {
    calls.push({ path, params: config?.params })
    if (path === 'stock-locations') return { data: { data: rows } }
    const m = /^stock-locations\/([^/]+)$/.exec(path)
    if (m) {
      const row = rows.find((r) => r['code'] === decodeURIComponent(m[1]!))
      if (!row) throw Object.assign(new Error('404'), { response: { status: 404 } })
      return { data: { data: row } }
    }
    throw Object.assign(new Error(`404 unexpected path ${path}`), { response: { status: 404 } })
  })
  vi.spyOn(axios, 'create').mockImplementation(((cfg: unknown) => {
    creates.push(cfg)
    return { get, defaults: {} }
  }) as never)
  return { calls, creates }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('MycashflowAdapter.listLocations', () => {
  it('calls GET /v1/stock-locations on the store host with no query parameters', async () => {
    const { calls, creates } = fake(locations(3))
    const adapter = new MycashflowAdapter()
    await adapter.listLocations(CREDS, { page: 1, limit: 10 })
    expect(calls).toHaveLength(1)
    expect(calls[0]!.path).toBe('stock-locations')
    expect(calls[0]!.params).toBeUndefined()
    expect((creates[0] as { baseURL: string }).baseURL).toBe('https://myshop.mycashflow.fi/api/v1')
  })

  it('maps each documented location, keyed by its code', async () => {
    fake(locations(2))
    const out = await new MycashflowAdapter().listLocations(CREDS, { page: 1, limit: 10 })
    expect(out.map((l) => l.id)).toEqual(['loc-0001', 'loc-0002'])
    expect(out.map((l) => l.name)).toEqual(['Warehouse 0', 'Warehouse 1'])
  })

  it.each([1, 3, 7, 60])(
    'walks 2L+1 locations at limit %i: every id once, hasMore exact',
    async (L) => {
      const n = 2 * L + 1
      const rows = locations(n)
      fake(rows)
      const adapter = new MycashflowAdapter()
      const seen: string[] = []
      for (let page = 1; page <= 3; page++) {
        const params: QueryParams = withPageSink({ page, limit: L })
        const out = await adapter.listLocations(CREDS, params)
        const report = readUpstreamPage(params)
        seen.push(...out.map((l) => l.id))
        expect(out).toHaveLength(page < 3 ? L : 1)
        expect(report?.hasMore).toBe(page < 3)
        expect(report?.totalCount).toBe(n)
      }
      expect(seen).toEqual(rows.map((r) => r['code']))
      expect(new Set(seen).size).toBe(n)
    },
  )
})

describe('MycashflowAdapter.getLocation', () => {
  it('reads GET /v1/stock-locations/{locationCode} and returns that location', async () => {
    const { calls } = fake(locations(3))
    const loc = await new MycashflowAdapter().getLocation(CREDS, 'loc-0002')
    expect(calls.map((c) => c.path)).toEqual(['stock-locations/loc-0002'])
    expect(loc.id).toBe('loc-0002')
    expect(loc.name).toBe('Warehouse 1')
  })

  it('URL-encodes the code into one path segment', async () => {
    const { calls } = fake([{ name: 'Odd', code: 'hki 1/b?c#d' }])
    const loc = await new MycashflowAdapter().getLocation(CREDS, 'hki 1/b?c#d')
    expect(calls.map((c) => c.path)).toEqual(['stock-locations/hki%201%2Fb%3Fc%23d'])
    expect(loc.id).toBe('hki 1/b?c#d')
  })

  it('round-trips every id the list returns', async () => {
    fake(locations(4))
    const adapter = new MycashflowAdapter()
    const listed = await adapter.listLocations(CREDS, { page: 1, limit: 10 })
    for (const l of listed) {
      expect((await adapter.getLocation(CREDS, l.id)).id).toBe(l.id)
    }
  })
})
