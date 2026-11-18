/**
 * Sameday list paging. listCarriers and listWarehouses sent
 * `currentPage=1&pageSize=<limit>` on every call: `currentPage` was hard-coded
 * and neither key is one Sameday reads, so page 2 repeated page 1.
 *
 * GET /api/client/services and GET /api/client/pickup-points are
 * page-numbered. First-party source, the official PHP SDK
 * (https://github.com/sameday-courier/php-sdk):
 *   src/Sameday/Requests/Traits/SamedayRequestPaginationTrait.php
 *     protected $countPerPage = 50;
 *     return [ 'page' => $this->page, 'countPerPage' => $this->countPerPage, ];
 *   src/Sameday/Responses/Traits/SamedayResponsePaginationTrait.php
 *     @var int Total number of pages.  ->  $data['pages']
 *
 * No maximum countPerPage is documented, so the adapter asks for the SDK's
 * own 50 per upstream page and cuts the caller's pages out of them
 * (pageByRows). listCarriers folds every service into ONE carrier record, so
 * it reads every page of services and pages that single row locally.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import axios from 'axios'
import {
  _resetRowPager,
  listPage,
  parseListQuery,
  readUpstreamPage,
  withPageSink,
} from '@opensteward/shared'
import { SamedayAdapter } from '../../../../../../src/verticals/logistics/adapters/sameday/index'

const CREDS = { accessToken: 'jwt-a', refreshToken: 'user-a:pass-a' }
const OTHER = { accessToken: 'jwt-b', refreshToken: 'user-b:pass-b' }
/** Same Sameday username as CREDS, different secret: still a different connection. */
const SAME_USER = { accessToken: 'jwt-c', refreshToken: 'user-a:pass-c' }
const CALL_BUDGET = 60
/** The SDK's default countPerPage, which the adapter sends on every list call. */
const UPSTREAM = 50
const L = 5
const N = 2 * L + 1
const PAGE_KEYS = new Set(['page', 'countPerPage'])

type Row = Record<string, unknown>

/**
 * A fake Sameday that honours ONLY the documented `page` and `countPerPage`
 * (defaults 1 and 50) and answers with the documented envelope
 * { data, total, currentPage, pages, perPage }. Each token is its own client.
 */
function fakeSameday(
  count: number,
  opts: {
    perToken?: Record<string, number>
    /** Serve at most this many rows per page, whatever countPerPage asks for. */
    cap?: number
    /** Leave `pages` out of the envelope (the SDK reads it with array_key_exists). */
    omitPages?: boolean
    /** Always claim one more page than the one served, full of rows. */
    endless?: boolean
    budget?: number
  } = {},
) {
  const budget = opts.budget ?? CALL_BUDGET
  let calls = 0
  const log: Array<{ token: string; path: string; params: Record<string, unknown> }> = []

  function rowsFor(token: string, path: string): Row[] {
    const n = opts.perToken?.[token] ?? count
    const tag = token === CREDS.accessToken ? '' : `${token}:`
    if (path === '/api/client/services')
      return Array.from({ length: n }, (_, i) => ({
        id: i + 1,
        name: `Service ${i + 1}`,
        serviceCode: `${tag}svc${i + 1}`,
        deliveryType: { id: 1, name: 'Standard' },
        defaultServices: false,
        serviceOptionalTaxes: [],
      }))
    return Array.from({ length: n }, (_, i) => ({
      id: `${tag}${i + 1}`,
      country: { id: 1, name: 'Romania', code: 'RO' },
      county: { id: 1, name: 'Bucuresti', code: 'B' },
      city: {
        id: 1,
        name: 'Bucuresti',
        samedayDeliveryAgency: '',
        samedayPickupAgency: '',
        extraKM: 0,
      },
      address: `Street ${i + 1}`,
      defaultPickupPoint: i === 0,
      pickupPointContactPerson: [],
      alias: `Point ${i + 1}`,
    }))
  }

  const get = vi.fn(
    async (
      path: string,
      cfg?: { params?: Record<string, unknown>; headers?: Record<string, string> },
    ) => {
      if (++calls > budget) throw new Error(`call budget (${budget}) exceeded`)
      const token = cfg?.headers?.['X-AUTH-TOKEN'] ?? ''
      const params = Object.fromEntries(
        Object.entries(cfg?.params ?? {}).filter(([, v]) => v !== undefined),
      )
      log.push({ token, path, params })
      if (path !== '/api/client/services' && path !== '/api/client/pickup-points')
        throw new Error(`unexpected path ${path}`)
      const bad = Object.keys(params).filter((k) => !PAGE_KEYS.has(k))
      if (bad.length) throw new Error(`400: undocumented params ${bad.join(',')}`)
      const asked = params.countPerPage === undefined ? 50 : Number(params.countPerPage)
      const perPage = Math.min(asked, opts.cap ?? asked)
      const page = params.page === undefined ? 1 : Number(params.page)
      if (opts.endless) {
        const data = rowsFor(token, path).slice(0, perPage)
        return { data: { data, total: 1e9, currentPage: page, pages: page + 1, perPage } }
      }
      const rows = rowsFor(token, path)
      const pages = Math.max(1, Math.ceil(rows.length / perPage))
      return {
        data: {
          data: rows.slice((page - 1) * perPage, page * perPage),
          total: rows.length,
          currentPage: page,
          ...(opts.omitPages ? {} : { pages }),
          perPage,
        },
      }
    },
  )

  vi.spyOn(axios, 'create').mockImplementation((() => ({
    get,
    post: vi.fn(),
    delete: vi.fn(),
  })) as never)
  return { get, log }
}

const ids = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => `${prefix}${i + 1}`)
const byId = (r: { id?: string }): string => r.id ?? '<no id>'
const sentParams = (c: unknown[]) => (c[1] as { params: Record<string, unknown> }).params

beforeEach(() => _resetRowPager())
afterEach(() => vi.restoreAllMocks())

const adapter = () => new SamedayAdapter()

describe('sameday listWarehouses paging (GET /api/client/pickup-points)', () => {
  it('N = 2L+1 rows: pages 1..3 at limit L return every id once, in order, with exact hasMore', async () => {
    fakeSameday(N)
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (let k = 1; k <= 3; k++) {
      const params = withPageSink({ page: k, limit: L })
      seen.push(...(await adapter().listWarehouses(CREDS, params)).map(byId))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(ids('', N))
    expect(more).toEqual([true, true, false])
  })

  it('rows spanning upstream pages: pages 1..3 at limit 50 walk upstream pages 1..3 by `page`', async () => {
    const total = 2 * UPSTREAM + 1
    const { get } = fakeSameday(total)
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (let k = 1; k <= 3; k++) {
      const params = withPageSink({ page: k, limit: UPSTREAM })
      seen.push(...(await adapter().listWarehouses(CREDS, params)).map(byId))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(ids('', total))
    expect(more).toEqual([true, true, false])
    expect(get.mock.calls.map((c) => sentParams(c).page)).toEqual([1, 2, 3])
  })

  it('the page-2 request carries the documented `page` key and `countPerPage`', async () => {
    const { get } = fakeSameday(2 * UPSTREAM + 1)
    const rows = await adapter().listWarehouses(CREDS, withPageSink({ page: 2, limit: UPSTREAM }))
    expect(rows.map(byId)).toEqual(ids('', 2 * UPSTREAM).slice(UPSTREAM))
    const page2 = get.mock.calls.filter((c) => sentParams(c).page === 2)
    expect(page2).toHaveLength(1)
    expect(page2[0]![0]).toBe('/api/client/pickup-points')
    expect(sentParams(page2[0]!)).toEqual({ page: 2, countPerPage: UPSTREAM })
  })

  it('a limit above the upstream page size is served from several upstream pages of 50', async () => {
    const { get } = fakeSameday(250)
    const params = parseListQuery({ page: '2', limit: '100' })
    const rows = await adapter().listWarehouses(CREDS, params)
    expect(rows.map(byId)).toEqual(ids('', 250).slice(100, 200))
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
    for (const c of get.mock.calls) expect(sentParams(c).countPerPage).toBe(UPSTREAM)
  })

  it('API path: parseListQuery -> adapter -> listPage serves page 2 with exact meta', async () => {
    fakeSameday(N)
    const params = parseListQuery({ page: '2', limit: String(L) })
    const env = listPage(await adapter().listWarehouses(CREDS, params), params, 'sameday')
    expect(env.data.map(byId)).toEqual(ids('', N).slice(L, 2 * L))
    expect(env.meta).toEqual(expect.objectContaining({ page: 2, limit: L, hasMore: true }))
  })

  it('a second connection never reuses the first connection’s rows', async () => {
    const { log } = fakeSameday(N)
    await adapter().listWarehouses(CREDS, withPageSink({ page: 1, limit: L }))
    const params = withPageSink({ page: 2, limit: L })
    const rows = await adapter().listWarehouses(OTHER, params)
    expect(rows.map(byId)).toEqual(ids(`${OTHER.accessToken}:`, N).slice(L, 2 * L))
    expect(log.filter((c) => c.token === OTHER.accessToken).length).toBeGreaterThan(0)
  })

  it('a second connection with the SAME username but another secret never reuses rows', async () => {
    fakeSameday(N)
    await adapter().listWarehouses(CREDS, withPageSink({ page: 1, limit: L }))
    const rows = await adapter().listWarehouses(SAME_USER, withPageSink({ page: 2, limit: L }))
    expect(rows.map(byId)).toEqual(ids(`${SAME_USER.accessToken}:`, N).slice(L, 2 * L))
  })

  it('`pages` ends the walk, not a short page: a server serving 20 of 50 still reads every page', async () => {
    const { get } = fakeSameday(45, { cap: 20 })
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (let k = 1; k <= 3; k++) {
      const params = withPageSink({ page: k, limit: 20 })
      seen.push(...(await adapter().listWarehouses(CREDS, params)).map(byId))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(ids('', 45))
    expect(more).toEqual([true, true, false])
    expect(get.mock.calls.map((c) => sentParams(c).page)).toEqual([1, 2, 3])
  })

  it('without `pages`, a full page of 50 continues and a short page ends', async () => {
    const total = 2 * UPSTREAM + 1
    const { get } = fakeSameday(total, { omitPages: true })
    const seen: string[] = []
    for (let k = 1; k <= 3; k++) {
      const params = withPageSink({ page: k, limit: UPSTREAM })
      seen.push(...(await adapter().listWarehouses(CREDS, params)).map(byId))
    }
    expect(seen).toEqual(ids('', total))
    expect(get.mock.calls.map((c) => sentParams(c).page)).toEqual([1, 2, 3])
  })
})

describe('sameday listCarriers paging (GET /api/client/services, folded into one carrier)', () => {
  it('reads every page of services by `page` into the single carrier', async () => {
    const total = 2 * UPSTREAM + 1
    const { get } = fakeSameday(total)
    const params = withPageSink({ page: 1, limit: L })
    const carriers = await adapter().listCarriers(CREDS, params)
    expect(carriers).toHaveLength(1)
    expect(carriers[0]!.services!.map((s) => s.code)).toEqual(ids('svc', total))
    expect(get.mock.calls.map((c) => sentParams(c))).toEqual([
      { page: 1, countPerPage: UPSTREAM },
      { page: 2, countPerPage: UPSTREAM },
      { page: 3, countPerPage: UPSTREAM },
    ])
    expect(readUpstreamPage(params)).toEqual(
      expect.objectContaining({ hasMore: false, totalCount: 1 }),
    )
  })

  it('pages 1..3 at limit 1 return the one carrier once, with exact hasMore', async () => {
    fakeSameday(N)
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (let k = 1; k <= 3; k++) {
      const params = withPageSink({ page: k, limit: 1 })
      seen.push(...(await adapter().listCarriers(CREDS, params)).map(byId))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(['sameday'])
    expect(more).toEqual([false, false, false])
  })

  it('`pages` ends the services walk, not a short page (server serves 20 of 50)', async () => {
    const { get } = fakeSameday(45, { cap: 20 })
    const carriers = await adapter().listCarriers(CREDS, withPageSink({ page: 1, limit: L }))
    expect(carriers[0]!.services!.map((s) => s.code)).toEqual(ids('svc', 45))
    expect(get.mock.calls.map((c) => sentParams(c).page)).toEqual([1, 2, 3])
  })

  it('without `pages`, services continue on a full page and end on a short one', async () => {
    const total = 2 * UPSTREAM + 1
    const { get } = fakeSameday(total, { omitPages: true })
    const carriers = await adapter().listCarriers(CREDS, withPageSink({ page: 1, limit: L }))
    expect(carriers[0]!.services!.map((s) => s.code)).toEqual(ids('svc', total))
    expect(get.mock.calls).toHaveLength(3)
  })

  it('a `pages` that never ends stops at the 200-page guard', async () => {
    const { get } = fakeSameday(UPSTREAM, { endless: true, budget: 1000 })
    await expect(
      adapter().listCarriers(CREDS, withPageSink({ page: 1, limit: L })),
    ).rejects.toThrow(/more than 200 pages/)
    expect(get.mock.calls).toHaveLength(200)
  })

  it('no services: no carrier', async () => {
    fakeSameday(0)
    const params = withPageSink({ page: 1, limit: L })
    expect(await adapter().listCarriers(CREDS, params)).toEqual([])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('API path: parseListQuery -> adapter -> listPage serves page 2 empty with exact meta', async () => {
    fakeSameday(N)
    const params = parseListQuery({ page: '2', limit: String(L) })
    const env = listPage(await adapter().listCarriers(CREDS, params), params, 'sameday')
    expect(env.data).toEqual([])
    expect(env.meta).toEqual(expect.objectContaining({ page: 2, limit: L, hasMore: false }))
  })
})
