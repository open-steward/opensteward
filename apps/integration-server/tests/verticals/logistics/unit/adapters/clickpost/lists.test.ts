/**
 * ClickPost list methods, against a fake that honours only documented
 * parameters.
 *
 * - listCarriers / getCarrier: GET https://www.clickpost.in/api/v1/fetch-accounts
 *   (https://docs.clickpost.ai/reference/fetch-accounts-from-clickpost-1),
 *   query `key` and `active`; "The API will give an array of **all** carrier
 *   partner accounts" (no paging).
 * - listShipments: GET /api/v1/updated-order
 *   (https://docs.clickpost.ai/reference/fetch-updated-orders-list), query
 *   `key`, `username`, `start_date`, `end_date` in epoch seconds, "Difference
 *   between start time and end time cannot be greater than 1800 seconds(30 mins)".
 * - listOrders: refused; GET /api/v3/create-order/ reads one order.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import axios, { type InternalAxiosRequestConfig } from 'axios'
import { withPageSink, readUpstreamPage, type QueryParams } from '@opensteward/shared'
import { ClickPostAdapter } from '../../../../../../src/verticals/logistics/adapters/clickpost/index'
import { CarrierSchema } from '../../../../../../src/verticals/logistics/schema/carrier'
import { ShipmentSchema } from '../../../../../../src/verticals/logistics/schema/shipment'

const WINDOW = 1800
// 2026-09-24T10:10:00Z: the top window boundary is 10:30:00Z.
const NOW = Date.UTC(2026, 8, 24, 10, 10, 0)
const TOP = Date.UTC(2026, 8, 24, 10, 30, 0) / 1000

type Handler = (path: string, params: Record<string, unknown>) => unknown
type Call = { method: string; path: string; params: Record<string, unknown> }

let handler: Handler
let calls: Call[]
let credSeq = 0

function freshCreds() {
  // A fresh token per test: pager keys are per connection.
  credSeq += 1
  return { accessToken: `key-${credSeq}-${Math.random()}`, extra: { username: 'acme' } }
}

beforeEach(() => {
  calls = []
  handler = () => {
    throw new Error('unexpected request')
  }
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  vi.spyOn(axios, 'create').mockImplementation(() => {
    let intercept: (c: InternalAxiosRequestConfig) => InternalAxiosRequestConfig = (c) => c
    const send = (method: string) =>
      vi.fn(async (path: string, ...rest: unknown[]) => {
        const cfg = (method === 'get' ? rest[0] : rest[1]) as { params?: Record<string, unknown> }
        const final = intercept({ params: cfg?.params } as InternalAxiosRequestConfig)
        const params = final.params as Record<string, unknown>
        calls.push({ method, path, params })
        return { data: handler(path, params) }
      })
    return {
      get: send('get'),
      post: send('post'),
      interceptors: {
        request: {
          use: (fn: typeof intercept) => {
            intercept = fn
          },
        },
        response: { use: vi.fn() },
      },
      defaults: { headers: {} },
    } as unknown as ReturnType<typeof axios.create>
  })
  vi.spyOn(axios, 'get').mockImplementation(async () => {
    throw new Error('bare axios.get must not be used')
  })
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

const ok = (result: unknown) => ({
  meta: { status: 200, message: 'SUCCESS', success: true },
  result,
})

// ── Carriers ─────────────────────────────────────────────────────────────────

function accounts(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    courier_partner_id: 100 + i,
    courier_name: `Carrier ${i}`,
    account_code: `acct_${i}`,
    account_active: true,
  }))
}

function fetchAccountsFake(rows: unknown[]): Handler {
  return (path, params) => {
    if (path !== 'v1/fetch-accounts') throw new Error(`unexpected path ${path}`)
    // `key` and `active` are documented; the client adds `username` to every call.
    for (const k of Object.keys(params)) {
      if (k !== 'key' && k !== 'active' && k !== 'username') throw new Error(`undocumented ${k}`)
    }
    if (!params['key']) throw new Error('key is mandatory')
    return ok({ enterprise_name: 'Acme Inc', accounts: rows })
  }
}

describe('clickpost listCarriers', () => {
  it('calls GET v1/fetch-accounts with key and active=true', async () => {
    handler = fetchAccountsFake(accounts(1))
    const creds = freshCreds()
    await new ClickPostAdapter().listCarriers(creds, withPageSink({ page: 1, limit: 10 }))
    expect(calls).toEqual([
      {
        method: 'get',
        path: 'v1/fetch-accounts',
        params: { key: creds.accessToken, username: 'acme', active: true },
      },
    ])
  })

  it('walks N = 2L+1 carriers: every id once, hasMore exact', async () => {
    const L = 3
    handler = fetchAccountsFake(accounts(2 * L + 1))
    const creds = freshCreds()
    const adapter = new ClickPostAdapter()
    const seen: string[] = []
    const hasMore: boolean[] = []
    for (let page = 1; page <= 3; page++) {
      const params = withPageSink({ page, limit: L })
      const rows = await adapter.listCarriers(creds, params)
      rows.forEach((r) => CarrierSchema.parse(r))
      seen.push(...rows.map((r) => r.id!))
      hasMore.push(readUpstreamPage(params)!.hasMore!)
    }
    expect(seen).toEqual(accounts(2 * L + 1).map((a) => String(a.courier_partner_id)))
    expect(new Set(seen).size).toBe(2 * L + 1)
    expect(hasMore).toEqual([true, true, false])
  })

  it('groups a partner with several accounts into one carrier', async () => {
    handler = fetchAccountsFake([
      {
        courier_partner_id: 4,
        courier_name: 'Delhivery',
        account_code: 'Delhivery_Surface_B2C',
        account_active: true,
      },
      {
        courier_partner_id: 4,
        courier_name: 'Delhivery',
        account_code: 'Delhivery_Express_B2C',
        account_active: true,
      },
    ])
    const rows = await new ClickPostAdapter().listCarriers(
      freshCreds(),
      withPageSink({ page: 1, limit: 10 }),
    )
    expect(rows.map((r) => r.id)).toEqual(['4'])
    expect(rows[0]!.services?.map((s) => s.code)).toEqual([
      'Delhivery_Surface_B2C',
      'Delhivery_Express_B2C',
    ])
  })

  it('throws on a meta.success=false body instead of returning no carriers', async () => {
    handler = () => ({
      meta: {
        status: 301,
        message: 'Authentication Failed: Invalid Token or API Key',
        success: false,
      },
    })
    await expect(
      new ClickPostAdapter().listCarriers(freshCreds(), withPageSink({ page: 1, limit: 10 })),
    ).rejects.toThrow(/Authentication Failed/)
  })
})

describe('clickpost getCarrier', () => {
  it('reads the carrier back from v1/fetch-accounts by its partner id', async () => {
    handler = fetchAccountsFake(accounts(3))
    const c = await new ClickPostAdapter().getCarrier(freshCreds(), '101')
    expect(CarrierSchema.parse(c)).toMatchObject({ id: '101', name: 'Carrier 1' })
    expect(calls.map((c) => c.path)).toEqual(['v1/fetch-accounts'])
  })

  it('404s an id the account list does not hold', async () => {
    handler = fetchAccountsFake(accounts(3))
    await expect(new ClickPostAdapter().getCarrier(freshCreds(), '999')).rejects.toMatchObject({
      statusCode: 404,
    })
  })
})

// ── Shipments ────────────────────────────────────────────────────────────────

function updatedRow(ref: string, waybill: string, statusCode = 8) {
  return {
    waybill,
    courier_partner: 4,
    created_at: '2026-09-23T11:43:14.420571Z',
    updated_at: '2026-09-24T09:44:59.449189Z',
    clickpost_status_code: statusCode,
    timestamp: '2026-09-24 15:14:59',
    clickpost_status_description: 'Delivered',
    reference_number: ref,
    account_code: 'Delhivery_Surface_B2C',
    location: 'Bangalore',
    remark: 'Delivered',
    status: 'Delivered',
    customer_feedback_present: false,
    clickpost_city: 'Bangalore',
  }
}

/** Serves `byWindowEnd[end]` for the window ending at `end`; empty otherwise. */
function updatedOrderFake(byWindowEnd: Record<number, unknown[]>): Handler {
  return (path, params) => {
    if (path !== 'v1/updated-order') throw new Error(`unexpected path ${path}`)
    const documented = new Set(['key', 'username', 'start_date', 'end_date'])
    for (const k of Object.keys(params)) {
      if (!documented.has(k)) throw new Error(`undocumented ${k}`)
    }
    const start = Number(params['start_date'])
    const end = Number(params['end_date'])
    if (!params['key'] || !params['username']) throw new Error('key and username are mandatory')
    if (!(end > start) || end - start > WINDOW) {
      return { meta: { status: 400, message: 'window greater than 30 mins', success: false } }
    }
    return ok(byWindowEnd[end] ?? [])
  }
}

describe('clickpost listShipments', () => {
  it('refuses a call without updated_after with 501 NOT_SUPPORTED and sends nothing', async () => {
    const err = await new ClickPostAdapter()
      .listShipments(freshCreds(), withPageSink({ page: 1, limit: 10 }))
      .then(
        () => {
          throw new Error('resolved')
        },
        (e: unknown) => e as Error & { statusCode?: number; code?: string },
      )
    expect(err.statusCode).toBe(501)
    expect(err.code).toBe('NOT_SUPPORTED')
    expect(err.message).toMatch(/updated_after/)
    expect(err.message).toMatch(/1800 seconds/)
    expect(calls).toEqual([])
  })

  it('walks 30-minute UTC-aligned windows oldest-first from updated_after', async () => {
    handler = updatedOrderFake({})
    const creds = freshCreds()
    // 08:45Z: windows 08:45–09:00, 09:00–09:30, 09:30–10:00, 10:00–10:30.
    const updatedAfter = new Date(Date.UTC(2026, 8, 24, 8, 45, 0))
    const params = withPageSink({ page: 1, limit: 10, updatedAfter } as QueryParams)
    const rows = await new ClickPostAdapter().listShipments(creds, params)
    expect(rows).toEqual([])
    expect(calls.map((c) => [c.params['start_date'], c.params['end_date']])).toEqual([
      [updatedAfter.getTime() / 1000, TOP - 3 * WINDOW],
      [TOP - 3 * WINDOW, TOP - 2 * WINDOW],
      [TOP - 2 * WINDOW, TOP - WINDOW],
      [TOP - WINDOW, TOP],
    ])
    expect(calls[0]!.params).toEqual({
      key: creds.accessToken,
      username: 'acme',
      start_date: updatedAfter.getTime() / 1000,
      end_date: TOP - 3 * WINDOW,
    })
    expect(readUpstreamPage(params)!.hasMore).toBe(false)
  })

  it('walks N = 2L+1 shipments over uneven windows: every id once, hasMore exact', async () => {
    const L = 3
    // Windows (oldest first) hold 2, 0, 4, 1 rows: 7 = 2L+1.
    handler = updatedOrderFake({
      [TOP - 3 * WINDOW]: [updatedRow('R1', 'W1'), updatedRow('R2', 'W2')],
      [TOP - WINDOW]: [
        updatedRow('R3', 'W3'),
        updatedRow('R4', 'W4'),
        updatedRow('R5', 'W5'),
        updatedRow('R6', 'W6'),
      ],
      [TOP]: [updatedRow('R7', 'W7')],
    })
    const creds = freshCreds()
    const updatedAfter = new Date((TOP - 4 * WINDOW) * 1000)
    const adapter = new ClickPostAdapter()
    const seen: string[] = []
    const hasMore: boolean[] = []
    for (let page = 1; page <= 3; page++) {
      const params = withPageSink({ page, limit: L, updatedAfter } as QueryParams)
      const rows = await adapter.listShipments(creds, params)
      rows.forEach((r) => ShipmentSchema.parse(r))
      seen.push(...rows.map((r) => r.id!))
      hasMore.push(readUpstreamPage(params)!.hasMore!)
    }
    expect(seen).toEqual(['R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7'])
    expect(hasMore).toEqual([true, true, false])
    for (const c of calls) {
      expect(Number(c.params['end_date']) - Number(c.params['start_date'])).toBeLessThanOrEqual(
        WINDOW,
      )
    }
  })

  it('serves an AWB updated in two windows newest-last, so a page-order upsert keeps its latest status', async () => {
    // "retrieves the latest shipment tracking status updates between the
    // specified start and end time": R1 was in transit in the older window and
    // delivered in the newer one.
    handler = updatedOrderFake({
      [TOP - WINDOW]: [updatedRow('R1', 'W1', 5)],
      [TOP]: [updatedRow('R1', 'W1', 8)],
    })
    const creds = freshCreds()
    const updatedAfter = new Date((TOP - 2 * WINDOW) * 1000)
    const adapter = new ClickPostAdapter()
    const upserted = new Map<string, string | undefined>()
    for (let page = 1; page <= 2; page++) {
      const params = withPageSink({ page, limit: 1, updatedAfter } as QueryParams)
      for (const r of await adapter.listShipments(creds, params)) upserted.set(r.id!, r.status)
      if (!readUpstreamPage(params)!.hasMore) break
    }
    expect(upserted.get('R1')).toBe('DELIVERED')
  })

  it('keys the walk on updated_after: a second walk at another lower bound does not reuse the first', async () => {
    const W1 = TOP - 3 * WINDOW
    handler = updatedOrderFake({
      [W1]: [updatedRow('A1', 'WA1'), updatedRow('A2', 'WA2')],
      [TOP - 2 * WINDOW]: [updatedRow('B1', 'WB1')],
      [TOP - WINDOW]: [updatedRow('C1', 'WC1')],
    })
    const creds = freshCreds()
    const adapter = new ClickPostAdapter()
    // Walk 1 from 08:45Z reads A1 A2 B1 C1; its page 1 leaves A1 A2's window
    // in hand.
    const first = new Date((W1 - WINDOW / 2) * 1000)
    await adapter.listShipments(
      creds,
      withPageSink({ page: 1, limit: 1, updatedAfter: first } as QueryParams),
    )
    // Walk 2 from 09:00Z, with the same top, reads B1 C1: its page 2 is C1,
    // not the A2 that walk 1's positions hold.
    const second = new Date(W1 * 1000)
    const p2 = await adapter.listShipments(
      creds,
      withPageSink({ page: 2, limit: 1, updatedAfter: second } as QueryParams),
    )
    expect(p2.map((r) => r.id)).toEqual(['C1'])
  })

  it('keys the walk on the username as well as the key: two usernames never share rows', async () => {
    const byUser: Record<string, Handler> = {
      alpha: updatedOrderFake({ [TOP]: [updatedRow('A1', 'WA1'), updatedRow('A2', 'WA2')] }),
      beta: updatedOrderFake({ [TOP]: [updatedRow('B1', 'WB1'), updatedRow('B2', 'WB2')] }),
    }
    handler = (path, params) => byUser[String(params['username'])]!(path, params)
    const accessToken = freshCreds().accessToken
    const adapter = new ClickPostAdapter()
    const updatedAfter = new Date((TOP - WINDOW) * 1000)
    await adapter.listShipments(
      { accessToken, extra: { username: 'alpha' } },
      withPageSink({ page: 1, limit: 1, updatedAfter } as QueryParams),
    )
    const p2 = await adapter.listShipments(
      { accessToken, extra: { username: 'beta' } },
      withPageSink({ page: 2, limit: 1, updatedAfter } as QueryParams),
    )
    expect(p2.map((r) => r.id)).toEqual(['B2'])
  })

  it('returns nothing and no more pages when updated_after is past the top window', async () => {
    const params = withPageSink({
      page: 1,
      limit: 10,
      updatedAfter: new Date((TOP + 60) * 1000),
    } as QueryParams)
    expect(await new ClickPostAdapter().listShipments(freshCreds(), params)).toEqual([])
    expect(readUpstreamPage(params)!.hasMore).toBe(false)
    expect(calls).toEqual([])
  })

  it('throws on a meta.success=false window instead of reading it as empty', async () => {
    handler = () => ({ meta: { status: 400, message: 'Bad window', success: false } })
    const params = withPageSink({
      page: 1,
      limit: 10,
      updatedAfter: new Date((TOP - WINDOW) * 1000),
    } as QueryParams)
    await expect(new ClickPostAdapter().listShipments(freshCreds(), params)).rejects.toThrow(
      /Bad window/,
    )
  })
})

// ── Orders ───────────────────────────────────────────────────────────────────

describe('clickpost listOrders', () => {
  it('throws 501 NOT_SUPPORTED and sends nothing', async () => {
    const err = await new ClickPostAdapter()
      .listOrders(freshCreds(), withPageSink({ page: 1, limit: 10 }))
      .then(
        () => {
          throw new Error('resolved')
        },
        (e: unknown) => e as Error & { statusCode?: number; code?: string },
      )
    expect(err.statusCode).toBe(501)
    expect(err.code).toBe('NOT_SUPPORTED')
    expect(err.message).toMatch(/ClickPost cannot list orders/)
    expect(calls).toEqual([])
  })
})
