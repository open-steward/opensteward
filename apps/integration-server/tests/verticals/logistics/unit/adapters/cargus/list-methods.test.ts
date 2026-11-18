/**
 * Cargus list methods, rebuilt onto the operations the first-party developer
 * portal documents (https://urgentcargus.developer.azure-api.net/, data API
 * .../developer/apis/55acb9ae5f80b911a8f59a5f/operations/<OperationId>):
 *
 *  - listShipments -> Awbs_GetByDate  GET /api/Awbs/GetByDate?FromDate&ToDate, pageNumber/itemsPerPage
 *  - listOrders    -> Orders_GetByDate GET /api/Orders/GetByDate?FromDate&ToDate, pageNumber/itemsPerPage
 *  - listTrackingEvents -> AwbTrace_GetDeltaEvents GET /api/AwbTrace/GetDeltaEvents?FromDate&ToDate (no paging)
 *  - listLabels / getLabel -> refused (no documented label record)
 *
 * The date lists need a window and document no lookback limit, so an
 * unfiltered call is refused and a call with updatedAfter walks UTC-day
 * windows newest first. The fakes honour only documented parameters.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import axios from 'axios'
import {
  _resetRowPager,
  listPage,
  readUpstreamPage,
  withPageSink,
  type QueryParams,
} from '@opensteward/shared'
import { CargusAdapter } from '../../../../../../src/verticals/logistics/adapters/cargus/index'
import { ShipmentSchema } from '../../../../../../src/verticals/logistics/schema/shipment'
import { OrderSchema } from '../../../../../../src/verticals/logistics/schema/order'
import { TrackingEventSchema } from '../../../../../../src/verticals/logistics/schema/trackingevent'
import { documentedAwb, documentedDeltaAwb, documentedOrder } from './fixtures/documented'

const CREDS = { accessToken: 'cargus_test' }
const NOW = new Date('2026-09-24T15:00:00Z')
const DAY = 86_400_000
const TODAY = Date.UTC(2026, 8, 24)
const CALL_BUDGET = 200

type Params = Record<string, unknown>
interface Call {
  path: string
  params: Params
}

/** Mock axios.create so CargusClient talks to `handler`. */
function install(handler: (path: string, params: Params) => unknown) {
  const calls: Call[] = []
  const get = vi.fn(async (path: string, cfg?: { params?: Params }) => {
    if (calls.length >= CALL_BUDGET) throw new Error('call budget exceeded')
    const params = cfg?.params ?? {}
    calls.push({ path, params })
    return { data: handler(path, params) }
  })
  vi.spyOn(axios, 'create').mockReturnValue({
    get,
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    defaults: { headers: { common: {} } },
  } as never)
  return calls
}

function onlyKeys(params: Params, allowed: string[]): void {
  const extra = Object.keys(params).filter((k) => !allowed.includes(k))
  if (extra.length) throw new Error(`undocumented params sent: ${extra.join(', ')}`)
}

/**
 * A fake date list with pageNumber/itemsPerPage, as documented for
 * Awbs_GetByDate and Orders_GetByDate: FromDate and ToDate are required, rows
 * whose date falls in [FromDate, ToDate) come back in date order, sliced by
 * 1-based pageNumber at itemsPerPage, as a bare array.
 */
function pagedDateList<T>(path: string, rows: Array<{ at: number; row: T }>) {
  return (p: string, params: Params): T[] => {
    if (p !== path) throw new Error(`unexpected path ${p}`)
    onlyKeys(params, ['FromDate', 'ToDate', 'pageNumber', 'itemsPerPage'])
    if (typeof params.FromDate !== 'string' || typeof params.ToDate !== 'string')
      throw new Error('FromDate and ToDate are required')
    const from = Date.parse(params.FromDate)
    const to = Date.parse(params.ToDate)
    const size = Number(params.itemsPerPage)
    const page = Number(params.pageNumber)
    const inWindow = rows
      .filter((r) => r.at >= from && r.at < to)
      .sort((a, b) => a.at - b.at)
      .map((r) => r.row)
    return inWindow.slice((page - 1) * size, page * size)
  }
}

async function walk<T extends { id?: string }>(
  list: (p: QueryParams) => Promise<T[]>,
  limit: number,
  pages: number,
  updatedAfter: Date,
) {
  const seen: string[] = []
  const hasMore: boolean[] = []
  for (let k = 1; k <= pages; k++) {
    const params = withPageSink({ page: k, limit, updatedAfter })
    const env = listPage(await list(params), params, 'cargus')
    seen.push(...env.data.map((r) => r.id!))
    hasMore.push(env.meta.hasMore as boolean)
    expect(readUpstreamPage(params)).toEqual(expect.objectContaining({ pagedLocally: true }))
  }
  return { seen, hasMore }
}

const adapter = () => new CargusAdapter()

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  _resetRowPager()
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

// ── listShipments ────────────────────────────────────────────────────────────

describe('cargus listShipments (Awbs_GetByDate)', () => {
  const list = (p: QueryParams) => adapter().listShipments(CREDS, p)

  it('refuses an unfiltered call with 501 NOT_SUPPORTED and sends no request', async () => {
    const calls = install(() => [])
    await expect(list({ page: 1, limit: 10 })).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
      message: expect.stringContaining('/api/Awbs/GetByDate'),
    })
    expect(calls).toEqual([])
  })

  it('sends only the documented parameters: today UTC window, pageNumber 1, itemsPerPage = limit', async () => {
    const calls = install(pagedDateList('Awbs/GetByDate', []))
    await list({ page: 1, limit: 7, updatedAfter: new Date(TODAY - 2 * DAY + 3_600_000) })
    expect(calls[0]).toEqual({
      path: 'Awbs/GetByDate',
      params: {
        FromDate: new Date(TODAY).toISOString(),
        ToDate: new Date(TODAY + DAY).toISOString(),
        pageNumber: 1,
        itemsPerPage: 7,
      },
    })
    // Newest first, and the oldest window starts at updatedAfter itself.
    expect(calls.map((c) => c.params.FromDate)).toEqual([
      new Date(TODAY).toISOString(),
      new Date(TODAY - DAY).toISOString(),
      new Date(TODAY - 2 * DAY + 3_600_000).toISOString(),
    ])
    expect(calls.map((c) => c.params.ToDate)).toEqual([
      new Date(TODAY + DAY).toISOString(),
      new Date(TODAY).toISOString(),
      new Date(TODAY - DAY).toISOString(),
    ])
  })

  it('walks 2L+1 AWBs over uneven windows: every id once, hasMore exact, rows parse', async () => {
    const L = 3
    // Today: exactly L (a full page, then an empty page 2); yesterday: none;
    // 2 days ago: 1; 3 days ago: L. Total 2L+1.
    const rows = [
      ...[0, 1, 2].map((i) => ({ at: TODAY + 3_600_000 * (i + 1), bc: `T${i}` })),
      { at: TODAY - 2 * DAY + 60_000, bc: 'D2' },
      ...[0, 1, 2].map((i) => ({ at: TODAY - 3 * DAY + 3_600_000 * (i + 1), bc: `D3-${i}` })),
    ].map((r) => ({ at: r.at, row: documentedAwb(r.bc) }))
    install(pagedDateList('Awbs/GetByDate', rows))
    const { seen, hasMore } = await walk(list, L, 3, new Date(TODAY - 5 * DAY))
    expect(seen).toEqual(['T0', 'T1', 'T2', 'D2', 'D3-0', 'D3-1', 'D3-2'])
    expect(new Set(seen).size).toBe(2 * L + 1)
    expect(hasMore).toEqual([true, true, false])
    const one = await list({ page: 1, limit: 1, updatedAfter: new Date(TODAY - DAY) })
    expect(() => ShipmentSchema.parse(one[0])).not.toThrow()
  })

  it('pages inside a window with pageNumber when a window holds more than a page', async () => {
    const rows = [0, 1, 2, 3, 4].map((i) => ({
      at: TODAY + 60_000 * (i + 1),
      row: documentedAwb(`A${i}`),
    }))
    const calls = install(pagedDateList('Awbs/GetByDate', rows))
    const { seen, hasMore } = await walk(list, 2, 3, new Date(TODAY))
    expect(seen).toEqual(['A0', 'A1', 'A2', 'A3', 'A4'])
    expect(hasMore).toEqual([true, true, false])
    expect(calls.map((c) => c.params.pageNumber)).toEqual([1, 2, 3])
  })

  it('an updatedAfter at or past the end of today returns nothing without a request', async () => {
    const calls = install(() => [])
    const params = withPageSink({ page: 1, limit: 5, updatedAfter: new Date(TODAY + DAY) })
    expect(await list(params)).toEqual([])
    expect(readUpstreamPage(params)).toEqual(expect.objectContaining({ hasMore: false }))
    expect(calls).toEqual([])
  })

  it('a cold jump to a deep page of a dense account walks from the start without running out', async () => {
    // 500 AWBs on each of 4 UTC days; nothing remembered (a restart, an
    // expired memo, or an API client asking for page 30 first).
    const rows = [0, 1, 2, 3].flatMap((d) =>
      Array.from({ length: 500 }, (_, i) => ({
        at: TODAY - d * DAY + 1000 * (i + 1),
        row: documentedAwb(`D${d}-${i}`),
      })),
    )
    install(pagedDateList('Awbs/GetByDate', rows))
    const params = withPageSink({ page: 30, limit: 50, updatedAfter: new Date(TODAY - 3 * DAY) })
    const got = await list(params)
    // Rows 1450..1499: the last 50 of day 2 (days 0 and 1 hold 1000).
    expect(got.map((s) => s.id)).toEqual(Array.from({ length: 50 }, (_, i) => `D2-${450 + i}`))
    expect(listPage(got, params, 'cargus').meta.hasMore).toBe(true)
  })

  it('keys the walk on the connection: another connection reads its own rows', async () => {
    const rowsOf = (tag: string) =>
      [0, 1, 2, 3].map((i) => ({ at: TODAY + 60_000 * (i + 1), row: documentedAwb(`${tag}${i}`) }))
    const updatedAfter = new Date(TODAY)
    install(pagedDateList('Awbs/GetByDate', rowsOf('A')))
    await adapter().listShipments(
      { accessToken: 'conn_a' },
      withPageSink({ page: 1, limit: 2, updatedAfter }),
    )
    install(pagedDateList('Awbs/GetByDate', rowsOf('B')))
    const b = await adapter().listShipments(
      { accessToken: 'conn_b' },
      withPageSink({ page: 2, limit: 2, updatedAfter }),
    )
    expect(b.map((s) => s.id)).toEqual(['B2', 'B3'])
  })

  it('keys the walk on the page size: a new limit does not reuse positions of another', async () => {
    const rows = [0, 1, 2, 3, 4, 5].map((i) => ({
      at: TODAY + 60_000 * (i + 1),
      row: documentedAwb(`A${i}`),
    }))
    install(pagedDateList('Awbs/GetByDate', rows))
    const updatedAfter = new Date(TODAY)
    await list(withPageSink({ page: 1, limit: 2, updatedAfter }))
    await list(withPageSink({ page: 2, limit: 2, updatedAfter }))
    const one = await list(withPageSink({ page: 4, limit: 1, updatedAfter }))
    expect(one.map((s) => s.id)).toEqual(['A3'])
  })
})

describe('cargus getShipment (Awbs_Get)', () => {
  it('returns the AWB whose BarCode is the id, not whichever comes first', async () => {
    install(() => [documentedAwb('OTHER'), documentedAwb('1000000001')])
    const s = await adapter().getShipment(CREDS, '1000000001')
    expect(s.id).toBe('1000000001')
    install(() => [documentedAwb('OTHER')])
    await expect(adapter().getShipment(CREDS, '1000000001')).rejects.toMatchObject({
      statusCode: 404,
    })
  })

  it('sends GET Awbs with the documented barCode query parameter and reads the array', async () => {
    const calls = install((path, params) => {
      if (path !== 'Awbs') throw new Error(`unexpected path ${path}`)
      onlyKeys(params, ['orderId', 'barCode'])
      return [documentedAwb(String(params.barCode))]
    })
    const s = await adapter().getShipment(CREDS, '1000000001')
    expect(calls).toEqual([{ path: 'Awbs', params: { barCode: '1000000001' } }])
    expect(ShipmentSchema.parse(s).id).toBe('1000000001')
  })

  it('an empty response is a 404, not a synthetic shipment', async () => {
    install(() => '')
    await expect(adapter().getShipment(CREDS, 'X')).rejects.toMatchObject({ statusCode: 404 })
  })
})

// ── listOrders ───────────────────────────────────────────────────────────────

describe('cargus listOrders (Orders_GetByDate)', () => {
  const list = (p: QueryParams) => adapter().listOrders(CREDS, p)

  it('refuses an unfiltered call with 501 NOT_SUPPORTED and sends no request', async () => {
    const calls = install(() => [])
    await expect(list({ page: 1, limit: 10 })).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
      message: expect.stringContaining('/api/Orders/GetByDate'),
    })
    expect(calls).toEqual([])
  })

  it('sends only FromDate/ToDate/pageNumber/itemsPerPage, never locationId or status', async () => {
    const calls = install(pagedDateList('Orders/GetByDate', []))
    await list({ page: 1, limit: 4, updatedAfter: new Date(TODAY) })
    expect(calls).toEqual([
      {
        path: 'Orders/GetByDate',
        params: {
          FromDate: new Date(TODAY).toISOString(),
          ToDate: new Date(TODAY + DAY).toISOString(),
          pageNumber: 1,
          itemsPerPage: 4,
        },
      },
    ])
  })

  it('walks 2L+1 orders over uneven windows: every id once, hasMore exact, rows parse', async () => {
    const L = 2
    const at = [
      TODAY + 1000,
      TODAY - DAY + 1000,
      TODAY - DAY + 2000,
      TODAY - 3 * DAY + 5,
      TODAY - 3 * DAY + 6,
    ]
    install(
      pagedDateList(
        'Orders/GetByDate',
        at.map((t, i) => ({ at: t, row: documentedOrder(100 + i) })),
      ),
    )
    const { seen, hasMore } = await walk(
      (p) => list(p).then((os) => os.map((o) => OrderSchema.parse(o))),
      L,
      3,
      new Date(TODAY - 4 * DAY),
    )
    expect(seen).toEqual(['100', '101', '102', '103', '104'])
    expect(hasMore).toEqual([true, true, false])
  })
})

describe('cargus getOrder (Orders_GetByOrderId)', () => {
  it('sends the documented orderId query parameter and reads one object', async () => {
    const calls = install((path, params) => {
      if (path !== 'Orders/GetByOrderId') throw new Error(`unexpected path ${path}`)
      onlyKeys(params, ['orderId'])
      return documentedOrder(Number(params.orderId))
    })
    const o = await adapter().getOrder(CREDS, '501')
    expect(calls).toEqual([{ path: 'Orders/GetByOrderId', params: { orderId: '501' } }])
    expect(OrderSchema.parse(o).id).toBe('501')
  })

  it('an empty (204 No Content) body is a 404', async () => {
    install(() => '')
    await expect(adapter().getOrder(CREDS, '501')).rejects.toMatchObject({ statusCode: 404 })
  })
})

// ── listTrackingEvents ───────────────────────────────────────────────────────

describe('cargus listTrackingEvents (AwbTrace_GetDeltaEvents)', () => {
  const list = (p: QueryParams) => adapter().listTrackingEvents(CREDS, p)

  /** A fake GetDeltaEvents: FromDate/ToDate required, no paging, AWBs by window. */
  function deltaFake(byDay: Record<number, ReturnType<typeof documentedDeltaAwb>[]>) {
    return (path: string, params: Params) => {
      if (path !== 'AwbTrace/GetDeltaEvents') throw new Error(`unexpected path ${path}`)
      onlyKeys(params, ['FromDate', 'ToDate'])
      const from = Date.parse(String(params.FromDate))
      const day = Math.floor(from / DAY) * DAY
      return byDay[day] ?? []
    }
  }

  it('refuses an unfiltered call with 501 NOT_SUPPORTED and sends no request', async () => {
    const calls = install(() => [])
    await expect(list({ page: 1, limit: 10 })).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
      message: expect.stringContaining('/api/AwbTrace/GetDeltaEvents'),
    })
    expect(calls).toEqual([])
  })

  it('sends only FromDate and ToDate (no paging parameter is documented)', async () => {
    const calls = install(deltaFake({}))
    await list({ page: 1, limit: 5, updatedAfter: new Date(TODAY - DAY) })
    expect(calls).toEqual([
      {
        path: 'AwbTrace/GetDeltaEvents',
        params: {
          FromDate: new Date(TODAY).toISOString(),
          ToDate: new Date(TODAY + DAY).toISOString(),
        },
      },
      {
        path: 'AwbTrace/GetDeltaEvents',
        params: {
          FromDate: new Date(TODAY - DAY).toISOString(),
          ToDate: new Date(TODAY).toISOString(),
        },
      },
    ])
  })

  it('walks 2L+1 events flattened out of uneven windows: every id once, hasMore exact', async () => {
    const L = 4
    const ev = (d: string, id: number): [string, number, string] => [d, id, 'Eveniment']
    // Today: 1 AWB with 2 packages (3 events); yesterday: nothing;
    // 2 days ago: 2 AWBs (6 events). Total 9 = 2L+1.
    const byDay = {
      [TODAY]: [
        documentedDeltaAwb('A', [
          { code: 'A1', events: [ev('2026-09-24T08:00:00Z', 1), ev('2026-09-24T09:00:00Z', 2)] },
          { code: 'A2', events: [ev('2026-09-24T08:00:00Z', 1)] },
        ]),
      ],
      [TODAY - 2 * DAY]: [
        documentedDeltaAwb('B', [
          {
            code: 'B1',
            events: [1, 2, 3, 4, 5].map((i) => ev(`2026-09-22T0${i}:00:00Z`, i)),
          },
        ]),
        documentedDeltaAwb('C', [{ code: 'C1', events: [ev('2026-09-22T10:00:00Z', 1)] }]),
      ],
    }
    const calls = install(deltaFake(byDay))
    const { seen, hasMore } = await walk(
      (p) => list(p).then((es) => es.map((e) => TrackingEventSchema.parse(e))),
      L,
      3,
      new Date(TODAY - 3 * DAY),
    )
    expect(seen).toHaveLength(2 * L + 1)
    expect(new Set(seen).size).toBe(2 * L + 1)
    expect(seen[0]).toBe('A:A1:1:2026-09-24T08:00:00Z')
    expect(seen[8]).toBe('C:C1:1:2026-09-22T10:00:00Z')
    expect(hasMore).toEqual([true, true, false])
    // Four windows, each fetched once across the whole walk.
    expect(new Set(calls.map((c) => c.params.FromDate)).size).toBe(4)
  })
})

describe('cargus getTrackingEvents (NoAuth_GetAwbTrace)', () => {
  it('sends the barcode as the documented barCode query parameter, not a path segment', async () => {
    const calls = install((path, params) => {
      if (path !== 'NoAuth/GetAwbTrace') throw new Error(`unexpected path ${path}`)
      onlyKeys(params, ['barCode'])
      return []
    })
    expect(await adapter().getTrackingEvents(CREDS, '1000000001')).toEqual([])
    expect(calls).toEqual([{ path: 'NoAuth/GetAwbTrace', params: { barCode: '1000000001' } }])
  })
})

// ── labels ───────────────────────────────────────────────────────────────────

describe('cargus labels (no documented label record)', () => {
  it('listLabels throws 501 NOT_SUPPORTED and sends no request', async () => {
    const calls = install(() => [])
    await expect(
      adapter().listLabels(CREDS, { page: 1, limit: 5, updatedAfter: new Date(TODAY) }),
    ).rejects.toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
    expect(calls).toEqual([])
  })

  it('getLabel throws 501 NOT_SUPPORTED and sends no request', async () => {
    const calls = install(() => ({}))
    await expect(adapter().getLabel(CREDS, '1000000001')).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
    })
    expect(calls).toEqual([])
  })
})
