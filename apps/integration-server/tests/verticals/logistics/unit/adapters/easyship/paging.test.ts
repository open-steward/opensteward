/**
 * Easyship list paging. listCarriers and listManifests sent no paging params,
 * so page 2 repeated page 1 and nothing past Easyship's default 20 rows could
 * be reached.
 *
 * Both endpoints page by number. First-party spec (Easyship Public API
 * v2024-09), https://developers.easyship.com/reference/couriers_index and
 * https://developers.easyship.com/reference/manifests_index:
 *   page:     "Page number to fetch, default: `1`" (minimum 1)
 *   per_page: "Number of records per page to fetch, default: `20`"
 *             (minimum 1, maximum 100)
 * and each list answers `meta.pagination` = { page, next, count }, where
 * `next` is the next page number or null and `count` is "The total number of
 * items" (nullable).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  listPage,
  parseListQuery,
  readUpstreamPage,
  withPageSink,
  type QueryParams,
} from '@opensteward/shared'

const { getMock, ClientCtor } = vi.hoisted(() => {
  const getMock = vi.fn()
  const ClientCtor = vi.fn().mockImplementation(function EasyshipClientMock() {
    return { get: getMock }
  })
  return { getMock, ClientCtor }
})

vi.mock('../../../../../../src/verticals/logistics/adapters/easyship/client', () => ({
  EasyshipClient: ClientCtor,
}))

import { EasyshipAdapter } from '../../../../../../src/verticals/logistics/adapters/easyship'
import type { Credentials } from '../../../../../../src/verticals/logistics/adapter/interface'

const CREDS = { accessToken: 'TEST_token' } as Credentials
const L = 5
const N = 2 * L + 1
const PER_PAGE_MAX = 100
const CALL_BUDGET = 40

const COURIER_KEYS = new Set([
  'page',
  'per_page',
  'sort_by',
  'sort_direction',
  'country_alpha2',
  'customer_reference_id',
  'auth_state',
  'state',
  'umbrella_name',
  'active_courier_services',
  'easyship_courier',
])
const MANIFEST_KEYS = new Set([
  'page',
  'per_page',
  'courier_umbrella_name',
  'courier_id',
  'ref_number',
  'created_at_from',
  'created_at_to',
])

interface Method {
  name: string
  path: string
  key: 'couriers' | 'manifests'
  allowed: Set<string>
  call: (a: EasyshipAdapter, p: QueryParams) => Promise<Array<{ id?: string }>>
}

const METHODS: Method[] = [
  {
    name: 'listCarriers',
    path: 'couriers',
    key: 'couriers',
    allowed: COURIER_KEYS,
    call: (a, p) => a.listCarriers(CREDS, p),
  },
  {
    name: 'listManifests',
    path: 'manifests',
    key: 'manifests',
    allowed: MANIFEST_KEYS,
    call: (a, p) => a.listManifests(CREDS, p),
  },
]

const ids = (n: number, prefix: string) => Array.from({ length: n }, (_, i) => `${prefix}${i + 1}`)

/**
 * A fake Easyship that honours ONLY the documented query params of the
 * endpoint: `page` (default 1) and `per_page` (default 20, 1..100). Anything
 * else is a 400, as is a per_page outside the documented range.
 */
function fakeEasyship(m: Method, total: number, opts: { countless?: boolean } = {}) {
  let calls = 0
  const rows = ids(total, `${m.key[0]}`).map((id) => ({ id }))
  getMock.mockImplementation(async (path: string, params?: Record<string, unknown>) => {
    if (++calls > CALL_BUDGET) throw new Error(`call budget (${CALL_BUDGET}) exceeded`)
    if (path !== m.path) throw new Error(`404: ${path}`)
    const q = Object.fromEntries(Object.entries(params ?? {}).filter(([, v]) => v !== undefined))
    const bad = Object.keys(q).filter((k) => !m.allowed.has(k))
    if (bad.length) throw new Error(`400: undocumented params ${bad.join(',')}`)
    const page = q.page === undefined ? 1 : Number(q.page)
    const perPage = q.per_page === undefined ? 20 : Number(q.per_page)
    if (!(Number.isInteger(page) && page >= 1)) throw new Error(`400: page ${page}`)
    if (!(Number.isInteger(perPage) && perPage >= 1 && perPage <= PER_PAGE_MAX)) {
      throw new Error(`400: per_page ${perPage}`)
    }
    const start = (page - 1) * perPage
    const next = start + perPage < rows.length ? page + 1 : null
    return {
      [m.key]: rows.slice(start, start + perPage),
      meta: {
        pagination: { page, next, count: opts.countless ? null : rows.length },
        request_id: 'req',
      },
    }
  })
  return rows.map((r) => r.id)
}

beforeEach(() => {
  ClientCtor.mockClear()
  getMock.mockReset()
})

describe.each(METHODS)('easyship $name paging', (m) => {
  it('serves every row once, in order, across pages 1..3 with exact hasMore', async () => {
    const expected = fakeEasyship(m, N)
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      const rows = await m.call(new EasyshipAdapter(), params)
      seen.push(...rows.map((r) => r.id!))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(expected)
    expect(more).toEqual([true, true, false])
  })

  it('hasMore stays exact when Easyship answers a countless page (count null)', async () => {
    const expected = fakeEasyship(m, N, { countless: true })
    const params = withPageSink({ page: 3, limit: L })
    const rows = await m.call(new EasyshipAdapter(), params)
    expect(rows.map((r) => r.id)).toEqual(expected.slice(2 * L))
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
    expect(readUpstreamPage(params)?.totalCount).toBeUndefined()
  })

  it('the page-2 request carries the documented page and per_page', async () => {
    fakeEasyship(m, N)
    await m.call(new EasyshipAdapter(), withPageSink({ page: 2, limit: L }))
    expect(getMock).toHaveBeenCalledTimes(1)
    const [path, params] = getMock.mock.calls[0] as [string, Record<string, unknown>]
    expect(path).toBe(m.path)
    expect(params).toEqual({ page: 2, per_page: L })
  })

  it('a limit above the documented maximum is clamped to per_page 100', async () => {
    const expected = fakeEasyship(m, 150)
    const params = withPageSink({ page: 1, limit: 500 })
    const rows = await m.call(new EasyshipAdapter(), params)
    const sent = (getMock.mock.calls[0] as [string, Record<string, unknown>])[1]
    expect(sent.per_page).toBe(PER_PAGE_MAX)
    expect(rows.map((r) => r.id)).toEqual(expected.slice(0, PER_PAGE_MAX))
    expect(readUpstreamPage(params)).toEqual(
      expect.objectContaining({ hasMore: true, pageSize: PER_PAGE_MAX, totalCount: 150 }),
    )
  })

  it('a call with no limit sends the documented default per_page 20', async () => {
    fakeEasyship(m, N)
    const params = withPageSink({ page: 1 })
    await m.call(new EasyshipAdapter(), params)
    const sent = (getMock.mock.calls[0] as [string, Record<string, unknown>])[1]
    expect(sent).toEqual({ page: 1, per_page: 20 })
    expect(readUpstreamPage(params)?.pageSize).toBe(20)
  })

  it('the router caps the limit at the declared maximum', () => {
    const params = parseListQuery({ page: '1', limit: '100000' }, new EasyshipAdapter())
    expect(params.limit).toBe(PER_PAGE_MAX)
  })

  it('API path: parseListQuery -> adapter -> listPage serves page 2 with exact meta', async () => {
    const expected = fakeEasyship(m, N)
    const adapter = new EasyshipAdapter()
    const params = parseListQuery({ page: '2', limit: String(L) }, adapter)
    const env = listPage(await m.call(adapter, params), params, 'easyship')
    expect(env.data.map((r) => r.id)).toEqual(expected.slice(L, 2 * L))
    expect(env.meta).toEqual(expect.objectContaining({ page: 2, limit: L, hasMore: true }))
  })
})
