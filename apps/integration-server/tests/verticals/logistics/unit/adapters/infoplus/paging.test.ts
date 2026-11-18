/**
 * Infoplus list paging and refusals.
 *
 * First-party docs: the v2.0 swagger,
 * https://developer.infopluscommerce.com/api/reference/v2.0/swagger.json
 * (host `<account domain>`, basePath "/infoplus-wms/api", security
 * `{"type":"apiKey","name":"API-Key","in":"header"}`).
 *
 *   GET /v2.0/order/search, /v2.0/parcelShipment/search, /v2.0/warehouse/search:
 *     query `filter`, `page` ("Result page number.  Defaults to 1."),
 *     `limit` ("Maximum results per page.  Defaults to 20.  Max allowed value
 *     is 250."), `sort`.
 *   GET /v2.0/carrier/search: query `searchText`, `page`, `limit` (same text).
 *   Every one answers 200 with `{"type":"array","items":{"$ref":…}}`.
 *
 * Before this fix every list called `GET v2.0/<resource>` (absent from the
 * swagger, or post/put only) with `page: params.cursor ?? 1`, so page 2
 * repeated page 1; listTrackingEvents read `parcelShipmentActivity`, which the
 * swagger does not define, and listLabels filtered on a `labelUrls` field the
 * parcelShipment definition does not have.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { listPage, parseListQuery, readUpstreamPage, withPageSink } from '@opensteward/shared'
import type { QueryParams } from '../../../../../../src/verticals/logistics/adapter/interface'
import { InfoplusAdapter } from '../../../../../../src/verticals/logistics/adapters/infoplus/index'

const CREDS = { accessToken: 'ip_key', extra: { domain: 'acme.infopluswms.com' } }
const CALL_BUDGET = 20
const L = 5
const N = 2 * L + 1
const DOC_DEFAULT = 20
const DOC_MAX = 250

const FILTER_PARAMS = ['filter', 'page', 'limit', 'sort']
const DOCUMENTED_PARAMS: Record<string, string[]> = {
  'order/search': FILTER_PARAMS,
  'parcelShipment/search': FILTER_PARAMS,
  'warehouse/search': FILTER_PARAMS,
  'carrier/search': ['searchText', 'page', 'limit'],
}

type Cfg = { params?: Record<string, unknown> }

/** A row of each definition, carrying its documented id key. */
const ROW: Record<string, (n: number) => Record<string, unknown>> = {
  'order/search': (n) => ({ orderNo: n, lobId: 1, warehouseId: 1, lineItems: [] }),
  'parcelShipment/search': (n) => ({ id: n, warehouseId: 1 }),
  'warehouse/search': (n) => ({ id: n, name: `W${n}` }),
  'carrier/search': (n) => ({ carrier: n, label: `C${n}` }),
}

/**
 * A fake Infoplus that honours ONLY the documented query parameters of each
 * search endpoint, pages with `page` (default 1) and `limit` (default 20, at
 * most 250), and returns a bare array, as the swagger says.
 */
function fakeInfoplus(total: number) {
  let calls = 0
  const get = vi.fn(async (path: string, cfg?: Cfg) => {
    if (++calls > CALL_BUDGET) throw new Error(`call budget (${CALL_BUDGET}) exceeded`)
    const allowed = DOCUMENTED_PARAMS[path]
    if (!allowed) throw new Error(`404: ${path} is not in the swagger`)
    const q = Object.fromEntries(
      Object.entries(cfg?.params ?? {}).filter(([, v]) => v !== undefined),
    )
    const bad = Object.keys(q).filter((k) => !allowed.includes(k))
    if (bad.length) throw new Error(`400: undocumented query params ${bad.join(',')}`)
    const page = Number(q.page ?? 1)
    const limit = Number(q.limit ?? DOC_DEFAULT)
    if (limit > DOC_MAX) throw new Error(`400: limit ${limit} above ${DOC_MAX}`)
    const ids = Array.from({ length: total }, (_, i) => i + 1).slice(
      (page - 1) * limit,
      page * limit,
    )
    return { data: ids.map(ROW[path]!) }
  })
  const create = vi.spyOn(axios, 'create').mockReturnValue({ get, post: vi.fn() } as never)
  return { get, create }
}

const ids = (from: number, count: number) =>
  Array.from({ length: count }, (_, i) => String(from + i))

type Lister = (a: InfoplusAdapter, p: QueryParams) => Promise<Array<{ id?: string }>>

const LISTS: Array<[string, string, Lister]> = [
  ['listOrders', 'order/search', (a, p) => a.listOrders(CREDS, p)],
  ['listShipments', 'parcelShipment/search', (a, p) => a.listShipments(CREDS, p)],
  ['listWarehouses', 'warehouse/search', (a, p) => a.listWarehouses(CREDS, p)],
  ['listCarriers', 'carrier/search', (a, p) => a.listCarriers(CREDS, p)],
]

afterEach(() => vi.restoreAllMocks())

describe('infoplus search paging (page / limit)', () => {
  for (const [name, path, list] of LISTS) {
    describe(name, () => {
      it(`GETs ${path} on the tenant host with the API-Key header`, async () => {
        const { get, create } = fakeInfoplus(N)
        await list(new InfoplusAdapter(), withPageSink({ page: 1, limit: L }))
        expect(get.mock.calls[0]![0]).toBe(path)
        expect(create).toHaveBeenCalledWith(
          expect.objectContaining({
            baseURL: 'https://acme.infopluswms.com/infoplus-wms/api/v2.0/',
            headers: expect.objectContaining({ 'API-Key': 'ip_key' }),
          }),
        )
      })

      it('N = 2L+1 rows: pages 1..3 at limit L return every id once, in order', async () => {
        fakeInfoplus(N)
        const seen: unknown[] = []
        const more: Array<boolean | undefined> = []
        for (let k = 1; k <= 3; k++) {
          const params = withPageSink({ page: k, limit: L })
          const rows = await list(new InfoplusAdapter(), params)
          seen.push(...rows.map((r) => r.id))
          more.push(readUpstreamPage(params)?.hasMore)
        }
        expect(seen).toEqual(ids(1, N))
        // A bare array has no count: only the short last page is a known end.
        expect(more).toEqual([undefined, undefined, false])
      })

      it('the page-2 request sends the documented page and limit, and nothing else', async () => {
        const { get } = fakeInfoplus(N)
        await list(new InfoplusAdapter(), withPageSink({ page: 2, limit: L }))
        expect(get).toHaveBeenCalledTimes(1)
        expect((get.mock.calls[0]![1] as Cfg).params).toEqual({ page: 2, limit: L })
      })

      it('a direct call above 250 sends limit=250 and reports that size', async () => {
        const { get } = fakeInfoplus(N)
        const params = withPageSink({ page: 1, limit: 1000 })
        await list(new InfoplusAdapter(), params)
        expect((get.mock.calls[0]![1] as Cfg).params?.limit).toBe(DOC_MAX)
        expect(readUpstreamPage(params)?.pageSize).toBe(DOC_MAX)
      })

      it('a direct call within 250 reports no pageSize: the size sent is the size asked', async () => {
        fakeInfoplus(N)
        const params = withPageSink({ page: 1, limit: L })
        await list(new InfoplusAdapter(), params)
        expect(readUpstreamPage(params)?.pageSize).toBeUndefined()
      })

      it('no limit sends the documented default of 20, and no page sends page 1', async () => {
        const { get } = fakeInfoplus(N)
        await list(new InfoplusAdapter(), withPageSink({}))
        expect((get.mock.calls[0]![1] as Cfg).params).toEqual({ page: 1, limit: DOC_DEFAULT })
      })

      it('the router clamps a huge limit to the declared maxPageSize of 250', async () => {
        const { get } = fakeInfoplus(N)
        const params = parseListQuery({ page: '1', limit: '100000' }, new InfoplusAdapter())
        expect(params.limit).toBe(DOC_MAX)
        const rows = await list(new InfoplusAdapter(), params)
        expect((get.mock.calls[0]![1] as Cfg).params?.limit).toBe(DOC_MAX)
        expect(rows.map((r) => r.id)).toEqual(ids(1, N))
        expect(readUpstreamPage(params)?.hasMore).toBe(false)
      })

      it('API path: parseListQuery → adapter → listPage serves page 2 and then the end', async () => {
        fakeInfoplus(N)
        const adapter = new InfoplusAdapter()
        const p2 = parseListQuery({ page: '2', limit: String(L) }, adapter)
        const env2 = listPage(await list(adapter, p2), p2, 'infoplus')
        expect(env2.data.map((r) => r.id)).toEqual(ids(L + 1, L))
        // A full page of a count-less array: more is unknown, and published as unknown.
        expect(env2.meta).toEqual(expect.objectContaining({ page: 2, limit: L, hasMore: null }))
        const p3 = parseListQuery({ page: '3', limit: String(L) }, adapter)
        const env3 = listPage(await list(adapter, p3), p3, 'infoplus')
        expect(env3.data.map((r) => r.id)).toEqual(ids(2 * L + 1, 1))
        expect(env3.meta).toEqual(expect.objectContaining({ page: 3, hasMore: false }))
      })

      it('a response that is not the documented array throws', async () => {
        const get = vi.fn(async () => ({ data: { items: [] } }))
        vi.spyOn(axios, 'create').mockReturnValue({ get } as never)
        await expect(
          list(new InfoplusAdapter(), withPageSink({ page: 1, limit: L })),
        ).rejects.toThrow(/not the documented array/)
      })

      it('a connection without an account domain throws before any request', async () => {
        const { get } = fakeInfoplus(N)
        await expect(
          (async () => {
            const a = new InfoplusAdapter()
            const p = withPageSink({ page: 1, limit: L })
            const noDomain = { accessToken: 'ip_key' }
            if (name === 'listOrders') return a.listOrders(noDomain, p)
            if (name === 'listShipments') return a.listShipments(noDomain, p)
            if (name === 'listWarehouses') return a.listWarehouses(noDomain, p)
            return a.listCarriers(noDomain, p)
          })(),
        ).rejects.toThrow(/account domain/)
        expect(get).not.toHaveBeenCalled()
      })

      it('a whitespace-only account domain is refused, not built into a host', async () => {
        const { get, create } = fakeInfoplus(N)
        const blank = { accessToken: 'ip_key', extra: { domain: '   ' } }
        const a = new InfoplusAdapter()
        const p = withPageSink({ page: 1, limit: L })
        const call =
          name === 'listOrders'
            ? a.listOrders(blank, p)
            : name === 'listShipments'
              ? a.listShipments(blank, p)
              : name === 'listWarehouses'
                ? a.listWarehouses(blank, p)
                : a.listCarriers(blank, p)
        await expect(call).rejects.toThrow(/account domain/)
        expect(create).not.toHaveBeenCalled()
        expect(get).not.toHaveBeenCalled()
      })
    })
  }
})

describe('infoplus get* read back the ids the lists return', () => {
  const GETS: Array<[string, string, (a: InfoplusAdapter) => Promise<{ id?: string }>]> = [
    ['getOrder', 'order/1001', (a) => a.getOrder(CREDS, '1001')],
    ['getShipment', 'parcelShipment/501', (a) => a.getShipment(CREDS, '501')],
    ['getWarehouse', 'warehouse/7', (a) => a.getWarehouse(CREDS, '7')],
    ['getCarrier', 'carrier/100', (a) => a.getCarrier(CREDS, '100')],
  ]
  const BODY: Record<string, Record<string, unknown>> = {
    getOrder: { orderNo: 1001 },
    getShipment: { id: 501 },
    getWarehouse: { id: 7 },
    getCarrier: { carrier: 100, label: 'UPS' },
  }
  for (const [name, path, call] of GETS) {
    it(`${name} GETs ${path}`, async () => {
      const get = vi.fn(async () => ({ data: BODY[name] }))
      vi.spyOn(axios, 'create').mockReturnValue({ get } as never)
      const out = await call(new InfoplusAdapter())
      expect((get.mock.calls[0] as unknown[])[0]).toBe(path)
      expect(out.id).toBe(path.split('/')[1])
    })
  }
})

describe('infoplus refuses what the v2.0 API cannot list', () => {
  const REFUSALS: Array<[string, (a: InfoplusAdapter) => Promise<unknown>, RegExp]> = [
    [
      'listTrackingEvents',
      (a) => a.listTrackingEvents(CREDS, withPageSink({ page: 1, limit: L })),
      /cannot list tracking events/,
    ],
    ['getTrackingEvents', (a) => a.getTrackingEvents(CREDS, '1Z999'), /tracking events/],
    [
      'listLabels',
      (a) => a.listLabels(CREDS, withPageSink({ page: 1, limit: L })),
      /cannot list labels/,
    ],
    ['getLabel', (a) => a.getLabel(CREDS, '501'), /cannot read a label/],
  ]
  for (const [name, call, message] of REFUSALS) {
    it(`${name} throws 501 NOT_SUPPORTED and sends no request`, async () => {
      const { get, create } = fakeInfoplus(N)
      await expect(call(new InfoplusAdapter())).rejects.toMatchObject({
        statusCode: 501,
        code: 'NOT_SUPPORTED',
        message: expect.stringMatching(message),
      })
      expect(create).not.toHaveBeenCalled()
      expect(get).not.toHaveBeenCalled()
    })
  }
})
