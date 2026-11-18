/**
 * CDEK list paging. listWarehouses ignored the caller's `page`, so page 2
 * repeated page 1 and no delivery point past the first page was reachable.
 *
 * GET /v2/deliverypoints is page-numbered. CDEK's own OpenAPI document, served
 * by its docs portal (https://apidoc.cdek.ru/api/api_v2_integration/) at
 * https://gateway.cdek.ru/api-cdek-docs/web/docs/merged?sectionId=api_v2_integration:
 *   size: "Ограничение выборки результата (размер страницы)"   (minimum 0)
 *   page: "Номер страницы выборки результата"                  (minimum 0)
 *   200 response headers: X-Current-Page, X-Total-Elements, X-Total-Pages
 * The same document's other page-numbered lists (/v2/location/regions,
 * /v2/location/cities) say "Номер страницы выборки результата. По умолчанию 0":
 * pages are 0-based, so caller page k is upstream page k − 1.
 *
 * listShipments, listOrders and listTrackingEvents call GET /v2/orders, which
 * the same document defines as a single-order lookup by cdek_number/im_number
 * with no paging at all. They are rebuild backlog, not paging fixes, and are
 * not tested here.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import {
  listPage,
  parseListQuery,
  readUpstreamPage,
  withPageSink,
  type QueryParams,
} from '@opensteward/shared'
import { CdekAdapter } from '../../../../../../src/verticals/logistics/adapters/cdek/index'

const CREDS = { accessToken: 'cdek_test_token' }
const CALL_BUDGET = 40
const L = 5
const N = 2 * L + 1

/** Every query parameter GET /v2/deliverypoints documents, and nothing else. */
const DELIVERYPOINT_KEYS = new Set([
  'code',
  'type',
  'postal_code',
  'city_code',
  'country_code',
  'region_code',
  'have_cashless',
  'have_cash',
  'allowed_cod',
  'is_dressing_room',
  'weight_max',
  'weight_min',
  'length',
  'width',
  'height',
  'lang',
  'take_only',
  'is_handout',
  'is_reception',
  'is_marketplace',
  'is_ltl',
  'ltl_acceptance_partners',
  'ltl_issuance_partners',
  'fulfillment',
  'fias_guid',
  'size',
  'page',
])

interface FakeOpts {
  /** Omit the X-Total-* headers, as a proxy that strips them would. */
  noHeaders?: boolean
  /** Send X-Total-Elements but not X-Total-Pages, to exercise the count fallback. */
  onlyTotalElements?: boolean
}

/**
 * A fake CDEK that honours ONLY the documented deliverypoints params: `size`
 * rows per 0-based `page`, and the X-Current-Page / X-Total-Elements /
 * X-Total-Pages response headers. With no `size` it returns every row.
 */
function fakeCdek(points: number, opts: FakeOpts = {}) {
  let calls = 0
  const rows = Array.from({ length: points }, (_, i) => ({
    code: `MSK${i + 1}`,
    name: `Office ${i + 1}`,
    type: 'PVZ',
    location: { city: 'Moscow', country_code: 'RU', address: `Street ${i + 1}` },
  }))
  const get = vi.fn(async (path: string, cfg?: { params?: Record<string, unknown> }) => {
    if (++calls > CALL_BUDGET) throw new Error(`call budget (${CALL_BUDGET}) exceeded`)
    const params = Object.fromEntries(
      Object.entries(cfg?.params ?? {}).filter(([, v]) => v !== undefined),
    )
    if (path !== '/deliverypoints') throw new Error(`unexpected path ${path}`)
    const bad = Object.keys(params).filter((k) => !DELIVERYPOINT_KEYS.has(k))
    if (bad.length) throw new Error(`400: undocumented params ${bad.join(',')}`)
    const size = params.size === undefined ? rows.length : Number(params.size)
    const page = params.page === undefined ? 0 : Number(params.page)
    if (!(Number.isInteger(size) && size >= 0)) throw new Error(`400: size ${String(params.size)}`)
    if (!(Number.isInteger(page) && page >= 0)) throw new Error(`400: page ${String(params.page)}`)
    const data = rows.slice(page * size, page * size + size)
    const headers = opts.noHeaders
      ? {}
      : opts.onlyTotalElements
        ? { 'x-current-page': String(page), 'x-total-elements': String(rows.length) }
        : {
            'x-current-page': String(page),
            'x-total-elements': String(rows.length),
            'x-total-pages': String(size === 0 ? 0 : Math.ceil(rows.length / size)),
          }
    return { data, headers }
  })
  vi.spyOn(axios, 'create').mockImplementation((() => ({
    get,
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  })) as never)
  return { get }
}

const ids = (n = N) => Array.from({ length: n }, (_, i) => `MSK${i + 1}`)
const byId = (r: unknown) => (r as { id: string }).id
const sent = (get: ReturnType<typeof fakeCdek>['get'], i: number) =>
  (get.mock.calls[i]![1] as { params: Record<string, unknown> }).params
const call = (p: QueryParams) => new CdekAdapter().listWarehouses(CREDS, p)

afterEach(() => vi.restoreAllMocks())

describe('cdek listWarehouses paging', () => {
  it('N = 2L+1 rows: pages 1..3 at limit L return every id once, in order, with exact hasMore', async () => {
    fakeCdek(N)
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (let k = 1; k <= 3; k++) {
      const params = withPageSink({ page: k, limit: L })
      seen.push(...(await call(params)).map(byId))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(ids())
    expect(more).toEqual([true, true, false])
  })

  it('the page-2 request carries the documented 0-based page key and size', async () => {
    const { get } = fakeCdek(N)
    await call(withPageSink({ page: 2, limit: L }))
    expect(get.mock.calls[0]![0]).toBe('/deliverypoints')
    expect(sent(get, 0)).toEqual({ size: L, page: 1 })
  })

  it('a limit above the maximum is clamped and still serves every row', async () => {
    fakeCdek(N)
    const params = parseListQuery({ page: '1', limit: '100000' })
    expect(params.limit).toBeLessThan(100000)
    const rows = await call(params)
    expect(rows.map(byId)).toEqual(ids())
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('a direct call above the adapter ceiling reports the size it sent', async () => {
    const { get } = fakeCdek(1500)
    const params = withPageSink({ page: 1, limit: 5000 })
    const rows = await call(params)
    const size = Number(sent(get, 0).size)
    expect(size).toBeLessThan(5000)
    expect(rows).toHaveLength(size)
    expect(readUpstreamPage(params)).toEqual(
      expect.objectContaining({ hasMore: true, pageSize: size }),
    )
  })

  it('API path: parseListQuery -> adapter -> listPage serves page 2 with exact meta', async () => {
    fakeCdek(N)
    const params = parseListQuery({ page: '2', limit: String(L) })
    const env = listPage(await call(params), params, 'cdek')
    expect(env.data.map(byId)).toEqual(ids().slice(L, 2 * L))
    expect(env.meta).toEqual(expect.objectContaining({ page: 2, limit: L, hasMore: true }))
  })

  it('an exact multiple of the page size ends on the last full page', async () => {
    fakeCdek(2 * L)
    const params = withPageSink({ page: 2, limit: L })
    expect((await call(params)).map(byId)).toEqual(ids(2 * L).slice(L))
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('without the X-Total-* headers it reports no hasMore rather than guessing', async () => {
    fakeCdek(N, { noHeaders: true })
    const params = withPageSink({ page: 2, limit: L })
    expect((await call(params)).map(byId)).toEqual(ids().slice(L, 2 * L))
    expect(readUpstreamPage(params)?.hasMore).toBeUndefined()
  })

  it('reports totalCount from X-Total-Elements', async () => {
    fakeCdek(N)
    const params = withPageSink({ page: 1, limit: L })
    await call(params)
    expect(readUpstreamPage(params)?.totalCount).toBe(N)
  })

  it('with only X-Total-Elements, hasMore follows the row count: N = 2L+1', async () => {
    fakeCdek(N, { onlyTotalElements: true })
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (let k = 1; k <= 3; k++) {
      const params = withPageSink({ page: k, limit: L })
      seen.push(...(await call(params)).map(byId))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(ids())
    expect(more).toEqual([true, true, false])
  })

  it('with only X-Total-Elements, an exact multiple ends on the last full page', async () => {
    fakeCdek(2 * L, { onlyTotalElements: true })
    const p1 = withPageSink({ page: 1, limit: L })
    await call(p1)
    expect(readUpstreamPage(p1)?.hasMore).toBe(true)
    const p2 = withPageSink({ page: 2, limit: L })
    expect((await call(p2)).map(byId)).toEqual(ids(2 * L).slice(L))
    expect(readUpstreamPage(p2)?.hasMore).toBe(false)
  })
})
