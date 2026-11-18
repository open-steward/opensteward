/**
 * Deposco list paging, request shape, refusals and auth.
 *
 * The adapter used to call `https://api.deposco.com/integration/{tenant}/…`
 * paths (search/shipment, search/CoHeader, search/tracking, carriers) that the
 * API reference does not contain, with an undocumented `page` parameter.
 *
 * First-party reference: https://auth.deposco.com/public/spec?version=latest
 *   servers: https://api.deposco.com/latest ("Production API - North American Region")
 *   GET /shipments/outboundShipments — pageSize default 50, maximum 100
 *   GET /orders/customerOrders — pageSize default 25, maximum 50
 *   GET /facilities — pageSize default 50, maximum 100
 *   Tag "Pagination": "To retrieve the next page of results, use the `href`
 *   value from the link where `rel` is `next`. When no `next` link is present
 *   or `complete` is `true`, all results have been retrieved." … "Don't
 *   construct the `next` URL manually or modify the `searchId` parameter.
 *   Always use the full `href` value returned in the response."
 *
 * The fake below honours only the documented query parameters of each list,
 * pages by its own opaque searchId, and answers only the documented paths.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import axios from 'axios'
import {
  _resetCursorPager,
  readUpstreamPage,
  withPageSink,
  type QueryParams,
} from '@opensteward/shared'
import { DeposcoAdapter } from '../../../../../../src/verticals/logistics/adapters/deposco/index'
import { ShipmentSchema } from '../../../../../../src/verticals/logistics/schema/shipment'
import { OrderSchema } from '../../../../../../src/verticals/logistics/schema/order'
import { WarehouseSchema } from '../../../../../../src/verticals/logistics/schema/warehouse'

const API = 'https://api.deposco.com/latest/'
const CREDS = {
  accessToken: 'tok-a',
  refreshToken: 'rt-a',
  extra: { clientId: 'cid', clientSecret: 'csec' },
}
const OTHER = {
  accessToken: 'tok-b',
  refreshToken: 'rt-b',
  extra: { clientId: 'cid', clientSecret: 'csec' },
}
const L = 5
const N = 2 * L + 1
const CALL_BUDGET = 80

type ListPath = 'shipments/outboundShipments' | 'orders/customerOrders' | 'facilities'

/** Documented query parameters and pageSize maximum of each list endpoint. */
const DOC: Record<ListPath, { keys: Set<string>; max: number; def: number }> = {
  'shipments/outboundShipments': {
    keys: new Set([
      'businessUnit',
      'searchId',
      'pageSize',
      'createdAfter',
      'updatedAfter',
      'shipmentNumber',
      'orderNumber',
      'customerOrderNumber',
      'shipmentStatus',
      'shippedAfter',
    ]),
    max: 100,
    def: 50,
  },
  'orders/customerOrders': {
    keys: new Set([
      'businessUnit',
      'searchId',
      'createdAfter',
      'updatedAfter',
      'pageSize',
      'externalOrderNumber',
      'tradingPartnerCode',
      'status',
    ]),
    max: 50,
    def: 25,
  },
  facilities: {
    keys: new Set([
      'businessUnit',
      'createdAfter',
      'updatedAfter',
      'searchId',
      'pageSize',
      'number',
      'name',
    ]),
    max: 100,
    def: 50,
  },
}

type Call = { token: string; url: string; params: Record<string, unknown> }

interface FakeOpts {
  /** Next links relative to the base (`/facilities?searchId=…`), as in the customer-order example. */
  relativeNext?: boolean
  /** The last page still carries a next link; only `complete: true` ends the walk. */
  nextOnLastPage?: boolean
  /** Omit `complete`; only the missing next link ends the walk. */
  omitComplete?: boolean
  /** Next links on this origin instead of the API's. */
  nextOrigin?: string
}

const T0 = Date.parse('2024-01-01T00:00:00Z')

function row(path: ListPath, token: string, i: number): Record<string, unknown> {
  const id = token === CREDS.accessToken ? i : 100_000 + i
  const updatedDate = new Date(T0 + i * 60_000).toISOString()
  if (path === 'shipments/outboundShipments')
    return { self: { id }, number: `OBS${id}`, status: 'New', updatedDate }
  if (path === 'orders/customerOrders')
    return { self: { id }, number: `CO${id}`, status: 'Open', updatedDate }
  return { self: { id }, number: `F${id}`, name: `Facility ${id}`, updatedDate }
}

function fakeDeposco(counts: Partial<Record<ListPath, number>>, opts: FakeOpts = {}) {
  const log: Call[] = []
  let calls = 0

  const enc = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url')
  const dec = (s: string) =>
    JSON.parse(Buffer.from(s, 'base64url').toString()) as {
      t: string
      p: string
      o: number
      s: number
      u?: string
    }

  const rowsFor = (path: ListPath, token: string, updatedAfter?: string) => {
    const n = counts[path] ?? 0
    // "paginated and sorted by ID in descending order"
    const all = Array.from({ length: n }, (_, k) => row(path, token, n - k))
    return updatedAfter
      ? all.filter((r) => Date.parse(r.updatedDate as string) > Date.parse(updatedAfter))
      : all
  }

  const getFor = (createToken: string) =>
    vi.fn(
      async (
        url: string,
        cfg?: { params?: Record<string, unknown>; headers?: Record<string, string> },
      ) => {
        // The token actually sent: the per-request header wins over the instance header, as in axios.
        const token = (cfg?.headers?.Authorization ?? `Bearer ${createToken}`).replace(
          /^Bearer /,
          '',
        )
        if (++calls > CALL_BUDGET) throw new Error(`call budget (${CALL_BUDGET}) exceeded`)
        const cfgParams = Object.fromEntries(
          Object.entries(cfg?.params ?? {}).filter(([, v]) => v !== undefined),
        )
        log.push({ token, url, params: cfgParams })

        let rel: string
        if (/^https?:/.test(url)) {
          if (!url.startsWith(API)) throw new Error(`request left the API origin: ${url}`)
          rel = url.slice(API.length)
        } else rel = url.replace(/^\//, '')
        const [path, qs] = rel.split('?') as [string, string | undefined]
        const params: Record<string, unknown> = {
          ...Object.fromEntries(new URLSearchParams(qs ?? '')),
          ...cfgParams,
        }

        // Single-resource GETs.
        const single =
          /^(shipments\/outboundShipments|orders\/customerOrders|facilities)\/(\d+)$/.exec(path)
        if (single) {
          const p = single[1] as ListPath
          const id = Number(single[2])
          const r = row(p, token, id)
          return { data: p === 'orders/customerOrders' ? { customerOrder: r, notices: [] } : r }
        }

        if (!(path in DOC)) throw new Error(`404: undocumented path ${path}`)
        const doc = DOC[path as ListPath]
        const bad = Object.keys(params).filter((k) => !doc.keys.has(k))
        if (bad.length) throw new Error(`400: undocumented params ${bad.join(',')} on ${path}`)

        let offset = 0
        let size: number
        let updatedAfter: string | undefined
        if (params.searchId !== undefined) {
          // "Other search-related parameters are overridden by this parameter."
          const c = dec(String(params.searchId))
          if (c.t !== token || c.p !== path) throw new Error('400: searchId from another search')
          offset = c.o
          size = c.s
          updatedAfter = c.u
        } else {
          size = params.pageSize === undefined ? doc.def : Number(params.pageSize)
          updatedAfter = params.updatedAfter as string | undefined
        }
        if (!(Number.isInteger(size) && size >= 1 && size <= doc.max))
          throw new Error(`400: pageSize ${size} on ${path}`)

        const rows = rowsFor(path as ListPath, token, updatedAfter)
        const page = rows.slice(offset, offset + size)
        const more = offset + size < rows.length
        const nextSearch = enc({ t: token, p: path, o: offset + size, s: size, u: updatedAfter })
        const href = opts.nextOrigin
          ? `${opts.nextOrigin}/latest/${path}?searchId=${nextSearch}`
          : opts.relativeNext
            ? `/${path}?pageSize=${size}&searchId=${nextSearch}`
            : `${API}${path}?searchId=${nextSearch}`
        const links = [
          { rel: 'self', href: `/${path}?pageSize=${size}` },
          ...(more || opts.nextOnLastPage ? [{ rel: 'next', href }] : []),
        ]
        return {
          data: {
            data: page,
            ...(opts.omitComplete ? {} : { complete: !more }),
            pages: Math.max(1, Math.ceil(rows.length / size)),
            links,
          },
        }
      },
    )

  const gets = new Map<string, ReturnType<typeof getFor>>()
  const getForToken = (token: string) => {
    let g = gets.get(token)
    if (!g) gets.set(token, (g = getFor(token)))
    return g
  }

  const create = vi.spyOn(axios, 'create').mockImplementation(((cfg: {
    baseURL: string
    headers: Record<string, string>
  }) => {
    if (cfg.baseURL !== 'https://api.deposco.com/latest') throw new Error(`base ${cfg.baseURL}`)
    return {
      get: getForToken(cfg.headers.Authorization!.replace(/^Bearer /, '')),
      post: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
      defaults: { headers: { common: {} as Record<string, string> } },
    }
  }) as never)

  return { log, create, get: getForToken(CREDS.accessToken) }
}

interface PageResult {
  ids: (string | undefined)[]
  hasMore: boolean | undefined
  pageSize: number | undefined
}

async function walk(
  call: (params: QueryParams) => Promise<{ id?: string }[]>,
  limit: number,
  extra: Partial<QueryParams> = {},
): Promise<PageResult[]> {
  const pages: PageResult[] = []
  for (let page = 1; page <= 20; page++) {
    const params = withPageSink({ page, limit, ...extra })
    const items = await call(params)
    const meta = readUpstreamPage(params)
    pages.push({ ids: items.map((i) => i.id), hasMore: meta?.hasMore, pageSize: meta?.pageSize })
    if (!meta?.hasMore) break
  }
  return pages
}

const idsDesc = (n: number, base = 0) => Array.from({ length: n }, (_, k) => String(base + n - k))

let adapter: DeposcoAdapter
beforeEach(() => {
  _resetCursorPager()
  adapter = new DeposcoAdapter()
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const LISTS = [
  {
    name: 'listShipments',
    path: 'shipments/outboundShipments' as const,
    call: (p: QueryParams) => adapter.listShipments(CREDS, p),
    schema: ShipmentSchema,
  },
  {
    name: 'listOrders',
    path: 'orders/customerOrders' as const,
    call: (p: QueryParams) => adapter.listOrders(CREDS, p),
    schema: OrderSchema,
  },
  {
    name: 'listWarehouses',
    path: 'facilities' as const,
    call: (p: QueryParams) => adapter.listWarehouses(CREDS, p),
    schema: WarehouseSchema,
  },
]

describe.each(LISTS)('deposco $name paging', ({ path, call, schema }) => {
  it(`walks ${N} rows at limit ${L}: every id once, hasMore exact, one request per page`, async () => {
    const fake = fakeDeposco({ [path]: N })
    const pages = await walk(call, L)
    expect(pages.map((p) => p.ids.length)).toEqual([L, L, 1])
    expect(pages.map((p) => p.hasMore)).toEqual([true, true, false])
    expect(pages.flatMap((p) => p.ids)).toEqual(idsDesc(N))
    expect(pages.every((p) => p.pageSize === undefined)).toBe(true)
    expect(fake.log).toHaveLength(3)
  })

  it('sends only pageSize on page 1 and follows the next href verbatim after it', async () => {
    const fake = fakeDeposco({ [path]: N })
    await walk(call, L)
    expect(fake.log[0]).toEqual({ token: 'tok-a', url: path, params: { pageSize: L } })
    for (const c of fake.log.slice(1)) {
      expect(c.url.startsWith(`${API}${path}?searchId=`)).toBe(true)
      expect(c.params).toEqual({})
    }
  })

  it('follows next hrefs relative to the base URL', async () => {
    const fake = fakeDeposco({ [path]: N }, { relativeNext: true })
    const pages = await walk(call, L)
    expect(pages.flatMap((p) => p.ids)).toEqual(idsDesc(N))
    expect(fake.log[1]!.url.startsWith(`/${path}?pageSize=${L}&searchId=`)).toBe(true)
  })

  it('ends on complete: true even when a next link is present', async () => {
    fakeDeposco({ [path]: N }, { nextOnLastPage: true })
    const pages = await walk(call, L)
    expect(pages.map((p) => p.hasMore)).toEqual([true, true, false])
    expect(pages.flatMap((p) => p.ids)).toEqual(idsDesc(N))
  })

  it('ends on a missing next link when complete is absent', async () => {
    fakeDeposco({ [path]: N }, { omitComplete: true })
    const pages = await walk(call, L)
    expect(pages.map((p) => p.hasMore)).toEqual([true, true, false])
  })

  it('reports hasMore false on an exact multiple without an extra page', async () => {
    const fake = fakeDeposco({ [path]: 2 * L })
    const pages = await walk(call, L)
    expect(pages.map((p) => p.hasMore)).toEqual([true, false])
    expect(fake.log).toHaveLength(2)
  })

  it('serves a page past the end as empty with hasMore false', async () => {
    fakeDeposco({ [path]: N })
    await walk(call, L)
    const params = withPageSink({ page: 9, limit: L })
    expect(await call(params)).toEqual([])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('passes updatedAfter as the documented ISO 8601 filter', async () => {
    const fake = fakeDeposco({ [path]: N })
    const updatedAfter = new Date(T0 + 4 * 60_000)
    const pages = await walk(call, L, { updatedAfter })
    expect(fake.log[0]!.params).toEqual({ pageSize: L, updatedAfter: updatedAfter.toISOString() })
    expect(pages.flatMap((p) => p.ids)).toEqual(idsDesc(N - 4, 4))
  })

  it('keeps two connections apart', async () => {
    const fake = fakeDeposco({ [path]: N })
    await call(withPageSink({ page: 1, limit: L }))
    const other = withPageSink({ page: 2, limit: L })
    const items =
      path === 'shipments/outboundShipments'
        ? await adapter.listShipments(OTHER, other)
        : path === 'orders/customerOrders'
          ? await adapter.listOrders(OTHER, other)
          : await adapter.listWarehouses(OTHER, other)
    expect(items.map((i) => i.id)).toEqual(idsDesc(N, 100_000).slice(L, 2 * L))
    expect(fake.log.filter((c) => c.token === 'tok-b').map((c) => c.url)[0]).toBe(path)
  })

  it('keeps an updatedAfter walk apart from an unfiltered walk on the same connection', async () => {
    const fake = fakeDeposco({ [path]: N })
    await call(withPageSink({ page: 1, limit: L })) // unfiltered: ids 11..7
    const updatedAfter = new Date(T0 + 4 * 60_000) // 7 rows match: ids 11..5
    const items = await call(withPageSink({ page: 2, limit: L, updatedAfter }))
    expect(items.map((i) => i.id)).toEqual(['6', '5'])
    // Page 2 of the filtered walk starts its own search rather than following
    // the unfiltered searchId.
    expect(fake.log[1]!.params).toEqual({ pageSize: L, updatedAfter: updatedAfter.toISOString() })
  })

  it('sends the documented default pageSize when the caller gives no limit', async () => {
    const fake = fakeDeposco({ [path]: 3 })
    const params = withPageSink({ page: 1 })
    await call(params)
    expect(fake.log[0]!.params).toEqual({ pageSize: DOC[path].def })
    expect(readUpstreamPage(params)).toEqual({ hasMore: false })
  })

  it('refuses a next link on another origin without sending the token there', async () => {
    const fake = fakeDeposco({ [path]: N }, { nextOrigin: 'https://evil.example' })
    await call(withPageSink({ page: 1, limit: L }))
    await expect(call(withPageSink({ page: 2, limit: L }))).rejects.toThrow(/another origin/)
    expect(fake.log).toHaveLength(1) // page 1 only; page 2 is refused before any request
    expect(fake.log.every((c) => c.url === path)).toBe(true)
  })

  it('returns rows that parse with the canonical schema', async () => {
    fakeDeposco({ [path]: 2 })
    const items = await call(withPageSink({ page: 1, limit: L }))
    expect(items).toHaveLength(2)
    for (const i of items) expect(() => schema.parse(i)).not.toThrow()
  })
})

describe('deposco page size clamps', () => {
  it('listOrders sends at most 50 (customerOrders pageSize maximum) and reports it', async () => {
    const fake = fakeDeposco({ 'orders/customerOrders': 120 })
    const params = withPageSink({ page: 1, limit: 80 })
    const items = await adapter.listOrders(CREDS, params)
    expect(items).toHaveLength(50)
    expect(fake.log[0]!.params).toEqual({ pageSize: 50 })
    expect(readUpstreamPage(params)).toEqual({ hasMore: true, pageSize: 50 })
  })

  it('listShipments and listWarehouses send at most 100 and report it past that', async () => {
    const fake = fakeDeposco({ 'shipments/outboundShipments': 150, facilities: 150 })
    const p1 = withPageSink({ page: 1, limit: 500 })
    expect(await adapter.listShipments(CREDS, p1)).toHaveLength(100)
    expect(readUpstreamPage(p1)).toEqual({ hasMore: true, pageSize: 100 })
    const p2 = withPageSink({ page: 1, limit: 500 })
    expect(await adapter.listWarehouses(CREDS, p2)).toHaveLength(100)
    expect(fake.log.map((c) => c.params.pageSize)).toEqual([100, 100])
  })

  it('declares the adapter-wide maximum of 100', () => {
    expect(adapter.capabilities.maxPageSize).toBe(100)
  })
})

describe('deposco get methods use the documented single-resource paths', () => {
  it('getShipment -> GET shipments/outboundShipments/{shipmentId}', async () => {
    const fake = fakeDeposco({})
    const s = await adapter.getShipment(CREDS, '7')
    expect(fake.log[0]!.url).toBe('shipments/outboundShipments/7')
    expect(s.id).toBe('7')
    expect(() => ShipmentSchema.parse(s)).not.toThrow()
  })

  it('getOrder -> GET orders/customerOrders/{orderId}, unwrapping customerOrder', async () => {
    const fake = fakeDeposco({})
    const o = await adapter.getOrder(CREDS, '7')
    expect(fake.log[0]!.url).toBe('orders/customerOrders/7')
    expect(o.id).toBe('7')
    expect(o.orderNumber).toBe('CO7')
    expect(() => OrderSchema.parse(o)).not.toThrow()
  })

  it('getWarehouse -> GET facilities/{facilityId}', async () => {
    const fake = fakeDeposco({})
    const w = await adapter.getWarehouse(CREDS, '7')
    expect(fake.log[0]!.url).toBe('facilities/7')
    expect(w.id).toBe('7')
    expect(() => WarehouseSchema.parse(w)).not.toThrow()
  })

  it('getOrder fails loudly when the response carries no customerOrder', async () => {
    const fake = fakeDeposco({})
    fake.get.mockResolvedValueOnce({ data: { notices: [] } } as never)
    await expect(adapter.getOrder(CREDS, '7')).rejects.toThrow(/no customerOrder/)
  })

  it('a listed id reads back through its get method', async () => {
    fakeDeposco({ 'shipments/outboundShipments': 3 })
    const [first] = await adapter.listShipments(CREDS, withPageSink({ page: 1, limit: L }))
    const again = await adapter.getShipment(CREDS, first!.id!)
    expect(again.id).toBe(first!.id)
  })
})

describe('deposco refuses what the API reference cannot list', () => {
  const REFUSALS: [string, () => Promise<unknown>, RegExp][] = [
    ['listCarriers', () => adapter.listCarriers(CREDS, { page: 1, limit: L }), /carriers/],
    ['getCarrier', () => adapter.getCarrier(CREDS, 'UPS'), /carriers/],
    [
      'listTrackingEvents',
      () => adapter.listTrackingEvents(CREDS, { page: 1, limit: L }),
      /tracking events/,
    ],
    ['getTrackingEvents', () => adapter.getTrackingEvents(CREDS, 'abc123'), /tracking events/],
    ['listLabels', () => adapter.listLabels(CREDS, { page: 1, limit: L }), /labels/],
    ['getLabel', () => adapter.getLabel(CREDS, '1'), /labels/],
  ]

  it.each(REFUSALS)('%s throws 501 NOT_SUPPORTED and sends nothing', async (_name, run, msg) => {
    const fake = fakeDeposco({ 'shipments/outboundShipments': N })
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    await expect(run()).rejects.toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
    await expect(run()).rejects.toThrow(msg)
    expect(fake.create).not.toHaveBeenCalled()
    expect(fake.get).not.toHaveBeenCalled()
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

describe('deposco auth: refresh-token grant', () => {
  function stubToken(
    body: Record<string, unknown> = { access_token: 'new-tok', expires_in: 3600 },
  ) {
    const fetchSpy = vi.fn(async (_url: string, _init: RequestInit) => ({
      ok: true,
      status: 200,
      json: async () => body,
      text: async () => JSON.stringify(body),
    }))
    vi.stubGlobal('fetch', fetchSpy)
    return fetchSpy
  }

  it('exchanges client ID, secret and refresh token exactly as documented', async () => {
    const fetchSpy = stubToken()
    const creds = await adapter.exchangeCredentials({
      clientId: ' cid ',
      clientSecret: 'csec',
      refreshToken: 'rt-1',
    })
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const [url, init] = fetchSpy.mock.calls[0]!
    expect(url).toBe('https://auth.deposco.com/oauth2/token')
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>)['Content-Type']).toBe(
      'application/x-www-form-urlencoded',
    )
    expect(Object.fromEntries(new URLSearchParams(String(init.body)))).toEqual({
      grant_type: 'refresh_token',
      refresh_token: 'rt-1',
      client_id: 'cid',
      client_secret: 'csec',
    })
    expect(creds.accessToken).toBe('new-tok')
    expect(creds.refreshToken).toBe('rt-1')
    expect(creds.extra).toEqual({ clientId: 'cid', clientSecret: 'csec' })
  })

  it('uses the documented one-hour lifetime when expires_in is absent', async () => {
    stubToken({ access_token: 'new-tok' })
    const before = Date.now()
    const creds = await adapter.exchangeCredentials({
      clientId: 'cid',
      clientSecret: 'csec',
      refreshToken: 'rt-1',
    })
    const ms = creds.expiresAt!.getTime() - before
    expect(ms).toBeGreaterThanOrEqual(3600_000 - 1000)
    expect(ms).toBeLessThanOrEqual(3600_000 + 1000)
  })

  it('asks for the refresh token in the credential form, not a tenant code', () => {
    const names = adapter.credentialFields().map((f) => f.name)
    expect(names).toEqual(['clientId', 'clientSecret', 'refreshToken'])
  })

  it('refreshes an expired token with the stored refresh token before a request', async () => {
    const fetchSpy = stubToken()
    const fake = fakeDeposco({ facilities: 1 })
    const expired = { ...CREDS, expiresAt: new Date(Date.now() - 1000) }
    await adapter.listWarehouses(expired, withPageSink({ page: 1, limit: L }))
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const body = Object.fromEntries(new URLSearchParams(String(fetchSpy.mock.calls[0]![1].body)))
    expect(body).toEqual({
      grant_type: 'refresh_token',
      refresh_token: 'rt-a',
      client_id: 'cid',
      client_secret: 'csec',
    })
    // The request after the refresh carries the new token, not the expired one.
    expect(fake.log.map((c) => c.token)).toEqual(['new-tok'])
  })

  it('sends the refreshed token through real axios header merging', async () => {
    // No axios.create mock here: the instance is real, and only its transport
    // is replaced, so the header seen is the one axios actually sends.
    stubToken()
    const sent: unknown[] = []
    const original = axios.defaults.adapter
    axios.defaults.adapter = async (config) => {
      sent.push(config.headers?.Authorization)
      return {
        data: { data: [], complete: true, links: [] },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      }
    }
    try {
      const expired = { ...CREDS, expiresAt: new Date(Date.now() - 1000) }
      await adapter.listWarehouses(expired, withPageSink({ page: 1, limit: L }))
    } finally {
      axios.defaults.adapter = original
    }
    expect(sent).toEqual(['Bearer new-tok'])
  })

  it('keeps the expires_in the token response gives', async () => {
    stubToken({ access_token: 'new-tok', expires_in: 120 })
    const before = Date.now()
    const creds = await adapter.exchangeCredentials({
      clientId: 'cid',
      clientSecret: 'csec',
      refreshToken: 'rt-1',
    })
    const ms = creds.expiresAt!.getTime() - before
    expect(ms).toBeGreaterThanOrEqual(120_000 - 1000)
    expect(ms).toBeLessThanOrEqual(120_000 + 1000)
  })

  it('fails when the token response carries no access_token', async () => {
    stubToken({ expires_in: 3600 })
    await expect(
      adapter.exchangeCredentials({ clientId: 'cid', clientSecret: 'csec', refreshToken: 'rt-1' }),
    ).rejects.toThrow(/no access_token/)
  })

  it('requires the refresh token in the credential form and sends nothing without it', async () => {
    const fetchSpy = stubToken()
    await expect(
      adapter.exchangeCredentials({ clientId: 'cid', clientSecret: 'csec', refreshToken: ' ' }),
    ).rejects.toThrow('Refresh token is required.')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('exchangeCode reads "clientId:clientSecret:refreshToken", keeping colons in the token', async () => {
    const fetchSpy = stubToken()
    const creds = await adapter.exchangeCode('cid:csec:rt:with:colons', 'https://cb.example')
    const body = Object.fromEntries(new URLSearchParams(String(fetchSpy.mock.calls[0]![1].body)))
    expect(body).toEqual({
      grant_type: 'refresh_token',
      refresh_token: 'rt:with:colons',
      client_id: 'cid',
      client_secret: 'csec',
    })
    expect(creds.refreshToken).toBe('rt:with:colons')
  })

  it('exchangeCode refuses a code without a refresh token and sends nothing', async () => {
    const fetchSpy = stubToken()
    await expect(adapter.exchangeCode('cid:csec', 'https://cb.example')).rejects.toThrow(
      /clientId:clientSecret:refreshToken/,
    )
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('tells an old tenant-code connection to reconnect instead of guessing', async () => {
    stubToken()
    await expect(
      adapter.refreshCredentials({
        accessToken: 'old',
        extra: { clientId: 'cid', clientSecret: 'csec', tenantCode: 'ACME' },
      }),
    ).rejects.toThrow(/Reconnect/)
  })
})
