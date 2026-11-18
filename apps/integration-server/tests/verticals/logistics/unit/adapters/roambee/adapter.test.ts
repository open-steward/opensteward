/**
 * Roambee (now Decklar) reads, against https://docs.decklar.com/ (Redoc with
 * the OpenAPI spec embedded):
 *   servers: "https://api.decklar.com" "Production environment"
 *   every operation: { name: "apiKey", in: "header", description: "Key to authenticate" }
 *   GET /v2/shipment "Get List of Shipments": $filter, $size ("Maximum value
 *     can be 100"), $offset ("Calculated as (desired_page_num - 1) * size"),
 *     $fields; response { offset, size, total, data: [...] }
 *   GET /v2/shipment/summary "Get Shipment Details": uuid (query, required)
 *   POST /shipment/alerts "Get Alert for Shipment": body { sid }
 *
 * The fake below honours only those parameters, and answers only the
 * documented host and header.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import axios from 'axios'
import { _resetCursorPager, readUpstreamPage, withPageSink } from '@opensteward/shared'
import { RoambeeAdapter } from '../../../../../../src/verticals/logistics/adapters/roambee/index'
import { ShipmentSchema } from '../../../../../../src/verticals/logistics/schema/shipment'
import { TrackingEventSchema } from '../../../../../../src/verticals/logistics/schema/trackingevent'

const CREDS = { accessToken: 'decklar_key' }
const OTHER = { accessToken: 'decklar_other_key' }
const L = 5
const N = 2 * L + 1

const LIST_PARAMS = new Set(['$filter', '$size', '$offset', '$fields'])

interface Call {
  method: 'get' | 'post'
  path: string
  key: string
  params?: Record<string, unknown>
  body?: unknown
}

/**
 * A fake Decklar with `shipments` shipments per API key; shipment i has
 * `alertsPer(i)` alerts. The default $size is the documented 10.
 */
function fakeDecklar(
  shipments: number,
  alertsPer: (i: number) => number = () => 1,
  patchRow: (i: number) => Record<string, unknown> = () => ({}),
) {
  const calls: Call[] = []
  const rowsFor = (key: string) =>
    Array.from({ length: shipments }, (_, i) => ({
      uuid: `${key}-shp-${i + 1}`,
      shipment_id: i + 1,
      shipment_status: 'not started',
      created_date_timestamp: 1631112242000,
      ...patchRow(i),
    }))

  vi.spyOn(axios, 'create').mockImplementation(((cfg: {
    baseURL?: string
    headers?: Record<string, string>
  }) => {
    if (cfg.baseURL !== 'https://api.decklar.com/') throw new Error(`host ${cfg.baseURL}`)
    const key = cfg.headers?.apiKey
    if (!key) throw new Error('401: No API key found in request')
    if (cfg.headers && 'Authorization' in cfg.headers)
      throw new Error('undocumented Authorization header')
    return {
      get: vi.fn(async (path: string, c?: { params?: Record<string, unknown> }) => {
        const params = c?.params ?? {}
        calls.push({ method: 'get', path, key, params })
        if (path === 'v2/shipment') {
          const bad = Object.keys(params).filter((k) => !LIST_PARAMS.has(k))
          if (bad.length) throw new Error(`400: undocumented params ${bad.join(',')}`)
          const size = params.$size === undefined ? 10 : Number(params.$size)
          if (size > 100) throw new Error('400: $size above 100')
          const offset = params.$offset === undefined ? 0 : Number(params.$offset)
          const all = rowsFor(key)
          return {
            data: { offset, size, total: all.length, data: all.slice(offset, offset + size) },
          }
        }
        if (path === 'v2/shipment/summary') {
          const bad = Object.keys(params).filter((k) => k !== 'uuid')
          if (bad.length || !params.uuid) throw new Error('400: summary takes uuid only')
          return { data: { name: 'Shipment Name', created_date: 1612868387, description: 'x' } }
        }
        throw new Error(`unexpected GET ${path}`)
      }),
      post: vi.fn(async (path: string, body: unknown) => {
        calls.push({ method: 'post', path, key, body })
        if (path !== 'shipment/alerts') throw new Error(`unexpected POST ${path}`)
        const b = body as Record<string, unknown>
        if (Object.keys(b).join() !== 'sid') throw new Error('400: alerts take { sid }')
        const i = Number(String(b.sid).split('-shp-')[1]) - 1
        return {
          data: Array.from({ length: alertsPer(i) }, (_, k) => ({
            event: 'MOVING',
            short_message: 'is moving',
            reported_on: 1613062539 + k,
            address: 'Somewhere',
          })),
        }
      }),
    }
  }) as never)
  return calls
}

beforeEach(() => _resetCursorPager())
afterEach(() => vi.restoreAllMocks())

describe('Roambee capabilities', () => {
  it('declares the documented $size maximum of 100 as maxPageSize', () => {
    expect(new RoambeeAdapter().capabilities.maxPageSize).toBe(100)
  })
})

describe('Roambee listShipments', () => {
  it('sends the caller page as $size/$offset on GET /v2/shipment with the apiKey header', async () => {
    const calls = fakeDecklar(3 * L)
    const out = await new RoambeeAdapter().listShipments(CREDS, { page: 2, limit: L })
    expect(calls).toEqual([
      { method: 'get', path: 'v2/shipment', key: 'decklar_key', params: { $size: L, $offset: L } },
    ])
    expect(out.map((s) => s.id)).toEqual(
      Array.from({ length: L }, (_, i) => `decklar_key-shp-${L + i + 1}`),
    )
    for (const s of out) ShipmentSchema.parse(s)
  })

  it(`walks N = ${N} shipments at limit ${L}: every id once, hasMore exact, total reported`, async () => {
    fakeDecklar(N)
    const adapter = new RoambeeAdapter()
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (let page = 1; page <= 3; page++) {
      const params = withPageSink({ page, limit: L })
      const rows = await adapter.listShipments(CREDS, params)
      seen.push(...rows.map((r) => r.id!))
      const meta = readUpstreamPage(params)
      more.push(meta?.hasMore)
      expect(meta?.totalCount).toBe(N)
    }
    expect(seen).toEqual(Array.from({ length: N }, (_, i) => `decklar_key-shp-${i + 1}`))
    expect(more).toEqual([true, true, false])
  })

  it('reports hasMore false when the last page ends exactly on total', async () => {
    fakeDecklar(2 * L)
    const params = withPageSink({ page: 2, limit: L })
    await new RoambeeAdapter().listShipments(CREDS, params)
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('clamps $size to the documented 100 and reports the size sent', async () => {
    const calls = fakeDecklar(250)
    const params = withPageSink({ page: 2, limit: 250 })
    const out = await new RoambeeAdapter().listShipments(CREDS, params)
    expect(calls[0]!.params).toEqual({ $size: 100, $offset: 100 })
    expect(out).toHaveLength(100)
    expect(readUpstreamPage(params)).toMatchObject({
      pageSize: 100,
      hasMore: true,
      totalCount: 250,
    })
  })

  it('throws when rows come back with no total, the documented end signal', async () => {
    vi.spyOn(axios, 'create').mockImplementation((() => ({
      get: vi.fn(async () => ({ data: { data: [{ uuid: 'u1' }] } })),
      post: vi.fn(),
    })) as never)
    await expect(new RoambeeAdapter().listShipments(CREDS, { page: 1, limit: L })).rejects.toThrow(
      /no total/,
    )
  })

  it('ends the list on an empty page', async () => {
    vi.spyOn(axios, 'create').mockImplementation((() => ({
      get: vi.fn(async () => ({ data: { data: [] } })),
      post: vi.fn(),
    })) as never)
    const params = withPageSink({ page: 3, limit: L })
    expect(await new RoambeeAdapter().listShipments(CREDS, params)).toEqual([])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })
})

describe('Roambee getShipment', () => {
  it('reads GET /v2/shipment/summary?uuid= and returns the uuid as id', async () => {
    const calls = fakeDecklar(1)
    const s = await new RoambeeAdapter().getShipment(CREDS, 'abc-uuid')
    expect(calls).toEqual([
      {
        method: 'get',
        path: 'v2/shipment/summary',
        key: 'decklar_key',
        params: { uuid: 'abc-uuid' },
      },
    ])
    expect(ShipmentSchema.parse(s).id).toBe('abc-uuid')
  })
})

describe('Roambee getTrackingEvents', () => {
  it('POSTs { sid } to /shipment/alerts', async () => {
    const calls = fakeDecklar(2, () => 2)
    const events = await new RoambeeAdapter().getTrackingEvents(CREDS, 'decklar_key-shp-2')
    expect(calls).toEqual([
      {
        method: 'post',
        path: 'shipment/alerts',
        key: 'decklar_key',
        body: { sid: 'decklar_key-shp-2' },
      },
    ])
    expect(events).toHaveLength(2)
    for (const e of events) {
      TrackingEventSchema.parse(e)
      expect(e.shipmentId).toBe('decklar_key-shp-2')
    }
  })
})

describe('Roambee listTrackingEvents', () => {
  // Alerts per shipment cycle 0, 3, 1, 2: uneven, with empty shipments, and
  // spread over more than one 10-shipment upstream page.
  const cycle = [0, 3, 1, 2]
  const per = (i: number) => cycle[i % cycle.length]!
  const shipments = 14 // 3+1+2 per 4 shipments: 21 alerts in 14 shipments
  const total = Array.from({ length: shipments }, (_, i) => per(i)).reduce((a, b) => a + b, 0)

  it(`walks every event once at limit ${L}, hasMore exact`, async () => {
    expect(total).toBeGreaterThan(2 * L + 1)
    fakeDecklar(shipments, per)
    const adapter = new RoambeeAdapter()
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    const pages = Math.ceil(total / L)
    for (let page = 1; page <= pages; page++) {
      const params = withPageSink({ page, limit: L })
      const rows = await adapter.listTrackingEvents(CREDS, params)
      expect(rows.length).toBe(page < pages ? L : total - L * (pages - 1))
      for (const r of rows) TrackingEventSchema.parse(r)
      seen.push(...rows.map((r) => r.id!))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(new Set(seen).size).toBe(total)
    expect(seen).toHaveLength(total)
    expect(more).toEqual([...Array(pages - 1).fill(true), false])
  })

  it(`walks N = ${N} events: a page ending on an upstream boundary peeks for hasMore`, async () => {
    // 11 shipments of 1 alert: shipments 1-10 are upstream page 1, 11 is page 2.
    fakeDecklar(N, () => 1)
    const adapter = new RoambeeAdapter()
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (let page = 1; page <= 3; page++) {
      const params = withPageSink({ page, limit: L })
      const rows = await adapter.listTrackingEvents(CREDS, params)
      seen.push(...rows.map((r) => r.shipmentId!))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(Array.from({ length: N }, (_, i) => `decklar_key-shp-${i + 1}`))
    expect(more).toEqual([true, true, false])
  })

  it('walks shipments with the documented $size/$offset and alerts with { sid }', async () => {
    const calls = fakeDecklar(12, () => 1)
    await new RoambeeAdapter().listTrackingEvents(CREDS, { page: 1, limit: 100 })
    const lists = calls.filter((c) => c.path === 'v2/shipment').map((c) => c.params)
    expect(lists).toEqual([
      { $size: 10, $offset: 0 },
      { $size: 10, $offset: 10 },
    ])
    expect(calls.filter((c) => c.path === 'shipment/alerts')).toHaveLength(12)
  })

  it('throws on a shipment row with no uuid and sends no alerts request for it', async () => {
    const calls = fakeDecklar(
      2,
      () => 1,
      (i) => (i === 0 ? { uuid: undefined } : {}),
    )
    await expect(
      new RoambeeAdapter().listTrackingEvents(CREDS, { page: 1, limit: 5 }),
    ).rejects.toThrow('no uuid')
    expect(calls.filter((c) => c.path === 'shipment/alerts')).toHaveLength(0)
  })

  it('keeps connections apart', async () => {
    fakeDecklar(3, () => 1)
    const adapter = new RoambeeAdapter()
    // Page 1 on one key leaves its upstream page in the row pager's slot; a
    // page 2 on the other key must not be served from it.
    const a = await adapter.listTrackingEvents(CREDS, { page: 1, limit: 1 })
    const b = await adapter.listTrackingEvents(OTHER, { page: 2, limit: 1 })
    expect(a).toHaveLength(1)
    expect(b).toHaveLength(1)
    expect(a.every((e) => e.shipmentId!.startsWith('decklar_key-'))).toBe(true)
    expect(b.every((e) => e.shipmentId!.startsWith('decklar_other_key-'))).toBe(true)
  })
})
