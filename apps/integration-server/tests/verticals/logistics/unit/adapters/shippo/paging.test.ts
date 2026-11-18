/**
 * Shippo list paging. Every list method sent only `results`, never `page`, so
 * page 2 repeated page 1 and nothing past the first page could be reached.
 *
 * First-party spec: https://docs.goshippo.com/spec/shippoapi/public-api.yaml
 *
 *   GET /shipments, /orders, /transactions, /carrier_accounts and /manifests
 *   all take
 *     page:    "The page number you want to select" (default 1)
 *     results: "The number of results to return per page (max 100)"
 *              (/carrier_accounts and /manifests: "(max 100, default 5)")
 *   and answer a PaginatedList `{ next, previous, results }` whose `next` is
 *   the next page URL (example `baseurl?page=3&results=10`). The spec never
 *   says what `next` is on the last page; the fake answers null there, which
 *   is an assumption, not a quoted guarantee.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  declaredPageMax,
  listPage,
  parseListQuery,
  readUpstreamPage,
  withPageSink,
  type QueryParams,
} from '@opensteward/shared'

const { getMock } = vi.hoisted(() => ({ getMock: vi.fn() }))

vi.mock('../../../../../../src/verticals/logistics/adapters/shippo/client', () => ({
  ShippoClient: class {
    get = (path: string, params?: Record<string, unknown>) => getMock(path, params)
    post = () => {
      throw new Error('unexpected POST')
    }
  },
}))

import { ShippoAdapter } from '../../../../../../src/verticals/logistics/adapters/shippo'
import type { Credentials } from '../../../../../../src/verticals/logistics/adapter/interface'

const CREDS = { accessToken: 'shippo_test_key' } as Credentials
const L = 5
const N = 2 * L + 1
const SHIPPO_MAX = 100
const CALL_BUDGET = 400

const clean = (params?: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(params ?? {}).filter(([, v]) => v !== undefined))

interface Paged {
  name: string
  path: string
  allowed: Set<string>
  defaultResults: number
  call: (a: ShippoAdapter, p: QueryParams) => Promise<Array<{ id?: string }>>
}

const DATE_KEYS = [
  'object_created_gt',
  'object_created_gte',
  'object_created_lt',
  'object_created_lte',
]

const PAGED: Paged[] = [
  {
    name: 'listShipments',
    path: 'shipments',
    allowed: new Set(['page_token', 'page', 'results', ...DATE_KEYS]),
    defaultResults: 25,
    call: (a, p) => a.listShipments(CREDS, p),
  },
  {
    name: 'listOrders',
    path: 'orders',
    allowed: new Set(['page', 'results', 'order_status[]', 'shop_app', 'start_date', 'end_date']),
    defaultResults: 25,
    call: (a, p) => a.listOrders(CREDS, p),
  },
  {
    name: 'listLabels',
    path: 'transactions',
    allowed: new Set(['rate', 'object_status', 'tracking_status', 'page', 'results', ...DATE_KEYS]),
    defaultResults: 25,
    call: (a, p) => a.listLabels(CREDS, p),
  },
  {
    name: 'listCarriers',
    path: 'carrier_accounts',
    allowed: new Set(['service_levels', 'carrier', 'account_id', 'page', 'results']),
    defaultResults: 5,
    call: (a, p) => a.listCarriers(CREDS, p),
  },
  {
    name: 'listManifests',
    path: 'manifests',
    allowed: new Set(['page', 'results']),
    defaultResults: 5,
    call: (a, p) => a.listManifests(CREDS, p),
  },
]

/** A Shippo list honouring ONLY the documented `page` and `results` (max 100). */
function fakePaged(m: Paged, total: number) {
  let calls = 0
  const ids = Array.from({ length: total }, (_, i) => `${m.path}-${i + 1}`)
  const rows = ids.map((object_id) => ({ object_id }))
  getMock.mockImplementation(async (path: string, params?: Record<string, unknown>) => {
    if (++calls > CALL_BUDGET) throw new Error('call budget exceeded')
    if (path !== m.path) throw new Error(`404: ${path}`)
    const q = clean(params)
    const bad = Object.keys(q).filter((k) => !m.allowed.has(k))
    if (bad.length) throw new Error(`400: ${path} undocumented params ${bad.join(',')}`)
    const page = q.page === undefined ? 1 : Number(q.page)
    const size = q.results === undefined ? m.defaultResults : Number(q.results)
    if (!(Number.isInteger(page) && page >= 1)) throw new Error(`400: page ${page}`)
    if (!(Number.isInteger(size) && size >= 1 && size <= SHIPPO_MAX)) {
      throw new Error(`400: results ${size}`)
    }
    const start = (page - 1) * size
    const more = start + size < rows.length
    return {
      next: more ? `https://api.goshippo.com/${path}/?page=${page + 1}&results=${size}` : null,
      previous:
        page > 1 ? `https://api.goshippo.com/${path}/?page=${page - 1}&results=${size}` : null,
      results: rows.slice(start, start + size),
    }
  })
  return ids
}

beforeEach(() => {
  getMock.mockReset()
})

describe('shippo capabilities', () => {
  it('declares the documented results maximum', () => {
    expect(declaredPageMax(new ShippoAdapter())).toBe(SHIPPO_MAX)
  })
})

describe.each(PAGED)('shippo $name paging', (m) => {
  it('serves every row once, in order, across pages 1..3 with exact hasMore', async () => {
    const expected = fakePaged(m, N)
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      const rows = await m.call(new ShippoAdapter(), params)
      seen.push(...rows.map((r) => r.id!))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(expected)
    expect(more).toEqual([true, true, false])
  })

  it('the page-2 request carries the documented page and results', async () => {
    fakePaged(m, N)
    await m.call(new ShippoAdapter(), withPageSink({ page: 2, limit: L }))
    expect(getMock).toHaveBeenCalledTimes(1)
    const [path, params] = getMock.mock.calls[0] as [string, Record<string, unknown>]
    expect(path).toBe(m.path)
    expect(clean(params)).toEqual({ page: 2, results: L })
  })

  it('a direct limit above the documented maximum is clamped and the size sent is reported', async () => {
    const expected = fakePaged(m, 250)
    const params = withPageSink({ page: 2, limit: 600 })
    const rows = await m.call(new ShippoAdapter(), params)
    const sent = (getMock.mock.calls[0] as [string, Record<string, unknown>])[1]
    expect(clean(sent)).toEqual({ page: 2, results: SHIPPO_MAX })
    expect(rows.map((r) => r.id)).toEqual(expected.slice(SHIPPO_MAX, 2 * SHIPPO_MAX))
    expect(readUpstreamPage(params)).toEqual(
      expect.objectContaining({ hasMore: true, pageSize: SHIPPO_MAX }),
    )
  })

  it('hasMore follows `next`, not a full page: an exact multiple ends on a full page', async () => {
    const expected = fakePaged(m, 2 * L)
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (const page of [1, 2]) {
      const params = withPageSink({ page, limit: L })
      const rows = await m.call(new ShippoAdapter(), params)
      expect(rows).toHaveLength(L)
      seen.push(...rows.map((r) => r.id!))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(expected)
    expect(more).toEqual([true, false])
  })

  it('with no page or limit it asks for page 1 at the adapter default of 25', async () => {
    fakePaged(m, N)
    const params = withPageSink({})
    await m.call(new ShippoAdapter(), params)
    const sent = (getMock.mock.calls[0] as [string, Record<string, unknown>])[1]
    expect(clean(sent)).toEqual({ page: 1, results: 25 })
    expect(readUpstreamPage(params)).toEqual(
      expect.objectContaining({ hasMore: false, pageSize: 25 }),
    )
  })

  it('the router caps the limit at the declared maximum', () => {
    const params = parseListQuery({ page: '1', limit: '100000' }, new ShippoAdapter())
    expect(params.limit).toBe(SHIPPO_MAX)
  })

  it('API path: parseListQuery -> adapter -> listPage serves page 2 with exact meta', async () => {
    const expected = fakePaged(m, N)
    const adapter = new ShippoAdapter()
    const params = parseListQuery({ page: '2', limit: String(L) }, adapter)
    const env = listPage(await m.call(adapter, params), params, 'shippo')
    expect(env.data.map((r) => r.id)).toEqual(expected.slice(L, 2 * L))
    expect(env.meta).toEqual(expect.objectContaining({ page: 2, limit: L, hasMore: true }))
  })
})
