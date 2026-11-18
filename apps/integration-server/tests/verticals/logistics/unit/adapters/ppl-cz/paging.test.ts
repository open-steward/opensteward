/**
 * PPL CZ (CPL API) list paging.
 *
 * GET /shipment and GET /codelist/product page by offset. From the first-party
 * spec (https://ppl-cpl-api-en.apidog.io/shipment-tracking-13601484e0.md and
 * .../codelist-product-13601461e0.md): `Limit` is required with
 * "maximum: 1000" / "minimum: 1", `Offset` is required with "minimum: 0", and
 * a 200 carries `X-Paging-Total-Items-Count` ("Total items in result").
 *
 * - listShipments sends the caller's page as `Offset` and reports the total.
 * - listTrackingEvents flattens shipments into events, so it walks shipment
 *   pages and cuts event rows to the caller's size (pageByRows).
 * - listCarriers synthesises ONE carrier from the product codelist, so its
 *   collection is that one row, paged locally.
 *
 * Before this, every method read `params.cursor` for the offset and ignored
 * `page`, so page 2 repeated page 1.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import {
  _resetRowPager,
  listPage,
  parseListQuery,
  readUpstreamPage,
  withPageSink,
  type QueryParams,
} from '@opensteward/shared'
import { PplCzAdapter } from '../../../../../../src/verticals/logistics/adapters/ppl-cz/index'

const CREDS = { accessToken: 'ppl_test', extra: { clientId: 'client-1', clientSecret: 's' } }
const CALL_BUDGET = 50
const DOC_MAX_LIMIT = 1000

interface Call {
  path: string
  params: Record<string, unknown>
}

/**
 * A fake CPL API honouring ONLY what the spec documents for the two list
 * endpoints: required `Limit` (1..1000) and `Offset` (>= 0), rows sliced by
 * them, and the total in `X-Paging-Total-Items-Count`. Any other query
 * parameter is refused.
 */
function fakePpl(opts: {
  shipments?: number
  eventsPerShipment?: number
  products?: number
  /** Extra query keys to accept (and ignore), for tests that pin the adapter's filters. */
  allow?: string[]
  /** Omit X-Paging-Total-Items-Count, so the adapter must fall back on a full page. */
  noTotalHeader?: boolean
}) {
  const shipments = Array.from({ length: opts.shipments ?? 0 }, (_, i) => {
    const n = String(i + 1).padStart(4, '0')
    const perShipment = opts.eventsPerShipment ?? 0
    return {
      shipmentNumber: `S${n}`,
      stateCode: 10,
      stateName: `state-${n}`,
      events: Array.from({ length: perShipment }, (_, j) => ({
        stateCode: 10,
        stateName: `S${n}-E${j + 1}`,
        eventDate: '2026-01-01T00:00:00Z',
      })),
    }
  })
  const products = Array.from({ length: opts.products ?? 0 }, (_, i) => ({
    code: `P${i + 1}`,
    name: `Product ${i + 1}`,
  }))
  const calls: Call[] = []
  const get = vi.fn(async (path: string, cfg?: { params?: Record<string, unknown> }) => {
    if (calls.length >= CALL_BUDGET)
      throw new Error('call budget exceeded: the adapter kept paging')
    const params = { ...(cfg?.params ?? {}) }
    calls.push({ path, params })
    const all = path === 'shipment' ? shipments : path === 'codelist/product' ? products : null
    if (!all) throw new Error(`unexpected path ${path}`)
    const extra = Object.keys(params).filter(
      (k) => k !== 'Limit' && k !== 'Offset' && !(opts.allow ?? []).includes(k),
    )
    if (extra.length) throw new Error(`undocumented params sent: ${extra.join(',')}`)
    const limit = Number(params['Limit'])
    const offset = Number(params['Offset'])
    if (!Number.isInteger(limit) || limit < 1 || limit > DOC_MAX_LIMIT)
      throw Object.assign(new Error(`400: Limit ${String(params['Limit'])}`), { status: 400 })
    if (!Number.isInteger(offset) || offset < 0)
      throw Object.assign(new Error(`400: Offset ${String(params['Offset'])}`), { status: 400 })
    return {
      data: all.slice(offset, offset + limit),
      headers: {
        ...(opts.noTotalHeader ? {} : { 'x-paging-total-items-count': String(all.length) }),
        'x-paging-offset': String(offset),
        'x-paging-limit': String(limit),
      },
    }
  })
  vi.spyOn(axios, 'create').mockReturnValue({
    get,
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    defaults: { headers: { common: {} } },
  } as never)
  return { calls }
}

const adapter = () => new PplCzAdapter()
const shipIds = (from: number, count: number) =>
  Array.from({ length: count }, (_, i) => `S${String(from + i).padStart(4, '0')}`)

afterEach(() => {
  vi.restoreAllMocks()
  _resetRowPager()
})

describe('ppl-cz listShipments (Limit/Offset upstream)', () => {
  const list = (p: QueryParams) => adapter().listShipments(CREDS, p)

  it('with 2L+1 rows, pages 1..3 at limit L return every shipment once, in order, hasMore exact', async () => {
    const L = 4
    fakePpl({ shipments: 2 * L + 1 })
    const seen: string[] = []
    const hasMore: boolean[] = []
    const reported: (boolean | undefined)[] = []
    for (let k = 1; k <= 3; k++) {
      const params = withPageSink({ page: k, limit: L })
      const env = listPage(await list(params), params, 'ppl-cz')
      seen.push(...env.data.map((s) => s.id!))
      hasMore.push(env.meta.hasMore as boolean)
      expect(readUpstreamPage(params)?.totalCount).toBe(2 * L + 1)
      // The sync worker reads the adapter's own hasMore, not listPage's.
      reported.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(shipIds(1, 2 * L + 1))
    expect(hasMore).toEqual([true, true, false])
    expect(reported).toEqual([true, true, false])
  })

  it('a last page that ends exactly on the total reports hasMore=false itself', async () => {
    fakePpl({ shipments: 6 })
    const params = withPageSink({ page: 2, limit: 3 })
    await list(params)
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('the page-2 request carries the documented Offset key', async () => {
    const { calls } = fakePpl({ shipments: 10 })
    await list(withPageSink({ page: 2, limit: 3 }))
    expect(calls).toEqual([{ path: 'shipment', params: { Limit: 3, Offset: 3 } }])
  })

  it('a limit above the documented maximum (1000) is clamped and the page size reported', async () => {
    const { calls } = fakePpl({ shipments: 1201 })
    const p1 = withPageSink({ page: 1, limit: 1500 })
    const env1 = listPage(await list(p1), p1, 'ppl-cz')
    expect(calls[0]!.params).toEqual({ Limit: DOC_MAX_LIMIT, Offset: 0 })
    expect(env1.data).toHaveLength(DOC_MAX_LIMIT)
    expect(env1.meta.hasMore).toBe(true)
    expect(readUpstreamPage(p1)?.pageSize).toBe(DOC_MAX_LIMIT)
    const p2 = withPageSink({ page: 2, limit: 1500 })
    const env2 = listPage(await list(p2), p2, 'ppl-cz')
    expect(calls[1]!.params).toEqual({ Limit: DOC_MAX_LIMIT, Offset: DOC_MAX_LIMIT })
    expect(env2.data.map((s) => s.id)).toEqual(shipIds(1001, 201))
    expect(env2.meta.hasMore).toBe(false)
  })

  it('API path: parseListQuery → adapter → listPage serves page 2 with an exact hasMore', async () => {
    fakePpl({ shipments: 7 })
    const params = parseListQuery({ page: '2', limit: '3' })
    const env = listPage(await list(params), params, 'ppl-cz')
    expect(env.data.map((s) => s.id)).toEqual(shipIds(4, 3))
    expect(env.meta.hasMore).toBe(true)
    expect(env.meta.totalCount).toBe(7)
  })
})

describe('ppl-cz listTrackingEvents (events flattened from Limit/Offset shipment pages)', () => {
  const list = (p: QueryParams) => adapter().listTrackingEvents(CREDS, p)
  const evIds = (events: { description?: string | null }[]) => events.map((e) => e.description)

  it('with 2L+1 events, pages 1..3 at limit L return every event once, in order, hasMore exact', async () => {
    const L = 5
    // 11 shipments × 1 event = 2L+1 rows; the multi-event case is below.
    fakePpl({ shipments: 11, eventsPerShipment: 1 })
    const all: string[] = []
    const hasMore: boolean[] = []
    for (let k = 1; k <= 3; k++) {
      const params = withPageSink({ page: k, limit: L })
      const env = listPage(await list(params), params, 'ppl-cz')
      all.push(...(evIds(env.data) as string[]))
      hasMore.push(env.meta.hasMore as boolean)
    }
    expect(all).toEqual(shipIds(1, 11).map((s) => `${s}-E1`))
    expect(hasMore).toEqual([true, true, false])
  })

  it('re-cuts multi-event shipments across caller pages: 2L+1 events, each once', async () => {
    const L = 4
    // 3 shipments × 3 events = 9 = 2L+1 rows.
    fakePpl({ shipments: 3, eventsPerShipment: 3 })
    const all: string[] = []
    const hasMore: boolean[] = []
    for (let k = 1; k <= 3; k++) {
      const params = withPageSink({ page: k, limit: L })
      const env = listPage(await list(params), params, 'ppl-cz')
      all.push(...(evIds(env.data) as string[]))
      hasMore.push(env.meta.hasMore as boolean)
      expect(readUpstreamPage(params)?.pagedLocally).toBe(true)
    }
    const expected = shipIds(1, 3).flatMap((s) => [`${s}-E1`, `${s}-E2`, `${s}-E3`])
    expect(all).toEqual(expected)
    expect(hasMore).toEqual([true, true, false])
  })

  it('walks shipment pages with the documented Offset key, never above the maximum', async () => {
    const { calls } = fakePpl({ shipments: 250, eventsPerShipment: 1 })
    const params = withPageSink({ page: 3, limit: 100 })
    const env = listPage(await list(params), params, 'ppl-cz')
    expect(evIds(env.data)).toEqual(shipIds(201, 50).map((s) => `${s}-E1`))
    expect(env.meta.hasMore).toBe(false)
    expect(calls.map((c) => c.params['Offset'])).toEqual([0, 100, 200])
    for (const c of calls) expect(Number(c.params['Limit'])).toBeLessThanOrEqual(DOC_MAX_LIMIT)
  })

  it('a caller limit above the maximum still pages (upstream Limit stays in range)', async () => {
    const { calls } = fakePpl({ shipments: 1300, eventsPerShipment: 1 })
    const params = withPageSink({ page: 1, limit: 5000 })
    const env = listPage(await list(params), params, 'ppl-cz')
    expect(env.data).toHaveLength(1300)
    expect(env.meta.hasMore).toBe(false)
    for (const c of calls) expect(Number(c.params['Limit'])).toBeLessThanOrEqual(DOC_MAX_LIMIT)
  })

  it('stops at the X-Paging-Total-Items-Count total without fetching an empty page', async () => {
    // 200 shipments = exactly two full upstream pages of 100.
    const { calls } = fakePpl({ shipments: 200, eventsPerShipment: 1 })
    const params = withPageSink({ page: 1, limit: 500 })
    const env = listPage(await list(params), params, 'ppl-cz')
    expect(env.data).toHaveLength(200)
    expect(env.meta.hasMore).toBe(false)
    expect(calls.map((c) => c.params['Offset'])).toEqual([0, 100])
  })

  it('without the total header, a full upstream page still means more', async () => {
    const { calls } = fakePpl({ shipments: 150, eventsPerShipment: 1, noTotalHeader: true })
    const params = withPageSink({ page: 1, limit: 500 })
    const env = listPage(await list(params), params, 'ppl-cz')
    expect(evIds(env.data)).toEqual(shipIds(1, 150).map((s) => `${s}-E1`))
    expect(env.meta.hasMore).toBe(false)
    expect(calls.map((c) => c.params['Offset'])).toEqual([0, 100])
  })

  it('another connection does not reuse this walk (per-connection key)', async () => {
    const { calls } = fakePpl({ shipments: 300, eventsPerShipment: 1 })
    // Same account with another token, then another account.
    for (const other of [
      { ...CREDS, accessToken: 'ppl_other_token' },
      { accessToken: 'ppl_b', extra: { clientId: 'client-2', clientSecret: 's' } },
    ]) {
      _resetRowPager()
      await list(withPageSink({ page: 1, limit: 100 }))
      calls.length = 0
      const events = await adapter().listTrackingEvents(
        other,
        withPageSink({ page: 2, limit: 100 }),
      )
      expect(evIds(events)).toEqual(shipIds(101, 100).map((s) => `${s}-E1`))
      // A fresh walk for this connection starts at the first shipment page.
      expect(calls[0]?.params['Offset']).toBe(0)
    }
  })

  it('a walk under another updatedAfter filter does not reuse this walk (filters in the key)', async () => {
    const { calls } = fakePpl({ shipments: 300, eventsPerShipment: 1, allow: ['lastUpdateDate'] })
    await list(withPageSink({ page: 1, limit: 100 }))
    calls.length = 0
    await list(
      withPageSink({ page: 2, limit: 100, updatedAfter: new Date('2026-01-01T00:00:00Z') }),
    )
    expect(calls[0]?.params).toEqual({
      lastUpdateDate: '2026-01-01T00:00:00.000Z',
      Limit: 100,
      Offset: 0,
    })
  })

  it('API path: parseListQuery → adapter → listPage serves page 2 with an exact hasMore', async () => {
    fakePpl({ shipments: 7, eventsPerShipment: 1 })
    const params = parseListQuery({ page: '2', limit: '3' })
    const env = listPage(await list(params), params, 'ppl-cz')
    expect(evIds(env.data)).toEqual(shipIds(4, 3).map((s) => `${s}-E1`))
    expect(env.meta.hasMore).toBe(true)
  })
})

describe('ppl-cz listCarriers (one synthesised carrier, paged locally)', () => {
  const list = (p: QueryParams) => adapter().listCarriers(CREDS, p)

  it('page 1 holds the one carrier and reports the end; pages 2 and 3 are empty', async () => {
    fakePpl({ products: 5 })
    const seen: string[] = []
    const hasMore: boolean[] = []
    for (let k = 1; k <= 3; k++) {
      const params = withPageSink({ page: k, limit: 1 })
      const env = listPage(await list(params), params, 'ppl-cz')
      seen.push(...env.data.map((c) => c.id!))
      hasMore.push(env.meta.hasMore as boolean)
      expect(readUpstreamPage(params)).toEqual(
        expect.objectContaining({ pagedLocally: true, totalCount: 1 }),
      )
    }
    expect(seen).toEqual(['ppl-cz'])
    expect(hasMore).toEqual([false, false, false])
  })

  it('the caller limit counts carriers, not products: every service survives a limit of 1', async () => {
    const { calls } = fakePpl({ products: 5 })
    const [carrier] = await list(withPageSink({ page: 1, limit: 1 }))
    expect(carrier!.services).toHaveLength(5)
    for (const c of calls) {
      expect(Number(c.params['Limit'])).toBeLessThanOrEqual(DOC_MAX_LIMIT)
      expect(c.params['Offset']).toBe(0)
    }
  })

  it('API path: parseListQuery → adapter → listPage serves page 2 as empty, not a repeat', async () => {
    fakePpl({ products: 3 })
    const params = parseListQuery({ page: '2', limit: '10' })
    const env = listPage(await list(params), params, 'ppl-cz')
    expect(env.data).toEqual([])
    expect(env.meta.hasMore).toBe(false)
  })
})
