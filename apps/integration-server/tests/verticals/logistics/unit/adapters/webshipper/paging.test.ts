/**
 * Webshipper list paging. Every list method sent `page[size]=<limit>` and
 * mapped `params.cursor` to `page[number]`, so the caller's `page` never
 * reached Webshipper and page 2 repeated page 1.
 *
 * First-party source, https://docs.webshipper.io/ (1.1 Conventions):
 *   "The API has a fixed page limit of 30 records. To fetch more records use
 *    the query parameter page[number]"
 *
 * `page[size]` is not documented, and no next link or total is. So the
 * adapter walks `page[number]` 1, 2, 3… in fixed pages of 30, treats a page
 * shorter than 30 as the last, and cuts the caller's pages out of those
 * (pageByRows).
 *
 * listWarehouses reads the documented Shipping Address resource
 * ("GET https://<account name>.api.webshipper.io/v2/shipping_addresses",
 * filter `address_type` among "recipient, sender, sold_from, pickup,
 * return, order_address") narrowed to `filter[address_type]=sender`, the
 * account's ship-from addresses. It used to call `sender_addresses`, which
 * the docs do not have. listManifests refuses: the docs have no manifests.
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
import { WebshipperAdapter } from '../../../../../../src/verticals/logistics/adapters/webshipper/index'

const CREDS = { accessToken: 'tok-a', refreshToken: 'ref-a', extra: { accountSlug: 'acme' } }
const OTHER = { accessToken: 'tok-b', refreshToken: 'ref-b', extra: { accountSlug: 'acme' } }
const CALL_BUDGET = 60
/** Webshipper's fixed page limit. */
const FIXED = 30
const L = 5
const N = 2 * L + 1

type Row = Record<string, unknown>
type Call = { token: string; path: string; params: Record<string, unknown> }

/**
 * The `filter[...]` query parameters the OpenAPI download
 * (https://docs.webshipper.io/?download_openapi=1) declares on each GET
 * collection, narrowed to the ones this adapter sends. Any other key on that
 * path is a 400 in the fake.
 *   /tracking_events: filter[created_at], filter[id], filter[shipment_id]
 *   /shipping_addresses: filter[address_type], filter[att_contact],
 *     filter[company_name], filter[country_code], filter[id], filter[search],
 *     filter[state], filter[zip]
 */
const DOCUMENTED_FILTERS: Record<string, string[]> = {
  tracking_events: ['filter[shipment_id]'],
  shipping_addresses: ['filter[address_type]'],
}

/**
 * A fake Webshipper that honours ONLY the documented `page[number]` (default
 * 1) at its fixed 30 records a page, and the documented `filter[...]` keys of
 * that path (DOCUMENTED_FILTERS). Any other key is a 400. Each token is its own tenant user, and `filter[shipment_id]` really
 * narrows the collection: its ids carry an `s<id>:` prefix.
 */
function fakeWebshipper(count: number, opts: { perToken?: Record<string, number> } = {}) {
  let calls = 0
  const log: Call[] = []
  const makeGet = (token: string) =>
    vi.fn(async (path: string, cfg?: { params?: Record<string, unknown> }) => {
      if (++calls > CALL_BUDGET) throw new Error(`call budget (${CALL_BUDGET}) exceeded`)
      const params = Object.fromEntries(
        Object.entries(cfg?.params ?? {}).filter(([, v]) => v !== undefined),
      )
      log.push({ token, path, params })
      const allowed = DOCUMENTED_FILTERS[path] ?? []
      const bad = Object.keys(params).filter((k) => k !== 'page[number]' && !allowed.includes(k))
      if (bad.length) throw new Error(`400: undocumented params ${bad.join(',')}`)
      const n = opts.perToken?.[token] ?? count
      const shipment = params['filter[shipment_id]']
      const tag =
        (token === CREDS.accessToken ? '' : `${token}:`) +
        (shipment === undefined ? '' : `s${String(shipment)}:`)
      const page = params['page[number]'] === undefined ? 1 : Number(params['page[number]'])
      const data: Row[] = Array.from({ length: n }, (_, i) => ({
        id: `${tag}${i + 1}`,
        type: path,
        attributes: {},
      })).slice((page - 1) * FIXED, page * FIXED)
      return { data: { data } }
    })

  vi.spyOn(axios, 'create').mockImplementation(((cfg: { headers?: Record<string, string> }) => {
    const token = (cfg?.headers?.Authorization ?? '').replace(/^Bearer /, '')
    return { get: makeGet(token), post: vi.fn(), patch: vi.fn(), delete: vi.fn() }
  }) as never)
  return { log }
}

const ids = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => `${prefix}${i + 1}`)
const byId = (r: { id?: string }): string => r.id ?? '<no id>'

beforeEach(() => _resetRowPager())
afterEach(() => vi.restoreAllMocks())

const adapter = () => new WebshipperAdapter()

type Lister = (
  a: WebshipperAdapter,
  c: typeof CREDS,
  p: Parameters<WebshipperAdapter['listShipments']>[1],
) => Promise<Array<{ id?: string }>>

/** The filters each list method always sends, besides `page[number]`. */
const SENDER = { 'filter[address_type]': 'sender' }

const METHODS: Array<[string, string, Lister, Record<string, string>]> = [
  ['listShipments', 'shipments', (a, c, p) => a.listShipments(c, p), {}],
  ['listOrders', 'orders', (a, c, p) => a.listOrders(c, p), {}],
  ['listCarriers', 'carriers', (a, c, p) => a.listCarriers(c, p), {}],
  ['listTrackingEvents', 'tracking_events', (a, c, p) => a.listTrackingEvents(c, p), {}],
  ['listLabels', 'labels', (a, c, p) => a.listLabels(c, p), {}],
  ['listWarehouses', 'shipping_addresses', (a, c, p) => a.listWarehouses(c, p), SENDER],
]

describe.each(METHODS)('webshipper %s paging (GET /v2/%s)', (_name, path, list, filters) => {
  it('N = 2L+1 rows: pages 1..3 at limit L return every id once, in order, with exact hasMore', async () => {
    fakeWebshipper(N)
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (let k = 1; k <= 3; k++) {
      const params = withPageSink({ page: k, limit: L })
      seen.push(...(await list(adapter(), CREDS, params)).map(byId))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(ids('', N))
    expect(more).toEqual([true, true, false])
  })

  it('rows spanning upstream pages: pages 1..3 at limit 30 walk page[number] 1..3', async () => {
    const total = 2 * FIXED + 1
    const { log } = fakeWebshipper(total)
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (let k = 1; k <= 3; k++) {
      const params = withPageSink({ page: k, limit: FIXED })
      seen.push(...(await list(adapter(), CREDS, params)).map(byId))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(ids('', total))
    expect(more).toEqual([true, true, false])
    expect(log.map((c) => c.params['page[number]'])).toEqual([1, 2, 3])
  })

  it('the page-2 request carries the documented page[number] key and its fixed filters only', async () => {
    const { log } = fakeWebshipper(2 * FIXED + 1)
    const rows = await list(adapter(), CREDS, withPageSink({ page: 2, limit: FIXED }))
    expect(rows.map(byId)).toEqual(ids('', 2 * FIXED).slice(FIXED))
    const page2 = log.filter((c) => c.params['page[number]'] === 2)
    expect(page2).toHaveLength(1)
    expect(page2[0]!.path).toBe(path)
    expect(page2[0]!.params).toEqual({ ...filters, 'page[number]': 2 })
  })

  it('a limit above the fixed 30 is served from several upstream pages of 30', async () => {
    const { log } = fakeWebshipper(250)
    const params = parseListQuery({ page: '2', limit: '100' })
    const rows = await list(adapter(), CREDS, params)
    expect(rows.map(byId)).toEqual(ids('', 250).slice(100, 200))
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
    for (const c of log)
      expect(c.params).toEqual({ ...filters, 'page[number]': c.params['page[number]'] })
  })

  it('a collection of exactly 30 ends on the empty page after it', async () => {
    fakeWebshipper(FIXED)
    const params = withPageSink({ page: 1, limit: FIXED })
    expect((await list(adapter(), CREDS, params)).map(byId)).toEqual(ids('', FIXED))
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('API path: parseListQuery -> adapter -> listPage serves page 2 with exact meta', async () => {
    fakeWebshipper(N)
    const params = parseListQuery({ page: '2', limit: String(L) })
    const env = listPage(await list(adapter(), CREDS, params), params, 'webshipper')
    expect(env.data.map(byId)).toEqual(ids('', N).slice(L, 2 * L))
    expect(env.meta).toEqual(expect.objectContaining({ page: 2, limit: L, hasMore: true }))
  })

  it('a second connection on the same account never reuses the first connection’s rows', async () => {
    const { log } = fakeWebshipper(N)
    await list(adapter(), CREDS, withPageSink({ page: 1, limit: L }))
    const rows = await list(adapter(), OTHER, withPageSink({ page: 2, limit: L }))
    expect(rows.map(byId)).toEqual(ids(`${OTHER.accessToken}:`, N).slice(L, 2 * L))
    expect(log.filter((c) => c.token === OTHER.accessToken).length).toBeGreaterThan(0)
  })
})

describe('webshipper listTrackingEvents filter', () => {
  it('sends filter[shipment_id] on every page and keys the walk by it', async () => {
    const { log } = fakeWebshipper(N)
    await adapter().listTrackingEvents(
      CREDS,
      withPageSink({ page: 1, limit: L, shipmentId: '7' } as never),
    )
    await adapter().listTrackingEvents(
      CREDS,
      withPageSink({ page: 1, limit: L, shipmentId: '8' } as never),
    )
    expect(log.map((c) => c.params)).toEqual([
      { 'page[number]': 1, 'filter[shipment_id]': '7' },
      { 'page[number]': 1, 'filter[shipment_id]': '8' },
    ])
  })

  it('a walk under one shipment filter is never reused for page 2 of another', async () => {
    fakeWebshipper(N)
    await adapter().listTrackingEvents(
      CREDS,
      withPageSink({ page: 1, limit: L, shipmentId: '7' } as never),
    )
    const rows = await adapter().listTrackingEvents(
      CREDS,
      withPageSink({ page: 2, limit: L, shipmentId: '8' } as never),
    )
    expect(rows.map(byId)).toEqual(ids('s8:', N).slice(L, 2 * L))
  })
})

describe('webshipper collections on one connection', () => {
  it('a shipments walk is never reused for page 2 of orders', async () => {
    const { log } = fakeWebshipper(N)
    await adapter().listShipments(CREDS, withPageSink({ page: 1, limit: L }))
    const rows = await adapter().listOrders(CREDS, withPageSink({ page: 2, limit: L }))
    expect(rows.map(byId)).toEqual(ids('', N).slice(L, 2 * L))
    expect(log.filter((c) => c.path === 'orders').length).toBeGreaterThan(0)
  })
})

describe('webshipper manifests', () => {
  it('listManifests refuses with 501 NOT_SUPPORTED and sends no request', async () => {
    const { log } = fakeWebshipper(N)
    await expect(
      adapter().listManifests(CREDS, withPageSink({ page: 1, limit: L })),
    ).rejects.toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
    expect(log).toHaveLength(0)
  })

  it('getManifest refuses with 501 NOT_SUPPORTED and sends no request', async () => {
    const { log } = fakeWebshipper(N)
    await expect(adapter().getManifest(CREDS, '55')).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
    })
    expect(log).toHaveLength(0)
  })
})

describe('webshipper getWarehouse', () => {
  it('reads GET /v2/shipping_addresses/{id}', async () => {
    const get = vi.fn(async () => ({
      data: {
        data: { id: 12, type: 'shipping_addresses', attributes: { address_type: 'sender' } },
      },
    }))
    vi.spyOn(axios, 'create').mockImplementation((() => ({ get })) as never)
    const wh = await adapter().getWarehouse(CREDS, '12')
    expect(get).toHaveBeenCalledWith('shipping_addresses/12', { params: undefined })
    expect(wh.id).toBe('12')
  })
})
