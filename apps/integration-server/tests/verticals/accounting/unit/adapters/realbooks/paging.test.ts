/**
 * RealBooks listInvoices / listBills paging: the upstream returns the whole
 * date window in one response, so the adapter slices it locally.
 *
 * Both methods call the day-book bill-details report. The vendor's only
 * technical reference, the 72-page API PDF
 *   https://www.realbooks.in/wp-content/uploads/2024/03/api_documentation.pdf
 * documents the request as a date-window report with no paging field at all
 * (page 62, verbatim):
 *   20. fetch daybook billdetails
 *   url - https://api.realbooks.in/AMSSERVICE/api/dailyreport/fetchBillDetails
 *   { "cid": 0, "segid": 0, "secretKey": "", "accessKey": "",
 *     "fromDate": "01-01-2022", "toDate": "09-07-2022", "ledgerName": "",
 *     "ledgerGroupName": "sundry debtors", "billRefNo": "B62" }
 * No page, offset, size, limit or cursor appears anywhere in the PDF (every
 * "limit" in it is the ledger field crLimit). The adapter once sent an
 * undocumented `limit`, which a server that honoured it would use to truncate
 * the window before the slice, so it no longer sends one: every request body
 * in this file is checked for exactly the documented fields.
 *
 * The slice is only right when the window is the whole collection and the
 * same on every page, so the window is pinned too: the whole history when the
 * caller gives no updatedAfter, and fixed rather than read from the clock.
 *
 * No maximum page size is documented, so the adapter declares none, and a
 * limit reaches pageLocally exactly as the router (or a direct caller) sent it.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import axios from 'axios'
import {
  listPage,
  parseListQuery,
  readUpstreamPage,
  withPageSink,
  type QueryParams,
} from '@opensteward/shared'
import type { AccountingAdapter } from '../../../../../../src/verticals/accounting/adapter/interface'
import { RealbooksAdapter } from '../../../../../../src/verticals/accounting/adapters/realbooks/index'

/** The adapter as the router holds it, for parseListQuery to read its maximum from. */
const ROUTED: AccountingAdapter = new RealbooksAdapter()

const CREDS = {
  accessToken: 'secret-key',
  extra: {
    accessKey: 'access-key',
    emailid: 'ops@example.test',
    cid: '12',
    segid: '3',
    accountName: 'demo',
  },
}

const BILL_DETAILS = '/AMSSERVICE/api/dailyreport/fetchBillDetails'

/**
 * The request fields page 62 of the PDF documents for fetchBillDetails, plus
 * `emailid`, which the client puts in every request body as part of the
 * credentials (the PDF lists it on most endpoints). Nothing about paging.
 */
const DOCUMENTED_KEYS = [
  'accessKey',
  'billRefNo',
  'cid',
  'emailid',
  'fromDate',
  'ledgerGroupName',
  'ledgerName',
  'secretKey',
  'segid',
  'toDate',
]

/** The window an unfiltered list asks for: every voucher, as the get methods ask. */
const WHOLE_HISTORY = { fromDate: '01-01-2000', toDate: '31-12-2099' }

type Group = 'sundry debtors' | 'sundry creditors'

interface Voucher {
  id: number
  transactionNumber: string
  transactionDate: string
  transactionType: string
  ledgerGroupName: Group
  partyLedger: { ledgerName: string }
}

const DAY = 24 * 60 * 60 * 1000

/** DD-MM-YYYY in local time. */
function ddmmyyyy(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  return `${dd}-${mm}-${d.getFullYear()}`
}

/** DD-MM-YYYY → YYYYMMDD, so dates compare as numbers. */
function dayNumber(raw: unknown): number {
  const [dd, mm, yyyy] = String(raw).split('-')
  return Number(`${yyyy}${mm}${dd}`)
}

/** `count` vouchers from `firstId`, dated from `dates` (DD-MM-YYYY) in turn. */
function vouchers(group: Group, count: number, firstId: number, dates: string[]): Voucher[] {
  return Array.from({ length: count }, (_, i) => ({
    id: firstId + i,
    transactionNumber: `${group === 'sundry debtors' ? 'S' : 'P'}${firstId + i}`,
    transactionDate: dates[i % dates.length]!,
    transactionType: group === 'sundry debtors' ? 'Sales' : 'Purchase',
    ledgerGroupName: group,
    partyLedger: { ledgerName: `${group} party ${i % 3}` },
  }))
}

function ids(firstId: number, count: number): string[] {
  return Array.from({ length: count }, (_, i) => String(firstId + i))
}

/** Interleave several lists row by row, so a filter that ignores one shows. */
function interleave<T>(...lists: T[][]): T[] {
  const out: T[] = []
  const longest = Math.max(...lists.map((l) => l.length))
  for (let i = 0; i < longest; i++) for (const l of lists) if (i < l.length) out.push(l[i]!)
  return out
}

/** Every request body the fake received in the current test. */
let bodies: Array<Record<string, unknown>> = []

/**
 * A fake RealBooks that serves fetchBillDetails reading ONLY the documented
 * body fields: the credentials, fromDate/toDate (an inclusive DD-MM-YYYY
 * window), ledgerGroupName, ledgerName and billRefNo. Any other field (an
 * undocumented `limit`, `page`, `offset`) is ignored, as the PDF gives the
 * server no such parameter; the check after each test is what catches one.
 * There is no paging: every request answers with every voucher in the window.
 */
function fakeRealBooks(store: Voucher[], opts: { envelope?: 'data' | 'list' | 'result' } = {}) {
  const post = vi.fn(async (path: string, body: Record<string, unknown>) => {
    bodies.push(body)
    if (path !== BILL_DETAILS) throw new Error(`404: ${path}`)
    if (
      body['secretKey'] !== CREDS.accessToken ||
      body['accessKey'] !== CREDS.extra.accessKey ||
      body['cid'] !== 12 ||
      body['segid'] !== 3
    ) {
      throw Object.assign(new Error('401'), { response: { status: 401 } })
    }
    const from = dayNumber(body['fromDate'])
    const to = dayNumber(body['toDate'])
    const group = String(body['ledgerGroupName'] ?? '').toLowerCase()
    const ledgerName = String(body['ledgerName'] ?? '')
    const billRefNo = String(body['billRefNo'] ?? '')
    const rows = store.filter(
      (v) =>
        dayNumber(v.transactionDate) >= from &&
        dayNumber(v.transactionDate) <= to &&
        (!group || v.ledgerGroupName === group) &&
        (!ledgerName || v.partyLedger.ledgerName === ledgerName) &&
        (!billRefNo || v.transactionNumber === billRefNo),
    )
    return { data: { [opts.envelope ?? 'data']: rows } }
  })
  vi.spyOn(axios, 'create').mockReturnValue({
    post,
    get: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  } as never)
  return { post }
}

const METHODS = [
  { method: 'listInvoices', group: 'sundry debtors', other: 'sundry creditors' },
  { method: 'listBills', group: 'sundry creditors', other: 'sundry debtors' },
] as const

type Method = (typeof METHODS)[number]['method']

/**
 * Dates across the whole history: today, tomorrow (from 18:30 UTC, a voucher
 * made in IST is already dated tomorrow), 400 days back, and 2003. A window
 * narrower than the whole history drops some of them.
 */
function historyDates(): string[] {
  const now = Date.now()
  return [
    ddmmyyyy(new Date(now)),
    ddmmyyyy(new Date(now + DAY)),
    ddmmyyyy(new Date(now - 400 * DAY)),
    '15-06-2003',
  ]
}

/**
 * A store of `count` vouchers of `group` (ids from 1001) dated across the
 * whole history, interleaved with as many of the other group.
 */
function storeOf(group: Group, other: Group, count: number): Voucher[] {
  const dates = historyDates()
  return interleave(vouchers(group, count, 1001, dates), vouchers(other, count, 50001, dates))
}

async function list(method: Method, params: QueryParams): Promise<Array<string | undefined>> {
  return (await new RealbooksAdapter()[method](CREDS, params)).map((r) => r.id)
}

/** Drive a list method as the sync worker does: one sink per page. */
async function drive(method: Method, pages: number, limit: number, extra: QueryParams = {}) {
  const rows: Array<string | undefined> = []
  const hasMore: Array<boolean | undefined> = []
  const totals: Array<number | undefined> = []
  for (let page = 1; page <= pages; page++) {
    const params = withPageSink({ ...extra, page, limit })
    rows.push(...(await list(method, params)))
    hasMore.push(readUpstreamPage(params)?.hasMore)
    totals.push(readUpstreamPage(params)?.totalCount)
  }
  return { rows, hasMore, totals }
}

const ORIGINAL_TZ = process.env.TZ

afterEach(() => {
  const sent = bodies
  bodies = []
  vi.useRealTimers()
  if (ORIGINAL_TZ === undefined) delete process.env.TZ
  else process.env.TZ = ORIGINAL_TZ
  vi.restoreAllMocks()
  // Every request of every test, at every page and every limit (500, the
  // sync worker's, included), carries exactly the documented fields.
  for (const body of sent) expect(Object.keys(body).sort()).toEqual(DOCUMENTED_KEYS)
})

describe.each(METHODS)('realbooks $method pages locally over the date window', (m) => {
  const { method, group, other } = m

  it('N = 2L + 1: three worker pages serve every voucher once, in order', async () => {
    const L = 10
    const { post } = fakeRealBooks(storeOf(group, other, 2 * L + 1))
    const { rows, hasMore, totals } = await drive(method, 3, L)
    expect(rows).toEqual(ids(1001, 2 * L + 1))
    expect(hasMore).toEqual([true, true, false])
    expect(totals).toEqual([21, 21, 21])
    // Each page is the same whole-history report, asked for with only the
    // documented fields, because the report reads no paging field.
    expect(post).toHaveBeenCalledTimes(3)
    const [path, body] = post.mock.calls[1]!
    expect(path).toBe(BILL_DETAILS)
    expect(body).toMatchObject({
      ...WHOLE_HISTORY,
      ledgerGroupName: group,
      ledgerName: '',
      billRefNo: '',
    })
    expect(body).not.toHaveProperty('limit')
    expect(body).toEqual(post.mock.calls[0]![1])
    expect(body).toEqual(post.mock.calls[2]![1])
  })

  it('N = 2L: page 2 is the last page and page 3 is empty', async () => {
    const L = 10
    fakeRealBooks(storeOf(group, other, 2 * L))
    const { rows, hasMore } = await drive(method, 3, L)
    expect(rows).toEqual(ids(1001, 2 * L))
    expect(hasMore).toEqual([true, false, false])
  })

  it.each(['list', 'result'] as const)('reads the { %s } body shape the same way', async (e) => {
    fakeRealBooks(storeOf(group, other, 7), { envelope: e })
    const { rows, hasMore } = await drive(method, 3, 3)
    expect(rows).toEqual(ids(1001, 7))
    expect(hasMore).toEqual([true, true, false])
  })

  it('a limit above the router maximum is clamped to 500 by parseListQuery and still serves every voucher', async () => {
    const N = 2 * 500 + 1
    fakeRealBooks(storeOf(group, other, N))
    const rows: Array<string | undefined> = []
    const hasMore: Array<boolean | undefined> = []
    for (const page of ['1', '2', '3']) {
      const params = parseListQuery({ page, limit: '9999' }, ROUTED)
      expect(params.limit).toBe(500)
      rows.push(...(await list(method, params)))
      hasMore.push(readUpstreamPage(params)?.hasMore)
    }
    expect(rows).toEqual(ids(1001, N))
    expect(hasMore).toEqual([true, true, false])
  })

  it('a direct limit of 1000 is honoured as asked, since no maximum is documented', async () => {
    fakeRealBooks(storeOf(group, other, 2500))
    const { rows, hasMore } = await drive(method, 3, 1000)
    expect(rows).toEqual(ids(1001, 2500))
    expect(hasMore).toEqual([true, true, false])
  })

  it('the limit as parseListQuery delivers it: page 2 of limit 10 is vouchers 11-20', async () => {
    fakeRealBooks(storeOf(group, other, 35))
    const params = parseListQuery({ page: '2', limit: '10' }, ROUTED)
    expect(await list(method, params)).toEqual(ids(1011, 10))
    expect(readUpstreamPage(params)).toMatchObject({ hasMore: true, totalCount: 35 })
  })

  it('a missing page is page 1', async () => {
    fakeRealBooks(storeOf(group, other, 35))
    expect(await list(method, parseListQuery({ limit: '10' }))).toEqual(ids(1001, 10))
  })

  it('updatedAfter narrows the window to vouchers dated on or after it, on every page, and that window is paged', async () => {
    // 12:00 UTC on 9 March 2026 is 9 March in every zone from UTC−12 to UTC+11.
    const since = new Date('2026-03-09T12:00:00Z')
    const { post } = fakeRealBooks(
      interleave(
        vouchers(group, 5, 1001, ['09-03-2026', '10-03-2026', '23-09-2026']),
        vouchers(group, 3, 90001, ['08-03-2026', '01-01-2024']),
        vouchers(other, 5, 50001, ['10-03-2026']),
      ),
    )
    const { rows, hasMore, totals } = await drive(method, 3, 2, { updatedAfter: since })
    expect(rows).toEqual(ids(1001, 5))
    expect(hasMore).toEqual([true, true, false])
    expect(totals).toEqual([5, 5, 5])
    for (const [, body] of post.mock.calls) {
      expect(body).toMatchObject({ fromDate: '09-03-2026', toDate: WHOLE_HISTORY.toDate })
    }
  })

  // 02:00 UTC on 9 March 2026 is 07:30 on 9 March in IST and 16:00 on 9 March
  // on Kiritimati (UTC+14), but 16:00 on 8 March in Hawaii (UTC−10). A voucher
  // made after that instant is dated 8 March where the day has not turned yet,
  // so the window has to open on 8 March, whatever zone the server runs in.
  it.each(['UTC', 'Asia/Kolkata', 'Pacific/Kiritimati', 'America/Los_Angeles'])(
    'with the process in %s, updatedAfter opens the window on the earliest calendar date at that instant',
    async (tz) => {
      process.env.TZ = tz
      const since = new Date('2026-03-09T02:00:00Z')
      fakeRealBooks(
        interleave(
          vouchers(group, 2, 1001, ['08-03-2026', '09-03-2026']),
          vouchers(group, 1, 90001, ['07-03-2026']),
        ),
      )
      expect(await list(method, withPageSink({ updatedAfter: since, page: 1, limit: 10 }))).toEqual(
        ids(1001, 2),
      )
      expect(bodies[0]).toMatchObject({ fromDate: '08-03-2026', toDate: WHOLE_HISTORY.toDate })
    },
  )

  it('a walk that crosses midnight asks for the same window on every page and serves every voucher once', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-09-23T23:59:30Z'))
    // Two vouchers a day, oldest first, from 20 August to 24 September.
    const days: string[] = []
    for (let t = Date.UTC(2026, 7, 20); t <= Date.UTC(2026, 8, 24); t += DAY) {
      const day = ddmmyyyy(new Date(t))
      days.push(day, day)
    }
    const { post } = fakeRealBooks(
      interleave(vouchers(group, 72, 1001, days), vouchers(other, 72, 50001, days)),
    )
    const rows: Array<string | undefined> = []
    const hasMore: Array<boolean | undefined> = []
    for (let page = 1; page <= 8; page++) {
      if (page === 2) vi.setSystemTime(new Date('2026-09-24T00:00:30Z'))
      const params = withPageSink({ page, limit: 10 })
      rows.push(...(await list(method, params)))
      hasMore.push(readUpstreamPage(params)?.hasMore)
    }
    expect(rows).toEqual(ids(1001, 72))
    expect(hasMore).toEqual([true, true, true, true, true, true, true, false])
    for (const [, body] of post.mock.calls) expect(body).toMatchObject(WHOLE_HISTORY)
  })

  it('a direct call with no limit returns every voucher in the window and reports the end', async () => {
    fakeRealBooks(storeOf(group, other, 300))
    const params = withPageSink({})
    expect(await list(method, params)).toEqual(ids(1001, 300))
    expect(readUpstreamPage(params)).toMatchObject({ hasMore: false, totalCount: 300 })
  })
})

describe('realbooks declares no maximum page size', () => {
  it('none is documented, so none is declared', () => {
    expect(ROUTED.capabilities?.maxPageSize).toBe(undefined)
  })
})

describe.each(METHODS)('realbooks $method through the API path', (m) => {
  const { method, group, other } = m
  const adapter = new RealbooksAdapter()

  async function apiPage(query: Record<string, string>) {
    const params = parseListQuery(query, ROUTED)
    const items = await adapter[method](CREDS, params)
    return listPage<{ id?: string }>(items, params, 'realbooks')
  }

  it('meta.hasMore is true on a full page with more behind it and false on the last', async () => {
    fakeRealBooks(storeOf(group, other, 21))
    const p1 = await apiPage({ page: '1', limit: '10' })
    const p2 = await apiPage({ page: '2', limit: '10' })
    const p3 = await apiPage({ page: '3', limit: '10' })
    expect([...p1.data, ...p2.data, ...p3.data].map((r) => r.id)).toEqual(ids(1001, 21))
    expect([p1.meta.hasMore, p2.meta.hasMore, p3.meta.hasMore]).toEqual([true, true, false])
    expect(p1.meta.totalCount).toBe(21)
  })

  it('meta.hasMore is false on a full last page (N = 2L), not null', async () => {
    fakeRealBooks(storeOf(group, other, 20))
    const p2 = await apiPage({ page: '2', limit: '10' })
    expect(p2.data.map((r) => r.id)).toEqual(ids(1011, 10))
    expect(p2.meta.hasMore).toBe(false)
  })
})
