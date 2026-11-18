/**
 * Tap Payments payouts: POST /v2/payouts/list walked in UTC date windows.
 *
 * https://developers.tap.company/reference/list-payouts.md documents the body
 * as `period.date.from` / `period.date.to` ("Required date range for the
 * payouts list", "Measured in Unix Epoch Timestamp (milliseconds)"), `merchants`,
 * `payouts.payout_id`, `order_by` and `limit` ("Default: 25; Maximum: 50."),
 * and `has_more` on the response. No `page` and no `starting_after`: nothing
 * reaches the second page of one window. So the adapter needs a lower bound
 * (Tap documents no retention limit), refuses without `updatedAfter`, walks
 * UTC calendar months newest-first, and splits a month whose first 50 rows
 * are not all of it into UTC days.
 *
 * Retrieve a Payout (https://developers.tap.company/reference/retrieve-a-payout.md)
 * is the same POST .../list with `payouts.payout_id`, not a GET by id.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import axios from 'axios'
import {
  _resetCursorPager,
  readUpstreamPage,
  withPageSink,
  type Credentials,
  type QueryParams,
} from '@opensteward/shared'
import { TapPaymentsAdapter } from '../../../../../../src/verticals/payments/adapters/tap-payments/index'

const CREDS: Credentials = { accessToken: 'sk_test_tap_payouts' }
const NOW = Date.UTC(2026, 8, 20, 12, 0, 0)
const DOCUMENTED_BODY_KEYS = new Set(['period', 'merchants', 'payouts', 'order_by', 'limit'])

interface Seed {
  id: string
  date: number
}

function payout(s: Seed) {
  return {
    id: s.id,
    status: 'PAID_OUT',
    date: s.date,
    amount: 300,
    currency: 'AED',
    merchant_id: '599242',
    settlements_available: true,
    bank_reference: '',
  }
}

function badRequest(msg: string): Error {
  return Object.assign(new Error(`400 ${msg}`), { response: { status: 400 } })
}

/**
 * A fake Tap reading ONLY the documented body: `period.date.from/to` (epoch
 * ms, inclusive), `payouts.payout_id` and `limit` (max 50). Rows come back
 * most recent first, and `has_more` says whether the window held more.
 */
function fakeTap(seeds: Seed[]) {
  const sent: Array<{ path: string; body: Record<string, unknown> }> = []
  const post = vi.fn(async (path: string, body?: Record<string, unknown>) => {
    const b = JSON.parse(JSON.stringify(body ?? {})) as Record<string, unknown>
    sent.push({ path, body: b })
    if (path !== '/payouts/list')
      throw Object.assign(new Error(`404 ${path}`), { response: { status: 404 } })
    for (const k of Object.keys(b))
      if (!DOCUMENTED_BODY_KEYS.has(k)) throw badRequest(`unknown ${k}`)
    const limit = b.limit === undefined ? 25 : Number(b.limit)
    if (!Number.isInteger(limit) || limit < 1 || limit > 50)
      throw badRequest(`limit ${String(b.limit)}`)
    let rows = [...seeds].sort((x, y) => y.date - x.date)
    const ids = (b.payouts as { payout_id?: string[] } | undefined)?.payout_id
    if (ids) rows = rows.filter((r) => ids.includes(r.id))
    const date = (b.period as { date?: { from?: string; to?: string } } | undefined)?.date
    if (date) {
      const from = Number(date.from)
      const to = Number(date.to)
      rows = rows.filter((r) => r.date >= from && r.date <= to)
    }
    const page = rows.slice(0, limit)
    return {
      data: {
        object: 'list',
        live_mode: false,
        api_version: 'V2',
        count: page.length,
        has_more: rows.length > page.length,
        payouts: page.map(payout),
      },
    }
  })
  const get = vi.fn(async () => {
    throw new Error('unexpected GET')
  })
  vi.spyOn(axios, 'create').mockImplementation((() => ({ get, post })) as never)
  return { sent, post, get }
}

function params(p: QueryParams): QueryParams {
  return withPageSink(p)
}

beforeEach(() => {
  _resetCursorPager()
  vi.useFakeTimers({ toFake: ['Date'], now: NOW })
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  _resetCursorPager()
})

describe('Tap Payments listPayouts', () => {
  it('refuses an unbounded list with 501 NOT_SUPPORTED and sends nothing', async () => {
    const { post, get } = fakeTap([])
    const err = await new TapPaymentsAdapter()
      .listPayouts(CREDS, params({ page: 1, limit: 10 }))
      .catch((e: unknown) => e)
    expect(err).toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
    expect(String((err as Error).message)).toMatch(/period/)
    expect(post).not.toHaveBeenCalled()
    expect(get).not.toHaveBeenCalled()
  })

  it('walks 2L+1 payouts over three pages across uneven month windows, each id once', async () => {
    const L = 3
    // Sep: 1, Aug: 0, Jul: 4, Jun: 2 — uneven, with an empty window.
    const seeds: Seed[] = [
      { id: 'payout_sep_1', date: Date.UTC(2026, 8, 3) },
      { id: 'payout_jul_4', date: Date.UTC(2026, 6, 30) },
      { id: 'payout_jul_3', date: Date.UTC(2026, 6, 20) },
      { id: 'payout_jul_2', date: Date.UTC(2026, 6, 10) },
      { id: 'payout_jul_1', date: Date.UTC(2026, 6, 1) },
      { id: 'payout_jun_2', date: Date.UTC(2026, 5, 15) },
      { id: 'payout_jun_1', date: Date.UTC(2026, 5, 2) },
      // Before updatedAfter: never served.
      { id: 'payout_may_1', date: Date.UTC(2026, 4, 30) },
    ]
    fakeTap(seeds)
    const adapter = new TapPaymentsAdapter()
    const updatedAfter = new Date(Date.UTC(2026, 5, 1))
    const pages = []
    for (const page of [1, 2, 3]) {
      const p = params({ page, limit: L, updatedAfter })
      const items = await adapter.listPayouts(CREDS, p)
      pages.push({ ids: items.map((i) => i.id), hasMore: readUpstreamPage(p)?.hasMore })
    }
    expect(pages.flatMap((p) => p.ids)).toEqual(seeds.slice(0, 2 * L + 1).map((s) => s.id))
    expect(pages.map((p) => p.hasMore)).toEqual([true, true, false])
  })

  it('sends only documented parameters: a UTC month window in epoch ms, clipped to updatedAfter', async () => {
    const { sent } = fakeTap([])
    const updatedAfter = new Date(Date.UTC(2026, 7, 14, 9, 30))
    const items = await new TapPaymentsAdapter().listPayouts(
      CREDS,
      params({ page: 1, limit: 10, updatedAfter }),
    )
    expect(items).toEqual([])
    expect(sent).toEqual([
      {
        path: '/payouts/list',
        body: {
          period: {
            date: { from: String(Date.UTC(2026, 8, 1)), to: String(Date.UTC(2026, 9, 1) - 1) },
          },
          limit: 50,
        },
      },
      {
        path: '/payouts/list',
        body: {
          period: {
            date: { from: String(updatedAfter.getTime()), to: String(Date.UTC(2026, 8, 1) - 1) },
          },
          limit: 50,
        },
      },
    ])
  })

  it('splits a month holding more than 50 payouts into UTC days and serves every one', async () => {
    // 60 payouts across 3 days of August, 20 a day, including the month's last UTC day.
    const seeds: Seed[] = []
    for (const d of [31, 10, 5])
      for (let k = 19; k >= 0; k--)
        seeds.push({ id: `payout_aug${d}_${k}`, date: Date.UTC(2026, 7, d) + k * 60_000 })
    const { sent } = fakeTap(seeds)
    const adapter = new TapPaymentsAdapter()
    const updatedAfter = new Date(Date.UTC(2026, 7, 1))
    const got: string[] = []
    let hasMore: boolean | undefined = true
    for (let page = 1; hasMore; page++) {
      const p = params({ page, limit: 25, updatedAfter })
      got.push(...(await adapter.listPayouts(CREDS, p)).map((i) => i.id))
      hasMore = readUpstreamPage(p)?.hasMore
    }
    expect(got).toEqual(seeds.map((s) => s.id))
    const aug31 = sent.find(
      (s) =>
        (s.body.period as { date: { from: string } }).date.from === String(Date.UTC(2026, 7, 31)),
    )
    expect(aug31?.body).toEqual({
      period: {
        date: { from: String(Date.UTC(2026, 7, 31)), to: String(Date.UTC(2026, 8, 1) - 1) },
      },
      limit: 50,
    })
  })

  it('throws rather than drop rows when one UTC day holds more than 50 payouts', async () => {
    const seeds: Seed[] = Array.from({ length: 51 }, (_, k) => ({
      id: `payout_${k}`,
      date: Date.UTC(2026, 8, 2) + k * 1000,
    }))
    fakeTap(seeds)
    const err = await new TapPaymentsAdapter()
      .listPayouts(
        CREDS,
        params({ page: 1, limit: 10, updatedAfter: new Date(Date.UTC(2026, 8, 1)) }),
      )
      .catch((e: unknown) => e)
    expect(err).toBeInstanceOf(Error)
    expect(String((err as Error).message)).toMatch(/more than 50 payouts/)
  })

  it('never requests a window that ends before updatedAfter', async () => {
    const { sent } = fakeTap([])
    const updatedAfter = new Date(Date.UTC(2026, 3, 15))
    await new TapPaymentsAdapter().listPayouts(CREDS, params({ page: 1, limit: 10, updatedAfter }))
    const windows = sent.map((s) => (s.body.period as { date: { from: string; to: string } }).date)
    expect(windows).toHaveLength(6) // Sep, Aug, Jul, Jun, May, Apr
    expect(windows.every((w) => Number(w.to) >= updatedAfter.getTime())).toBe(true)
    expect(windows.every((w) => Number(w.from) >= updatedAfter.getTime())).toBe(true)
  })

  it('stops the day walk of an overflowing month at the day holding updatedAfter', async () => {
    const seeds: Seed[] = []
    for (const d of [20, 10])
      for (let k = 29; k >= 0; k--)
        seeds.push({ id: `payout_aug${d}_${k}`, date: Date.UTC(2026, 7, d) + k * 60_000 })
    const { sent } = fakeTap(seeds)
    const updatedAfter = new Date(Date.UTC(2026, 7, 5, 12))
    const got: string[] = []
    let hasMore: boolean | undefined = true
    for (let page = 1; hasMore; page++) {
      const p = params({ page, limit: 50, updatedAfter })
      got.push(...(await new TapPaymentsAdapter().listPayouts(CREDS, p)).map((i) => i.id))
      hasMore = readUpstreamPage(p)?.hasMore
    }
    expect(got).toEqual(seeds.map((s) => s.id))
    const windows = sent.map((s) => (s.body.period as { date: { from: string; to: string } }).date)
    expect(windows.every((w) => Number(w.to) >= updatedAfter.getTime())).toBe(true)
    // The last window is Aug 5 itself, from updatedAfter to the day's end.
    expect(windows[windows.length - 1]).toEqual({
      from: String(updatedAfter.getTime()),
      to: String(Date.UTC(2026, 7, 6) - 1),
    })
  })
})

describe('Tap Payments getPayout', () => {
  it('reads one payout through POST /payouts/list with payouts.payout_id', async () => {
    const { sent, get } = fakeTap([
      { id: 'payout_a', date: Date.UTC(2026, 8, 1) },
      { id: 'payout_b', date: Date.UTC(2026, 8, 2) },
    ])
    const result = await new TapPaymentsAdapter().getPayout(CREDS, 'payout_a')
    expect(result.id).toBe('payout_a')
    expect(sent).toEqual([
      { path: '/payouts/list', body: { payouts: { payout_id: ['payout_a'] } } },
    ])
    expect(get).not.toHaveBeenCalled()
  })

  it('answers 404 when Tap returns no payout with that id', async () => {
    fakeTap([{ id: 'payout_a', date: Date.UTC(2026, 8, 1) }])
    const err = await new TapPaymentsAdapter()
      .getPayout(CREDS, 'payout_zz')
      .catch((e: unknown) => e)
    expect(err).toMatchObject({ statusCode: 404 })
  })

  it('never returns a different payout than the id asked for', async () => {
    // A response that ignored the payout_id filter must not be read as the answer.
    vi.spyOn(axios, 'create').mockImplementation((() => ({
      get: vi.fn(),
      post: vi.fn(async () => ({
        data: {
          object: 'list',
          has_more: false,
          payouts: [payout({ id: 'payout_other', date: 1 })],
        },
      })),
    })) as never)
    const err = await new TapPaymentsAdapter()
      .getPayout(CREDS, 'payout_zz')
      .catch((e: unknown) => e)
    expect(err).toMatchObject({ statusCode: 404 })
  })
})
