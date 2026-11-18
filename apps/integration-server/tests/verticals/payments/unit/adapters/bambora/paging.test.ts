/**
 * Bambora NA paging contract: listCharges and listRefunds.
 *
 * Both list through the Reporting API's transaction search, POST /v1/reports
 * (https://docs.na.worldline-solutions.com/build-your-integration/reporting-apis/payment_search_query):
 *
 *   "If you are searching for possibly a lot of records, these parameters let
 *    you page the results. The starting row value must be 1 or greater. If you
 *    are just looking to retrieve one row, set the start row to 1 and the end
 *    row to 2. If the difference between start and end rows is greater than
 *    500, only the top 500 records will be retrieved."
 *
 * So start_row is 1-based, the window is end-exclusive (1..2 is one row), and
 * a window wider than 500 is cut to 500. The response (SearchResult) is only
 * `{ records }`: no total, no has-more. Criteria index 8 is TransType, and 'R'
 * is a return.
 *
 * The adapter asks for 500-row windows and cuts the caller's pages out of them
 * with pageByRows, so a small page is served from a window already fetched and
 * page 2 sends a request only when it crosses a window boundary.
 *
 * The fake below honours ONLY those documented parameters. A second variant
 * reads the window as end-inclusive, because the spec text ("should always be
 * 1 larger than start_row") and the guide could be read either way; the
 * adapter must serve every row once under both readings.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import {
  withPageSink,
  readUpstreamPage,
  parseListQuery,
  listPage,
  _resetRowPager,
} from '@opensteward/shared'
import type { PageMaxBearing, QueryParams } from '@opensteward/shared'
import { BamboraAdapter } from '../../../../../../src/verticals/payments/adapters/bambora/index'

const CREDS = { accessToken: 'bmb_test' }
/** Documented: "only the top 500 records will be retrieved." */
const SEARCH_MAX = 500

interface SearchBody {
  name: string
  start_date: string
  end_date: string
  start_row: number
  end_row: number
  criteria?: Array<{ field: number; operator: string; value: string }>
}

interface Row {
  trn_id: number
  trn_type: 'P' | 'R'
}

/**
 * A fake POST /reports. `rows` is every transaction in the account; the
 * criteria (TransType = value, index 8) and the row window select from it.
 */
function fakeSearch(rows: Row[], opts: { endInclusive?: boolean } = {}): { bodies: SearchBody[] } {
  const bodies: SearchBody[] = []
  const post = vi.fn(async (path: string, body: SearchBody) => {
    if (path !== '/reports') throw new Error(`unexpected path ${path}`)
    bodies.push(JSON.parse(JSON.stringify(body)) as SearchBody)
    if (body.name !== 'Search') throw new Error('name must be Search')
    if (!Number.isInteger(body.start_row) || body.start_row < 1) {
      throw Object.assign(new Error('start_row must be 1 or greater'), {
        response: { status: 400 },
      })
    }
    let matched = rows
    for (const c of body.criteria ?? []) {
      if (c.field === 8 && c.operator === '%3D') {
        matched = matched.filter((r) => r.trn_type === c.value)
      } else if (c.field === 1 && c.operator === '%3D') {
        matched = matched.filter((r) => String(r.trn_id) === c.value)
      } else {
        throw new Error(`unsupported criterion ${JSON.stringify(c)}`)
      }
    }
    const diff = body.end_row - body.start_row
    const count = diff > SEARCH_MAX ? SEARCH_MAX : Math.max(0, diff + (opts.endInclusive ? 1 : 0))
    const from = body.start_row - 1
    return {
      data: {
        records: matched.slice(from, from + count).map((r) => ({
          trn_id: r.trn_id,
          trn_type: r.trn_type,
          trn_amount: 1.23,
          trn_date_time: '2026-09-01 10:00:00',
          trn_response: 1,
        })),
      },
    }
  })
  vi.spyOn(axios, 'create').mockReturnValue({ get: vi.fn(), post, defaults: {} } as never)
  return { bodies }
}

function charges(n: number): Row[] {
  return Array.from({ length: n }, (_, i) => ({ trn_id: 10_000_000 + i, trn_type: 'P' as const }))
}

/** Refunds interleaved with purchases, so the TransType filter has to bite. */
function mixed(refunds: number): { rows: Row[]; refundIds: string[] } {
  const rows: Row[] = []
  const refundIds: string[] = []
  for (let i = 0; i < refunds; i++) {
    rows.push({ trn_id: 20_000_000 + 2 * i, trn_type: 'P' })
    rows.push({ trn_id: 20_000_001 + 2 * i, trn_type: 'R' })
    refundIds.push(String(20_000_001 + 2 * i))
  }
  return { rows, refundIds }
}

type ListFn = 'listCharges' | 'listRefunds'

async function drive(
  method: ListFn,
  L: number,
  pages: number,
): Promise<{ ids: string[]; hasMore: Array<boolean | undefined>; sizes: number[] }> {
  const adapter = new BamboraAdapter()
  const ids: string[] = []
  const hasMore: Array<boolean | undefined> = []
  const sizes: number[] = []
  for (let page = 1; page <= pages; page++) {
    const params = withPageSink({ page, limit: L } as QueryParams)
    const out = await adapter[method](CREDS, params)
    sizes.push(out.length)
    ids.push(...out.map((r) => r.id))
    hasMore.push(readUpstreamPage(params)?.hasMore)
  }
  return { ids, hasMore, sizes }
}

afterEach(() => {
  vi.restoreAllMocks()
  _resetRowPager()
})

describe('Bambora listCharges paging', () => {
  it('serves 2L+1 charges once each, in order, across pages 1..3 with exact hasMore', async () => {
    const L = 4
    const rows = charges(2 * L + 1)
    fakeSearch(rows)
    const { ids, hasMore, sizes } = await drive('listCharges', L, 3)
    expect(ids).toEqual(rows.map((r) => String(r.trn_id)))
    expect(sizes).toEqual([L, L, 1])
    expect(hasMore).toEqual([true, true, false])
  })

  it('serves 2L+1 charges once each across a window boundary', async () => {
    const L = 300
    const rows = charges(2 * L + 1)
    fakeSearch(rows)
    const { ids, hasMore, sizes } = await drive('listCharges', L, 3)
    expect(ids).toEqual(rows.map((r) => String(r.trn_id)))
    expect(sizes).toEqual([L, L, 1])
    expect(hasMore).toEqual([true, true, false])
  })

  it('serves every row once when the upstream reads end_row as inclusive', async () => {
    const L = 300
    const rows = charges(2 * L + 1)
    const { bodies } = fakeSearch(rows, { endInclusive: true })
    const { ids, hasMore } = await drive('listCharges', L, 3)
    expect(ids).toEqual(rows.map((r) => String(r.trn_id)))
    expect(hasMore).toEqual([true, true, false])
    // 501 rows came back from the first window, so the next starts at row 502.
    expect(bodies.map((b) => b.start_row)).toEqual([1, 502])
  })

  it('moves start_row to the next window on page 2, over the same date window', async () => {
    const L = 300
    const { bodies } = fakeSearch(charges(2 * L + 1))
    await drive('listCharges', L, 2)
    expect(bodies.map((b) => b.start_row)).toEqual([1, SEARCH_MAX + 1])
    for (const b of bodies) expect(b.end_row - b.start_row).toBe(SEARCH_MAX)
    expect(bodies[1]!.start_date).toBe(bodies[0]!.start_date)
    expect(bodies[1]!.end_date).toBe(bodies[0]!.end_date)
  })

  it('keeps the date window fixed while the clock moves between pages', async () => {
    const L = 300
    const rows = charges(2 * L + 1)
    const { bodies } = fakeSearch(rows)
    const adapter = new BamboraAdapter()
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      vi.setSystemTime(new Date('2026-09-23T10:00:00Z'))
      const p1 = withPageSink({ page: 1, limit: L } as QueryParams)
      await adapter.listCharges(CREDS, p1)
      vi.setSystemTime(new Date('2026-09-23T10:07:31Z'))
      const p2 = withPageSink({ page: 2, limit: L } as QueryParams)
      const out = await adapter.listCharges(CREDS, p2)
      expect(out.map((c) => c.id)).toEqual(rows.slice(L, 2 * L).map((r) => String(r.trn_id)))
    } finally {
      vi.useRealTimers()
    }
    expect(bodies.length).toBeGreaterThanOrEqual(2)
    for (const b of bodies) {
      expect(b.start_date).toBe(bodies[0]!.start_date)
      expect(b.end_date).toBe(bodies[0]!.end_date)
    }
  })

  it('serves a page asked for cold, with no earlier page in memory', async () => {
    const L = 300
    const rows = charges(2 * L + 1)
    fakeSearch(rows)
    const adapter = new BamboraAdapter()
    const params = withPageSink({ page: 2, limit: L } as QueryParams)
    const out = await adapter.listCharges(CREDS, params)
    expect(out.map((c) => c.id)).toEqual(rows.slice(L, 2 * L).map((r) => String(r.trn_id)))
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
  })

  it('reports an exact end when the collection is a multiple of the page size', async () => {
    const L = 4
    const rows = charges(2 * L)
    fakeSearch(rows)
    const { ids, hasMore } = await drive('listCharges', L, 2)
    expect(ids).toEqual(rows.map((r) => String(r.trn_id)))
    expect(hasMore).toEqual([true, false])
  })

  it('keeps every request within 500 rows at a limit above 500, and serves every row once', async () => {
    const rows = charges(1201)
    const { bodies } = fakeSearch(rows)
    const { ids, hasMore } = await drive('listCharges', 1000, 2)
    expect(ids).toEqual(rows.map((r) => String(r.trn_id)))
    expect(hasMore).toEqual([true, false])
    for (const b of bodies) expect(b.end_row - b.start_row).toBeLessThanOrEqual(SEARCH_MAX)
  })

  it('gives meta.hasMore through parseListQuery and listPage', async () => {
    fakeSearch(charges(7))
    const adapter = new BamboraAdapter()
    const p1 = parseListQuery({ limit: '3', page: '1' }, adapter as unknown as PageMaxBearing)
    const e1 = listPage(await adapter.listCharges(CREDS, p1), p1, 'bambora')
    expect(e1.data.map((c) => c.id)).toEqual(['10000000', '10000001', '10000002'])
    expect(e1.meta.hasMore).toBe(true)

    const p3 = parseListQuery({ limit: '3', page: '3' }, adapter as unknown as PageMaxBearing)
    const e3 = listPage(await adapter.listCharges(CREDS, p3), p3, 'bambora')
    expect(e3.data.map((c) => c.id)).toEqual(['10000006'])
    expect(e3.meta.hasMore).toBe(false)
  })
})

describe('Bambora search pager keys and date window', () => {
  it('never serves one connection the rows another connection fetched', async () => {
    const L = 300
    const rowsA = charges(2 * L + 1)
    const rowsB = Array.from({ length: 2 * L + 1 }, (_, i) => ({
      trn_id: 30_000_000 + i,
      trn_type: 'P' as const,
    }))
    const adapter = new BamboraAdapter()
    fakeSearch(rowsA)
    await adapter.listCharges(
      { accessToken: 'bmb_conn_a' },
      withPageSink({ page: 1, limit: L } as QueryParams),
    )
    vi.restoreAllMocks()
    fakeSearch(rowsB)
    const out = await adapter.listCharges(
      { accessToken: 'bmb_conn_b' },
      withPageSink({ page: 2, limit: L } as QueryParams),
    )
    expect(out.map((c) => c.id)).toEqual(rowsB.slice(L, 2 * L).map((r) => String(r.trn_id)))
  })

  it('searches from UTC midnight 90 days before today to the coming UTC midnight', async () => {
    const { bodies } = fakeSearch(charges(3))
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      vi.setSystemTime(new Date('2026-09-23T10:00:00Z'))
      await new BamboraAdapter().listCharges(
        CREDS,
        withPageSink({ page: 1, limit: 10 } as QueryParams),
      )
    } finally {
      vi.useRealTimers()
    }
    expect(bodies[0]!.start_date).toBe('2026-06-25T00:00:00')
    expect(bodies[0]!.end_date).toBe('2026-09-24T00:00:00')
  })

  it('starts a fresh walk over the new window when UTC midnight passes between pages', async () => {
    const L = 300
    const rows = charges(2 * L + 1)
    const { bodies } = fakeSearch(rows)
    const adapter = new BamboraAdapter()
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      vi.setSystemTime(new Date('2026-09-23T23:59:50Z'))
      await adapter.listCharges(CREDS, withPageSink({ page: 1, limit: L } as QueryParams))
      const before = bodies.length
      vi.setSystemTime(new Date('2026-09-24T00:00:10Z'))
      const out = await adapter.listCharges(
        CREDS,
        withPageSink({ page: 2, limit: L } as QueryParams),
      )
      expect(out.map((c) => c.id)).toEqual(rows.slice(L, 2 * L).map((r) => String(r.trn_id)))
      const after = bodies.slice(before)
      expect(after[0]!.start_row).toBe(1)
      for (const b of after) expect(b.end_date).toBe('2026-09-25T00:00:00')
    } finally {
      vi.useRealTimers()
    }
  })

  it('serves the default page size of 100 when the caller sends no limit', async () => {
    const rows = charges(150)
    fakeSearch(rows)
    const params = withPageSink({ page: 1 } as QueryParams)
    const out = await new BamboraAdapter().listCharges(CREDS, params)
    expect(out.map((c) => c.id)).toEqual(rows.slice(0, 100).map((r) => String(r.trn_id)))
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
  })
})

describe('Bambora listRefunds paging', () => {
  it('serves 2L+1 refunds once each, in order, across pages 1..3 with exact hasMore', async () => {
    const L = 4
    const { rows, refundIds } = mixed(2 * L + 1)
    fakeSearch(rows)
    const { ids, hasMore, sizes } = await drive('listRefunds', L, 3)
    expect(ids).toEqual(refundIds)
    expect(sizes).toEqual([L, L, 1])
    expect(hasMore).toEqual([true, true, false])
  })

  it('filters on TransType (criteria index 8) = R', async () => {
    const { rows } = mixed(3)
    const { bodies } = fakeSearch(rows)
    await drive('listRefunds', 10, 1)
    expect(bodies[0]!.criteria).toEqual([{ field: 8, operator: '%3D', value: 'R' }])
  })

  it('moves start_row to the next window on page 2', async () => {
    const L = 300
    const { rows, refundIds } = mixed(2 * L + 1)
    const { bodies } = fakeSearch(rows)
    const { ids, hasMore } = await drive('listRefunds', L, 3)
    expect(ids).toEqual(refundIds)
    expect(hasMore).toEqual([true, true, false])
    expect(bodies.map((b) => b.start_row)).toEqual([1, SEARCH_MAX + 1])
  })

  it('keeps every request within 500 rows at a limit above 500, and serves every row once', async () => {
    const { rows, refundIds } = mixed(1001)
    const { bodies } = fakeSearch(rows)
    const { ids, hasMore } = await drive('listRefunds', 1000, 2)
    expect(ids).toEqual(refundIds)
    expect(hasMore).toEqual([true, false])
    for (const b of bodies) expect(b.end_row - b.start_row).toBeLessThanOrEqual(SEARCH_MAX)
  })

  it('gives meta.hasMore through parseListQuery and listPage', async () => {
    const { rows, refundIds } = mixed(5)
    fakeSearch(rows)
    const adapter = new BamboraAdapter()
    const p1 = parseListQuery({ limit: '2', page: '1' }, adapter as unknown as PageMaxBearing)
    const e1 = listPage(await adapter.listRefunds(CREDS, p1), p1, 'bambora')
    expect(e1.data.map((r) => r.id)).toEqual(refundIds.slice(0, 2))
    expect(e1.meta.hasMore).toBe(true)

    const p3 = parseListQuery({ limit: '2', page: '3' }, adapter as unknown as PageMaxBearing)
    const e3 = listPage(await adapter.listRefunds(CREDS, p3), p3, 'bambora')
    expect(e3.data.map((r) => r.id)).toEqual(refundIds.slice(4))
    expect(e3.meta.hasMore).toBe(false)
  })
})
