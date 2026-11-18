/**
 * iThink Logistics read methods, against a fake that honours only documented
 * parameters. Every call is a POST of {"data": {...fields, access_token,
 * secret_key}}.
 *
 * - listOrders / getOrder: POST https://my.ithinklogistics.com/api_v3/order/get_details.json
 *   (https://docs.ithinklogistics.com/doc-order-details/3): awb_number_list,
 *   order_no, start_date, end_date; "maximum 500 AWB details in one request";
 *   `data` is an object keyed per row. No paging.
 * - listWarehouses / getWarehouse: POST .../warehouse/get.json
 *   (https://docs.ithinklogistics.com/doc-get-warehouse/3): warehouse_id
 *   "#Optional". No paging.
 * - getTrackingEvents: POST https://api.ithinklogistics.com/api_v3/order/track.json
 *   (https://docs.ithinklogistics.com/doc-track-order/3): awb_number_list.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import axios from 'axios'
import { withPageSink, readUpstreamPage } from '@opensteward/shared'
import { IthinkLogisticsAdapter } from '../../../../../../src/verticals/logistics/adapters/ithink-logistics/index'
import { OrderSchema } from '../../../../../../src/verticals/logistics/schema/order'
import { WarehouseSchema } from '../../../../../../src/verticals/logistics/schema/warehouse'
import { TrackingEventSchema } from '../../../../../../src/verticals/logistics/schema/trackingevent'
import { docOrderRow, docTrackRow, docWarehouseRow } from './fixtures'

// 2026-09-24T10:00:00Z: the newest window is 2026-09-24.
const NOW = Date.UTC(2026, 8, 24, 10, 0, 0)

type Body = { data?: Record<string, unknown> }
type Handler = (path: string, body: Body) => unknown
type Call = { path: string; body: Body }

let handler: Handler
let calls: Call[]
let baseURLs: unknown[]
let credSeq = 0

function freshCreds() {
  // A fresh token per test: pager keys are per connection.
  credSeq += 1
  return { accessToken: `tok-${credSeq}-${Math.random()}`, extra: { secretKey: 'sek' } }
}

beforeEach(() => {
  calls = []
  baseURLs = []
  handler = () => {
    throw new Error('unexpected request')
  }
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  vi.spyOn(axios, 'create').mockImplementation((cfg) => {
    baseURLs.push(cfg?.baseURL)
    return {
      post: vi.fn(async (path: string, body: Body) => {
        calls.push({ path, body })
        return { data: handler(path, body) }
      }),
      get: vi.fn(async () => {
        throw new Error('iThink documents no GET call')
      }),
    } as unknown as ReturnType<typeof axios.create>
  })
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

/** Rejects any field the endpoint does not document, and a missing secret. */
function documented(body: Body, allowed: string[]): Record<string, unknown> {
  const data = body.data
  if (!data) throw new Error('fields must be inside the data envelope')
  if (Object.keys(body).length !== 1) throw new Error('only data is documented at the top level')
  for (const k of Object.keys(data)) {
    if (![...allowed, 'access_token', 'secret_key'].includes(k))
      throw new Error(`undocumented ${k}`)
  }
  if (!data['access_token'] || !data['secret_key']) throw new Error('both secrets are mandatory')
  return data
}

// ── Orders ───────────────────────────────────────────────────────────────────

const ORDER_FIELDS = ['awb_number_list', 'order_no', 'start_date', 'end_date']

function order(awb: string, date: string) {
  return { ...docOrderRow(), awb_no: awb, order_date: `${date} 08:57:27` }
}

/** The documented endpoint over `rows`: AWB list, or an inclusive date range, capped at 500. */
function orderDetailsFake(rows: ReturnType<typeof order>[]): Handler {
  return (path, body) => {
    if (path !== 'order/get_details.json') throw new Error(`unexpected path ${path}`)
    const data = documented(body, ORDER_FIELDS)
    const awbs = String(data['awb_number_list'] ?? '')
      .split(',')
      .filter(Boolean)
    const start = String(data['start_date'] ?? '')
    const end = String(data['end_date'] ?? '')
    const hit = rows.filter((r) => {
      if (awbs.length > 0) return awbs.includes(r.awb_no)
      if (!start || !end) throw new Error('a date range is needed without an AWB list')
      const d = r.order_date.slice(0, 10)
      return d >= start && d <= end
    })
    const out: Record<string, unknown> = {}
    hit.slice(0, 500).forEach((r, i) => (out[String(900000 + i)] = r))
    return { status: 'success', status_code: 200, data: out }
  }
}

describe('ithink-logistics listOrders', () => {
  it('refuses a call with no updated_after with 501 NOT_SUPPORTED, sending nothing', async () => {
    handler = orderDetailsFake([])
    await expect(
      new IthinkLogisticsAdapter().listOrders(freshCreds(), withPageSink({ page: 1, limit: 10 })),
    ).rejects.toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
    expect(calls).toEqual([])
  })

  it('asks the documented host for one UTC day, newest first, inside the data envelope', async () => {
    handler = orderDetailsFake([order('A1', '2026-09-24')])
    const creds = freshCreds()
    await new IthinkLogisticsAdapter().listOrders(
      creds,
      withPageSink({ page: 1, limit: 10, updatedAfter: new Date('2026-09-24T01:00:00Z') }),
    )
    expect(baseURLs).toEqual(['https://my.ithinklogistics.com/api_v3/'])
    expect(calls).toEqual([
      {
        path: 'order/get_details.json',
        body: {
          data: {
            awb_number_list: '',
            start_date: '2026-09-24',
            end_date: '2026-09-24',
            access_token: creds.accessToken,
            secret_key: 'sek',
          },
        },
      },
    ])
  })

  it('walks N = 2L+1 orders over uneven days: every id once, hasMore exact', async () => {
    const L = 3
    // Days 24..20 hold 2, 0, 3, 1, 1 orders.
    const rows = [
      order('d24a', '2026-09-24'),
      order('d24b', '2026-09-24'),
      order('d22a', '2026-09-22'),
      order('d22b', '2026-09-22'),
      order('d22c', '2026-09-22'),
      order('d21a', '2026-09-21'),
      order('d20a', '2026-09-20'),
      order('d19-too-old', '2026-09-19'),
    ]
    handler = orderDetailsFake(rows)
    const creds = freshCreds()
    const adapter = new IthinkLogisticsAdapter()
    const seen: string[] = []
    const hasMore: boolean[] = []
    for (let page = 1; page <= 3; page++) {
      const params = withPageSink({
        page,
        limit: L,
        updatedAfter: new Date('2026-09-20T15:00:00Z'),
      })
      const got = await adapter.listOrders(creds, params)
      got.forEach((o) => OrderSchema.parse(o))
      seen.push(...got.map((o) => o.id!))
      hasMore.push(readUpstreamPage(params)!.hasMore!)
    }
    expect(seen).toEqual(['d24a', 'd24b', 'd22a', 'd22b', 'd22c', 'd21a', 'd20a'])
    expect(hasMore).toEqual([true, true, false])
    // One request per day, each day once, never before the day of updatedAfter.
    expect(calls.map((c) => c.body.data!['start_date'])).toEqual([
      '2026-09-24',
      '2026-09-23',
      '2026-09-22',
      '2026-09-21',
      '2026-09-20',
    ])
  })

  it('throws on a day that reaches the documented 500-AWB cap instead of truncating it', async () => {
    handler = orderDetailsFake(
      Array.from({ length: 500 }, (_, i) => order(`big${i}`, '2026-09-24')),
    )
    await expect(
      new IthinkLogisticsAdapter().listOrders(
        freshCreds(),
        withPageSink({ page: 1, limit: 10, updatedAfter: new Date('2026-09-24T00:00:00Z') }),
      ),
    ).rejects.toMatchObject({ code: 'UPSTREAM_TRUNCATED' })
  })

  it('answers an updated_after in the future with no rows and no request', async () => {
    handler = orderDetailsFake([])
    const params = withPageSink({
      page: 1,
      limit: 10,
      updatedAfter: new Date('2026-09-26T00:00:00Z'),
    })
    expect(await new IthinkLogisticsAdapter().listOrders(freshCreds(), params)).toEqual([])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
    expect(calls).toEqual([])
  })

  it('throws on a status_code other than 200 instead of reading it as an empty day', async () => {
    handler = () => ({ status: 'error', status_code: 400 })
    await expect(
      new IthinkLogisticsAdapter().listOrders(
        freshCreds(),
        withPageSink({ page: 1, limit: 10, updatedAfter: new Date('2026-09-24T00:00:00Z') }),
      ),
    ).rejects.toThrow(/status_code 400/)
  })

  it('refuses credentials without the secret key before any request', async () => {
    handler = orderDetailsFake([])
    await expect(
      new IthinkLogisticsAdapter().listOrders(
        { accessToken: 'old-single-key' },
        withPageSink({ page: 1, limit: 10, updatedAfter: new Date('2026-09-24T00:00:00Z') }),
      ),
    ).rejects.toMatchObject({ statusCode: 401 })
    expect(calls).toEqual([])
  })
})

describe('ithink-logistics getOrder', () => {
  it('reads one AWB with the dates left empty', async () => {
    handler = orderDetailsFake([order('A1', '2026-01-01'), order('A2', '2026-01-02')])
    const creds = freshCreds()
    const o = OrderSchema.parse(await new IthinkLogisticsAdapter().getOrder(creds, 'A2'))
    expect(o.id).toBe('A2')
    expect(calls).toEqual([
      {
        path: 'order/get_details.json',
        body: {
          data: {
            awb_number_list: 'A2',
            start_date: '',
            end_date: '',
            access_token: creds.accessToken,
            secret_key: 'sek',
          },
        },
      },
    ])
  })

  it('404s an AWB the response does not hold', async () => {
    handler = orderDetailsFake([order('A1', '2026-01-01')])
    await expect(new IthinkLogisticsAdapter().getOrder(freshCreds(), 'ZZ')).rejects.toMatchObject({
      statusCode: 404,
    })
  })
})

// ── Warehouses ───────────────────────────────────────────────────────────────

function warehouses(n: number) {
  return Array.from({ length: n }, (_, i) => ({ ...docWarehouseRow(), id: String(2474 + i) }))
}

function warehouseFake(rows: ReturnType<typeof warehouses>): Handler {
  return (path, body) => {
    if (path !== 'warehouse/get.json') throw new Error(`unexpected path ${path}`)
    const data = documented(body, ['warehouse_id'])
    const id = data['warehouse_id']
    const hit = id === undefined ? rows : rows.filter((r) => r.id === String(id))
    return { status: 'success', status_code: 200, data: hit }
  }
}

describe('ithink-logistics listWarehouses', () => {
  it('POSTs warehouse/get.json with only the secrets', async () => {
    handler = warehouseFake(warehouses(1))
    const creds = freshCreds()
    await new IthinkLogisticsAdapter().listWarehouses(creds, withPageSink({ page: 1, limit: 10 }))
    expect(calls).toEqual([
      {
        path: 'warehouse/get.json',
        body: { data: { access_token: creds.accessToken, secret_key: 'sek' } },
      },
    ])
  })

  it('walks N = 2L+1 warehouses: every id once, hasMore exact', async () => {
    const L = 3
    handler = warehouseFake(warehouses(2 * L + 1))
    const creds = freshCreds()
    const adapter = new IthinkLogisticsAdapter()
    const seen: string[] = []
    const hasMore: boolean[] = []
    for (let page = 1; page <= 3; page++) {
      const params = withPageSink({ page, limit: L })
      const rows = await adapter.listWarehouses(creds, params)
      rows.forEach((r) => WarehouseSchema.parse(r))
      seen.push(...rows.map((r) => r.id!))
      hasMore.push(readUpstreamPage(params)!.hasMore!)
    }
    expect(seen).toEqual(warehouses(2 * L + 1).map((w) => w.id))
    expect(hasMore).toEqual([true, true, false])
  })
})

describe('ithink-logistics getWarehouse', () => {
  it('reads one warehouse by warehouse_id', async () => {
    handler = warehouseFake(warehouses(3))
    const w = await new IthinkLogisticsAdapter().getWarehouse(freshCreds(), '2475')
    expect(WarehouseSchema.parse(w).id).toBe('2475')
    expect(calls[0]!.body.data!['warehouse_id']).toBe('2475')
  })

  it('404s an id the response does not hold', async () => {
    handler = warehouseFake(warehouses(1))
    await expect(
      new IthinkLogisticsAdapter().getWarehouse(freshCreds(), '1'),
    ).rejects.toMatchObject({ statusCode: 404 })
  })
})

// ── Tracking ─────────────────────────────────────────────────────────────────

describe('ithink-logistics getTrackingEvents', () => {
  it('POSTs the AWB to the documented tracking host and maps scan_details', async () => {
    handler = (path, body) => {
      if (path !== 'https://api.ithinklogistics.com/api_v3/order/track.json')
        throw new Error(`unexpected path ${path}`)
      const data = documented(body, ['awb_number_list'])
      const row = docTrackRow()
      if (data['awb_number_list'] !== row['awb_no']) return { status_code: 200, data: {} }
      return { status_code: 200, data: { [String(row['awb_no'])]: row } }
    }
    const events = await new IthinkLogisticsAdapter().getTrackingEvents(
      freshCreds(),
      '1369010033902',
    )
    events.forEach((e) => TrackingEventSchema.parse(e))
    expect(events.map((e) => e.id)).toEqual([
      '1369010033902:0',
      '1369010033902:1',
      '1369010033902:2',
    ])
    await expect(
      new IthinkLogisticsAdapter().getTrackingEvents(freshCreds(), '999'),
    ).rejects.toMatchObject({ statusCode: 404 })
  })
})

// ── Credentials ──────────────────────────────────────────────────────────────

describe('ithink-logistics credential form', () => {
  it('stores both secrets where the client reads them, so a new connection can call', async () => {
    const adapter = new IthinkLogisticsAdapter()
    const creds = await adapter.exchangeCredentials({
      accessToken: ` tok-form-${Math.random()} `,
      secretKey: ' sek-form ',
    })
    handler = warehouseFake(warehouses(1))
    await adapter.listWarehouses(creds, withPageSink({ page: 1, limit: 10 }))
    expect(calls).toHaveLength(1)
    expect(calls[0]!.body.data!['access_token']).toBe(creds.accessToken.trim())
    expect(calls[0]!.body.data!['secret_key']).toBe('sek-form')
  })

  it('rejects a form with either secret missing', async () => {
    const adapter = new IthinkLogisticsAdapter()
    await expect(adapter.exchangeCredentials({ accessToken: 't', secretKey: ' ' })).rejects.toThrow(
      /Secret key/,
    )
    await expect(adapter.exchangeCredentials({ accessToken: '', secretKey: 's' })).rejects.toThrow(
      /Access token/,
    )
  })
})

// ── Row selection: a response may hold rows other than the one asked for ─────

describe('ithink-logistics get* pick the requested row', () => {
  it('getOrder returns the row whose awb_no matches, not the first', async () => {
    handler = () => ({
      status: 'success',
      status_code: 200,
      data: { '1': order('A1', '2026-01-01'), '2': order('A2', '2026-01-02') },
    })
    const o = await new IthinkLogisticsAdapter().getOrder(freshCreds(), 'A2')
    expect(o.id).toBe('A2')
  })

  it('getWarehouse returns the row whose id matches, not the first', async () => {
    handler = () => ({ status: 'success', status_code: 200, data: warehouses(3) })
    const w = await new IthinkLogisticsAdapter().getWarehouse(freshCreds(), '2476')
    expect(w.id).toBe('2476')
  })

  it('getTrackingEvents reads the requested AWB, not the first', async () => {
    const other = { ...docTrackRow(), awb_no: '111', scan_details: [] }
    const row = docTrackRow()
    handler = () => ({ status_code: 200, data: { '111': other, [String(row['awb_no'])]: row } })
    const events = await new IthinkLogisticsAdapter().getTrackingEvents(
      freshCreds(),
      String(row['awb_no']),
    )
    expect(events).toHaveLength(3)
  })

  it('getTrackingEvents 404s an AWB row whose message is not the documented "success"', async () => {
    const row: Record<string, unknown> = { ...docTrackRow(), message: 'Invalid AWB' }
    handler = () => ({ status_code: 200, data: { [String(row['awb_no'])]: row } })
    await expect(
      new IthinkLogisticsAdapter().getTrackingEvents(freshCreds(), String(row['awb_no'])),
    ).rejects.toMatchObject({ statusCode: 404 })
  })
})

// ── Pager key ────────────────────────────────────────────────────────────────

describe('ithink-logistics listOrders pager key', () => {
  const rows = [
    order('d24a', '2026-09-24'),
    order('d24b', '2026-09-24'),
    order('d23a', '2026-09-23'),
    order('d22a', '2026-09-22'),
    order('d21a', '2026-09-21'),
  ]

  it('does not reuse a walk once updated_after moves the bottom day', async () => {
    handler = orderDetailsFake(rows)
    const creds = freshCreds()
    const adapter = new IthinkLogisticsAdapter()
    const p1 = withPageSink({ page: 1, limit: 2, updatedAfter: new Date('2026-09-21T00:00:00Z') })
    expect((await adapter.listOrders(creds, p1)).map((o) => o.id)).toEqual(['d24a', 'd24b'])
    const p2 = withPageSink({ page: 2, limit: 2, updatedAfter: new Date('2026-09-23T00:00:00Z') })
    expect((await adapter.listOrders(creds, p2)).map((o) => o.id)).toEqual(['d23a'])
    expect(readUpstreamPage(p2)?.hasMore).toBe(false)
  })

  it('does not reuse a walk across a UTC midnight', async () => {
    // Twenty seconds apart, well inside the pager's idle TTL, on either side of midnight.
    vi.setSystemTime(Date.UTC(2026, 8, 24, 23, 59, 50))
    handler = orderDetailsFake([...rows, order('d25a', '2026-09-25')])
    const creds = freshCreds()
    const adapter = new IthinkLogisticsAdapter()
    const after = new Date('2026-09-23T00:00:00Z')
    const p1 = withPageSink({ page: 1, limit: 2, updatedAfter: after })
    expect((await adapter.listOrders(creds, p1)).map((o) => o.id)).toEqual(['d24a', 'd24b'])
    vi.setSystemTime(Date.UTC(2026, 8, 25, 0, 0, 10))
    const p2 = withPageSink({ page: 2, limit: 2, updatedAfter: after })
    // The new walk is 25, 24, 23: d25a, d24a | d24b, d23a.
    expect((await adapter.listOrders(creds, p2)).map((o) => o.id)).toEqual(['d24b', 'd23a'])
    expect(readUpstreamPage(p2)?.hasMore).toBe(false)
  })
})
