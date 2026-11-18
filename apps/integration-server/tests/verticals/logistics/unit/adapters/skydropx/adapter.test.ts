/**
 * Skydropx PRO API: host, auth, request shapes and list paging.
 *
 * Every endpoint below is from the first-party OpenAPI,
 * https://pro.skydropx.com/es-MX/api-docs.json (servers: api-pro.skydropx.com):
 *
 * - GET /api/v1/shipments: `page` and `ids` only, "paginados de diez en diez",
 *   meta { current_page, next_page, prev_page, total_pages, total_count }.
 * - GET /api/v1/shipments/carrier_services: `page`, `per_page` ("máx 20").
 * - GET /api/v1/shipments/tracking: tracking_number and carrier_name, both required.
 * - POST /api/v1/oauth/token: grant_type=client_credentials, form-encoded.
 *
 * The fake honours ONLY those parameters and refuses anything else.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import {
  _resetRowPager,
  listPage,
  readUpstreamPage,
  withPageSink,
  type QueryParams,
} from '@opensteward/shared'
import { SkydropxAdapter } from '../../../../../../src/verticals/logistics/adapters/skydropx/index'
import type { SkydropxIncluded } from '../../../../../../src/verticals/logistics/adapters/skydropx/transform/shipment'
import type { SkydropxCarrierService } from '../../../../../../src/verticals/logistics/adapters/skydropx/transform/carrier'
import {
  docAddress,
  docCarrierService,
  docPackage,
  docShipment,
  docTrackingEvent,
} from './fixtures'
import { ShipmentSchema } from '../../../../../../src/verticals/logistics/schema/shipment'
import { LabelSchema } from '../../../../../../src/verticals/logistics/schema/label'
import { CarrierSchema } from '../../../../../../src/verticals/logistics/schema/carrier'
import { TrackingEventSchema } from '../../../../../../src/verticals/logistics/schema/trackingevent'

const CREDS = { accessToken: 'tok_1', extra: { clientId: 'cid', clientSecret: 'csec' } }
const SHIPMENTS_PER_PAGE = 10
const SERVICES_MAX = 20
const CALL_BUDGET = 60

interface Call {
  path: string
  params: Record<string, unknown>
}

interface FakeOpts {
  /** Per shipment: how many packages, and which of them have a label_url. */
  shipments?: { packages: number; labelled?: number[] }[]
  services?: SkydropxCarrierService[]
  tracking?: { status: number; data?: unknown[] }
  /** Overrides meta.next_page, to model an upstream whose chain misbehaves. */
  nextPage?: (path: string, page: number) => number | null
}

function fakeSkydropx(opts: FakeOpts) {
  const shipments = (opts.shipments ?? []).map((spec, i) => {
    const id = `S${String(i + 1).padStart(3, '0')}`
    const pkgIds = Array.from({ length: spec.packages }, (_, j) => `${id}-P${j + 1}`)
    const labelled = spec.labelled ?? pkgIds.map((_, j) => j)
    const packages = pkgIds.map((pid, j) =>
      docPackage(pid, id, {
        tracking_number: `${pid}-T`,
        label_url: labelled.includes(j) ? `https://labels.example/${pid}.pdf` : null,
      }),
    )
    return {
      shipment: docShipment(id, pkgIds),
      included: [
        ...packages,
        docAddress(`${id}-from`, 'from'),
        docAddress(`${id}-to`, 'to'),
      ] as SkydropxIncluded[],
    }
  })
  const services = opts.services ?? []
  const calls: Call[] = []
  const get = vi.fn(async (path: string, cfg?: { params?: Record<string, unknown> }) => {
    if (calls.length >= CALL_BUDGET) throw new Error('call budget exceeded')
    const params = { ...(cfg?.params ?? {}) }
    calls.push({ path, params })
    const refuse = (allowed: string[]) => {
      const extra = Object.keys(params).filter((k) => !allowed.includes(k))
      if (extra.length) throw new Error(`undocumented params sent to ${path}: ${extra.join(',')}`)
    }
    if (path === 'shipments') {
      refuse(['page', 'ids'])
      const page = params['page'] === undefined ? 1 : Number(params['page'])
      if (!Number.isInteger(page) || page < 1)
        throw new Error(`400: page ${String(params['page'])}`)
      const total = shipments.length
      const totalPages = Math.max(1, Math.ceil(total / SHIPMENTS_PER_PAGE))
      const slice = shipments.slice((page - 1) * SHIPMENTS_PER_PAGE, page * SHIPMENTS_PER_PAGE)
      return {
        data: {
          data: slice.map((s) => s.shipment),
          included: slice.flatMap((s) => s.included),
          meta: {
            current_page: page,
            next_page: opts.nextPage
              ? opts.nextPage(path, page)
              : page < totalPages
                ? page + 1
                : null,
            prev_page: page > 1 ? page - 1 : null,
            total_pages: totalPages,
            total_count: total,
          },
        },
      }
    }
    if (path === 'shipments/carrier_services') {
      refuse(['page', 'per_page'])
      const page = params['page'] === undefined ? 1 : Number(params['page'])
      const per = params['per_page'] === undefined ? 20 : Number(params['per_page'])
      if (!Number.isInteger(per) || per < 1 || per > SERVICES_MAX)
        throw new Error(`400: per_page ${String(params['per_page'])}`)
      const totalPages = Math.max(1, Math.ceil(services.length / per))
      return {
        data: {
          data: services.slice((page - 1) * per, page * per),
          meta: {
            current_page: page,
            next_page: opts.nextPage
              ? opts.nextPage(path, page)
              : page < totalPages
                ? page + 1
                : null,
            prev_page: page > 1 ? page - 1 : null,
            total_pages: totalPages,
            total_count: services.length,
          },
        },
      }
    }
    if (path === 'shipments/tracking') {
      refuse(['tracking_number', 'carrier_name'])
      const t = opts.tracking ?? { status: 200, data: [] }
      if (t.status !== 200)
        throw Object.assign(new Error(`HTTP ${t.status}`), {
          response: {
            status: t.status,
            data: { error: 'Este número de guía no cuenta con eventos de rastreo' },
          },
        })
      return { data: { data: t.data } }
    }
    const m = /^shipments\/([^/]+)$/.exec(path)
    if (m) {
      refuse([])
      const s = shipments.find((x) => x.shipment.id === decodeURIComponent(m[1]!))
      if (!s) throw Object.assign(new Error('404'), { response: { status: 404 } })
      return { data: { data: s.shipment, included: s.included } }
    }
    throw new Error(`unexpected path ${path}`)
  })
  const create = vi.spyOn(axios, 'create').mockReturnValue({
    get,
    post: vi.fn(async () => {
      throw new Error('no POST expected')
    }),
    defaults: { headers: { common: {} } },
  } as never)
  return { calls, create }
}

const adapter = () => new SkydropxAdapter()
const sIds = (from: number, count: number) =>
  Array.from({ length: count }, (_, i) => `S${String(from + i).padStart(3, '0')}`)

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  _resetRowPager()
})

async function walk<T>(
  list: (p: QueryParams) => Promise<T[]>,
  limit: number,
  pages: number,
  id: (t: T) => string,
) {
  const seen: string[] = []
  const hasMore: (boolean | null | undefined)[] = []
  const reported: (boolean | undefined)[] = []
  for (let k = 1; k <= pages; k++) {
    const params = withPageSink({ page: k, limit })
    const env = listPage(await list(params), params, 'skydropx')
    seen.push(...env.data.map(id))
    hasMore.push(env.meta.hasMore)
    reported.push(readUpstreamPage(params)?.hasMore)
  }
  return { seen, hasMore, reported }
}

describe('skydropx client: PRO host and bearer auth', () => {
  it('calls api-pro.skydropx.com/api/v1/ with the bearer token', async () => {
    const { create } = fakeSkydropx({ shipments: [{ packages: 1 }] })
    await adapter().listShipments(CREDS, withPageSink({ page: 1, limit: 5 }))
    const cfg = create.mock.calls[0]![0] as { baseURL: string; headers: Record<string, string> }
    expect(cfg.baseURL).toBe('https://api-pro.skydropx.com/api/v1/')
    expect(cfg.headers['Authorization']).toBe('Bearer tok_1')
  })

  it('exchangeCredentials mints a token by client_credentials at /api/v1/oauth/token', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            access_token: 'new_tok',
            token_type: 'Bearer',
            expires_in: 7200,
            scope: 'default',
            created_at: 1,
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
    )
    vi.stubGlobal('fetch', fetchMock)
    const creds = await adapter().exchangeCredentials!({ clientId: 'cid', clientSecret: 'csec' })
    expect(creds.accessToken).toBe('new_tok')
    expect(creds.extra).toEqual({ clientId: 'cid', clientSecret: 'csec' })
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api-pro.skydropx.com/api/v1/oauth/token')
    expect(new URLSearchParams(String(init.body)).get('grant_type')).toBe('client_credentials')
    expect(new URLSearchParams(String(init.body)).get('client_id')).toBe('cid')
  })

  it('the token request is form-encoded, as the docs show, and expiresAt is expires_in SECONDS from now', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ access_token: 't', expires_in: 7200 }), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const before = Date.now()
    const creds = await adapter().exchangeCredentials!({ clientId: 'cid', clientSecret: 'csec' })
    const init = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1]
    expect((init.headers as Record<string, string>)['Content-Type']).toBe(
      'application/x-www-form-urlencoded',
    )
    const ms = new Date(creds.expiresAt!).getTime() - before
    expect(ms).toBeGreaterThanOrEqual(7200 * 1000 - 1000)
    expect(ms).toBeLessThanOrEqual(7200 * 1000 + 5000)
  })

  it('exchangeCode reads a "clientId:clientSecret" code, keeping any colon in the secret', async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ access_token: 't' }), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)
    await adapter().exchangeCode('cid:se:cret', 'https://unused')
    const body = new URLSearchParams(
      String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body),
    )
    expect(body.get('client_id')).toBe('cid')
    expect(body.get('client_secret')).toBe('se:cret')
  })

  it('refreshCredentials re-runs client_credentials from the stored client', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ access_token: 'tok_2', expires_in: 7200 }), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const creds = await adapter().refreshCredentials(CREDS)
    expect(creds.accessToken).toBe('tok_2')
    const body = new URLSearchParams(
      String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body),
    )
    expect(body.get('client_secret')).toBe('csec')
  })

  it('refreshCredentials refuses legacy API-key credentials instead of returning them unchanged', async () => {
    await expect(adapter().refreshCredentials({ accessToken: 'legacy_key' })).rejects.toThrow(
      /reconnect/,
    )
  })
})

describe('skydropx listShipments (fixed 10-row upstream pages)', () => {
  const list = (p: QueryParams) => adapter().listShipments(CREDS, p)

  it('with 2L+1 rows over uneven upstream pages (10 + 5), pages 1..3 serve every id once, hasMore exact', async () => {
    const L = 7
    fakeSkydropx({ shipments: Array.from({ length: 2 * L + 1 }, () => ({ packages: 1 })) })
    const r = await walk(list, L, 3, (s) => s.id!)
    expect(r.seen).toEqual(sIds(1, 2 * L + 1))
    expect(r.hasMore).toEqual([true, true, false])
    expect(r.reported).toEqual([true, true, false])
  })

  it('sends only the documented page parameter', async () => {
    const { calls } = fakeSkydropx({
      shipments: Array.from({ length: 25 }, () => ({ packages: 1 })),
    })
    await list(withPageSink({ page: 2, limit: 10 }))
    expect(
      calls.every((c) => c.path === 'shipments' && Object.keys(c.params).join() === 'page'),
    ).toBe(true)
    expect(calls.map((c) => c.params['page'])).toContain(2)
  })

  it('a limit above 10 is filled from several upstream pages', async () => {
    fakeSkydropx({ shipments: Array.from({ length: 25 }, () => ({ packages: 1 })) })
    const params = withPageSink({ page: 1, limit: 25 })
    const out = await list(params)
    expect(out.map((s) => s.id)).toEqual(sIds(1, 25))
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('an empty account is one empty page', async () => {
    fakeSkydropx({ shipments: [] })
    const params = withPageSink({ page: 1, limit: 5 })
    expect(await list(params)).toEqual([])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('a next_page that does not advance ends the walk instead of refetching the same page', async () => {
    const { calls } = fakeSkydropx({
      shipments: Array.from({ length: 5 }, () => ({ packages: 1 })),
      nextPage: (_path, page) => page,
    })
    const params = withPageSink({ page: 1, limit: 10 })
    expect((await list(params)).map((s) => s.id)).toEqual(sIds(1, 5))
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
    expect(calls).toHaveLength(1)
  })

  it('an empty page that still names a next_page ends the walk', async () => {
    const { calls } = fakeSkydropx({ shipments: [], nextPage: (_path, page) => page + 1 })
    const params = withPageSink({ page: 1, limit: 5 })
    expect(await list(params)).toEqual([])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
    expect(calls).toHaveLength(1)
  })

  it('getShipment reads GET shipments/{id}', async () => {
    const { calls } = fakeSkydropx({ shipments: [{ packages: 1 }, { packages: 1 }] })
    const s = ShipmentSchema.parse(await adapter().getShipment(CREDS, 'S002'))
    expect(s.id).toBe('S002')
    expect(calls).toEqual([{ path: 'shipments/S002', params: {} }])
  })
})

describe('skydropx listLabels (package label_url flattened from shipment pages)', () => {
  const list = (p: QueryParams) => adapter().listLabels(CREDS, p)

  it('with 2L+1 labels spread unevenly over shipments and pages, every label once, hasMore exact', async () => {
    const L = 4
    // 12 shipments: two upstream pages (10 + 2). Labels: 0,2,1,0,1,0,0,2,0,1 | 1,1 = 9 = 2L+1.
    const per = [0, 2, 1, 0, 1, 0, 0, 2, 0, 1, 1, 1]
    fakeSkydropx({
      shipments: per.map((n) => ({
        packages: Math.max(n, 1),
        labelled: n === 0 ? [] : [...Array(n).keys()],
      })),
    })
    const r = await walk(list, L, 3, (l) => l.id!)
    expect(r.seen).toEqual([
      'S002-P1',
      'S002-P2',
      'S003-P1',
      'S005-P1',
      'S008-P1',
      'S008-P2',
      'S010-P1',
      'S011-P1',
      'S012-P1',
    ])
    expect(new Set(r.seen).size).toBe(2 * L + 1)
    expect(r.hasMore).toEqual([true, true, false])
    expect(r.reported).toEqual([true, true, false])
  })

  it('labels and shipments keep separate pager positions on one connection', async () => {
    // Labels on S002 (2), S005 (1), S009 (1), S011 (1): 5 labels over 11 shipments.
    const per = [0, 2, 0, 0, 1, 0, 0, 0, 1, 0, 1]
    fakeSkydropx({
      shipments: per.map((n) => ({
        packages: Math.max(n, 1),
        labelled: n === 0 ? [] : [...Array(n).keys()],
      })),
    })
    const a = adapter()
    const s2 = await a.listShipments(CREDS, withPageSink({ page: 2, limit: 3 }))
    expect(s2.map((s) => s.id)).toEqual(sIds(4, 3))
    const l2 = await a.listLabels(CREDS, withPageSink({ page: 2, limit: 3 }))
    expect(l2.map((l) => l.id)).toEqual(['S009-P1', 'S011-P1'])
    const s3 = await a.listShipments(CREDS, withPageSink({ page: 3, limit: 3 }))
    expect(s3.map((s) => s.id)).toEqual(sIds(7, 3))
  })

  it('labels carry the shipment id, tracking number and absolute url', async () => {
    fakeSkydropx({ shipments: [{ packages: 1 }] })
    const [l] = await list(withPageSink({ page: 1, limit: 5 }))
    expect(LabelSchema.parse(l)).toMatchObject({
      id: 'S001-P1',
      shipmentId: 'S001',
      trackingNumber: 'S001-P1-T',
      url: 'https://labels.example/S001-P1.pdf',
    })
  })

  it('getLabel refuses with 501 and sends no request', async () => {
    const { calls } = fakeSkydropx({})
    await expect(adapter().getLabel(CREDS, 'S001-P1')).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
    })
    expect(calls).toEqual([])
  })
})

describe('skydropx listCarriers (carrier_services catalogue, grouped by carrier)', () => {
  const list = (p: QueryParams) => adapter().listCarriers(CREDS, p)

  it('walks every carrier_services page at per_page=20, groups, and pages 2L+1 carriers exactly', async () => {
    const L = 2
    // 45 services over 3 upstream pages; carrier C3 straddles pages 1 and 2.
    const names = ['C1', 'C2', 'C3', 'C4', 'C5']
    const counts = [8, 8, 9, 10, 10]
    const services = names.flatMap((n, i) =>
      Array.from({ length: counts[i]! }, (_, j) =>
        docCarrierService({
          carrier_name: n,
          service_code: `${n}-s${j + 1}`,
          service_name: `${n} ${j + 1}`,
        }),
      ),
    )
    const { calls } = fakeSkydropx({ services })
    const r = await walk(list, L, 3, (c) => c.id!)
    expect(r.seen).toEqual(names)
    expect(r.hasMore).toEqual([true, true, false])
    expect(r.reported).toEqual([true, true, false])
    expect(calls.every((c) => c.params['per_page'] === SERVICES_MAX)).toBe(true)
    expect(calls.slice(0, 3).map((c) => c.params['page'])).toEqual([1, 2, 3])
    const [c3] = await list(withPageSink({ page: 3, limit: 1 }))
    expect(CarrierSchema.parse(c3).id).toBe('C3')
    expect(c3!.services).toHaveLength(9)
  })
})

describe('skydropx listCarriers: chain guards', () => {
  it('an empty carrier_services page that still names a next_page ends the walk', async () => {
    const { calls } = fakeSkydropx({ services: [], nextPage: (_path, page) => page + 1 })
    expect(await adapter().listCarriers(CREDS, withPageSink({ page: 1, limit: 5 }))).toEqual([])
    expect(calls).toHaveLength(1)
  })
})

describe('skydropx tracking', () => {
  it('listTrackingEvents refuses with 501 NOT_SUPPORTED and sends no request', async () => {
    const { calls } = fakeSkydropx({ shipments: [{ packages: 1 }] })
    await expect(
      adapter().listTrackingEvents(CREDS, withPageSink({ page: 1, limit: 5 })),
    ).rejects.toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
    expect(calls).toEqual([])
  })

  it('getTrackingEvents without a carrier refuses with 501 and sends no request', async () => {
    const { calls } = fakeSkydropx({})
    await expect(adapter().getTrackingEvents(CREDS, '234234234233')).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
    })
    expect(calls).toEqual([])
  })

  it('getTrackingEvents sends tracking_number and carrier_name to shipments/tracking', async () => {
    const { calls } = fakeSkydropx({ tracking: { status: 200, data: [docTrackingEvent()] } })
    const events = await adapter().getTrackingEvents(CREDS, '234234234233', 'fedex')
    expect(calls).toEqual([
      {
        path: 'shipments/tracking',
        params: { tracking_number: '234234234233', carrier_name: 'fedex' },
      },
    ])
    expect(events).toHaveLength(1)
    expect(TrackingEventSchema.parse(events[0])).toMatchObject({
      status: 'OUT_FOR_DELIVERY',
      carrierId: 'fedex',
    })
  })

  it('a documented 404 ("no cuenta con eventos de rastreo") is no events', async () => {
    fakeSkydropx({ tracking: { status: 404 } })
    expect(await adapter().getTrackingEvents(CREDS, 'T', 'fedex')).toEqual([])
  })

  it('other errors propagate', async () => {
    fakeSkydropx({ tracking: { status: 500 } })
    await expect(adapter().getTrackingEvents(CREDS, 'T', 'fedex')).rejects.toThrow(/500/)
  })
})
