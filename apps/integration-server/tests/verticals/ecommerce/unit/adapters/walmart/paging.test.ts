/**
 * Paging for Walmart Marketplace's list methods, against the first-party docs.
 *
 * - GET /v3/settings/shipping/shipnodes (listLocations):
 *   https://developer.walmart.com/us-marketplace/reference/getallfulfillmentcenters —
 *   "The Get all fulfillment centers API retrieves fulfillment centers (also
 *   known as ship nodes) information on your account." Its only query
 *   parameter is `includeCalendarDayConfiguration`; there is no limit, offset,
 *   page or cursor, and the 200 response is a bare array. The whole collection
 *   comes back, so the adapter pages it locally.
 * - GET /v3/report/reconreport/reconFileJson (listTransactions):
 *   https://developer.walmart.com/us-marketplace/reference/getavailablev1reconreportasjson-1 —
 *   `reportDate`, `offset` ("starting number of the bytes, initial value for
 *   the offset is zero") and `noOfRecords` ("number of records in the report
 *   (max limit 1000)") are all required; `nextOffset` "will be used in
 *   subsequent calls to fetch next set of records." A BYTE offset, so page N
 *   is reachable only by walking `nextOffset` from 0.
 * - GET /v3/report/reconreport/availableReconFiles?reportVersion=v1:
 *   https://developer.walmart.com/us-marketplace/reference/getavailablev1reconreportdates-1 —
 *   `availableApReportDates`, "All available report dates are returned".
 *   With no `reportDate` from the caller, every available report is walked.
 *
 * The adapter used to send none of the three required recon params (offset 0
 * was dropped by a falsy guard), and read `res.shipNodes` off a response that
 * is a bare array. The fake upstream honours only the documented parameters.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import axios from 'axios'
import {
  _resetCursorPager,
  listPage,
  parseListQuery,
  readUpstreamPage,
  withPageSink,
  type Credentials,
  type QueryParams,
} from '@opensteward/shared'
import { WalmartAdapter } from '../../../../../../src/verticals/ecommerce/adapters/walmart/index'

const CREDS: Credentials = { accessToken: 'tok', extra: { clientId: 'cid', clientSecret: 's' } }

const SHIPNODES = '/v3/settings/shipping/shipnodes'
const RECON = '/v3/report/reconreport/reconFileJson'
const DATES = '/v3/report/reconreport/availableReconFiles'
const RECON_MAX = 1000
/** Bytes per CSV line in the fake report; the header line is this long too. */
const LINE = 40

interface Call {
  path: string
  params: Record<string, unknown> | undefined
}

interface Fake {
  nodes: number
  /** reportDate → number of records in that report. */
  reports: Record<string, number>
  /**
   * Per access token, reportDate → records; overrides `reports`, and each
   * record id is prefixed with the token, so rows show whose they are.
   */
  byToken?: Record<string, Record<string, number>>
  /**
   * What happens at end of file, which the docs leave undocumented:
   * - 'advance' (default): a page ending at EOF sends nextOffset = EOF, and a
   *   request AT EOF returns no records;
   * - 'stay': a full page ending at EOF sends back its own offset;
   * - 'reset': a full page ending at EOF sends nextOffset 0;
   * - 'throw': a request at EOF is rejected (as a 4xx would be).
   */
  eof?: 'advance' | 'stay' | 'reset' | 'throw'
}

function txId(date: string, i: number, token = ''): string {
  return `${token ? `${token}:` : ''}${date}-tx-${i}`
}

function fakeWalmart(fake: Fake): Call[] {
  const calls: Call[] = []
  const respond = (
    path: string,
    params: Record<string, unknown> | undefined,
    headers: Record<string, string> | undefined,
  ) => {
    calls.push({ path, params })
    const token = fake.byToken ? (headers?.['WM_SEC.ACCESS_TOKEN'] ?? '') : ''
    const reports = fake.byToken ? (fake.byToken[token] ?? {}) : fake.reports
    if (path === SHIPNODES) {
      // Documented param: includeCalendarDayConfiguration only. Bare array.
      return {
        data: Array.from({ length: fake.nodes }, (_, i) => ({
          shipNode: `node-${i}`,
          shipNodeName: `Node ${i}`,
          status: 'ACTIVE',
        })),
      }
    }
    if (path === DATES) {
      if (params?.['reportVersion'] !== 'v1') throw new Error(`${DATES}: reportVersion=v1 required`)
      return { data: { availableApReportDates: Object.keys(reports) } }
    }
    if (path === RECON) {
      const reportDate = params?.['reportDate']
      const offset = params?.['offset']
      const noOfRecords = params?.['noOfRecords']
      if (typeof reportDate !== 'string' || !(reportDate in reports))
        throw new Error(`${RECON}: reportDate required (got ${String(reportDate)})`)
      if (typeof offset !== 'number' || !Number.isInteger(offset) || offset < 0)
        throw new Error(`${RECON}: offset required (got ${String(offset)})`)
      if (
        typeof noOfRecords !== 'number' ||
        !Number.isInteger(noOfRecords) ||
        noOfRecords < 1 ||
        noOfRecords > RECON_MAX
      )
        throw new Error(
          `${RECON}: noOfRecords outside 1..${RECON_MAX} (got ${String(noOfRecords)})`,
        )
      const n = reports[reportDate]!
      // Byte layout: a header line, then one LINE-byte line per record.
      const eof = LINE * (n + 1)
      if (offset !== 0 && (offset < LINE || (offset - LINE) % LINE !== 0) && offset !== eof)
        throw new Error(`${RECON}: offset ${offset} is not a line boundary`)
      if (fake.eof === 'throw' && offset === eof && n > 0)
        throw new Error(`${RECON}: 400 offset ${offset} is at end of file`)
      const first = offset === 0 ? 0 : (offset - LINE) / LINE
      const rows = Array.from(
        { length: Math.max(0, Math.min(noOfRecords, n - first)) },
        (_, k) => ({
          'Transaction Key': txId(reportDate, first + k, token),
          'Transaction Type': 'ItemPrice',
          Amount: 1,
          Currency: 'USD',
        }),
      )
      const nextByte = LINE * (first + rows.length + 1)
      const endsFull = rows.length > 0 && rows.length === noOfRecords && first + rows.length === n
      // What nextOffset holds at end of file is undocumented: by default the
      // fake keeps sending it (pointing at EOF), the least helpful reading.
      const nextOffset =
        endsFull && fake.eof === 'stay' ? offset : endsFull && fake.eof === 'reset' ? 0 : nextByte
      return {
        data: {
          reportData: rows,
          nextOffset,
          totalRecords: rows.length,
          description: `Number of Lines in file ${n + 1}`,
        },
      }
    }
    throw new Error(`unexpected path ${path}`)
  }
  vi.spyOn(axios, 'create').mockImplementation((() => ({
    get: vi.fn(
      async (
        path: string,
        c?: { params?: Record<string, unknown>; headers?: Record<string, string> },
      ) => respond(path, c?.params, c?.headers),
    ),
  })) as never)
  return calls
}

type ListMethod = 'listLocations' | 'listTransactions'

async function call(
  method: ListMethod,
  params: QueryParams,
  creds: Credentials = CREDS,
): Promise<Array<{ id: string }>> {
  return new WalmartAdapter()[method](creds, params) as Promise<Array<{ id: string }>>
}

async function drive(method: ListMethod, limit: number, pages: number, extra: QueryParams = {}) {
  const seen: string[] = []
  const hasMore: Array<boolean | undefined> = []
  for (let page = 1; page <= pages; page++) {
    const params = withPageSink({ ...extra, page, limit })
    const rows = await call(method, params)
    seen.push(...rows.map((r) => r.id))
    hasMore.push(readUpstreamPage(params)?.hasMore)
  }
  return { seen, hasMore }
}

beforeEach(() => _resetCursorPager())
afterEach(() => vi.restoreAllMocks())

describe('walmart listLocations pages the whole ship-node list locally', () => {
  const L = 2
  const ids = (n: number) => Array.from({ length: n }, (_, i) => `node-${i}`)

  it('serves 2L+1 nodes once each across pages 1..3 with exact hasMore', async () => {
    fakeWalmart({ nodes: 2 * L + 1, reports: {} })
    const { seen, hasMore } = await drive('listLocations', L, 3)
    expect(seen).toEqual(ids(2 * L + 1))
    expect(hasMore).toEqual([true, true, false])
  })

  it('reads the documented bare-array response (not a shipNodes envelope)', async () => {
    fakeWalmart({ nodes: 3, reports: {} })
    const rows = await call('listLocations', withPageSink({ page: 1, limit: 10 }))
    expect(rows.map((r) => r.id)).toEqual(ids(3))
    const loc = await new WalmartAdapter().getLocation(CREDS, 'node-1')
    expect(loc.id).toBe('node-1')
  })

  it('sends no paging params upstream, since the endpoint documents none', async () => {
    const calls = fakeWalmart({ nodes: 5, reports: {} })
    await call('listLocations', withPageSink({ page: 2, limit: 2 }))
    expect(calls).toHaveLength(1)
    expect(calls[0]!.params ?? {}).toEqual({})
  })

  it('serves every row when the limit exceeds the collection', async () => {
    fakeWalmart({ nodes: 7, reports: {} })
    const params = withPageSink({ page: 1, limit: 5000 })
    const rows = await call('listLocations', params)
    expect(rows.map((r) => r.id)).toEqual(ids(7))
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('gives the right meta.hasMore through parseListQuery + listPage', async () => {
    fakeWalmart({ nodes: 5, reports: {} })
    const adapter = new WalmartAdapter()
    const metas: Array<{ ids: string[]; hasMore: boolean | null }> = []
    for (const page of ['1', '2', '3']) {
      const params = parseListQuery({ page, limit: '2' })
      const env = listPage(await adapter.listLocations(CREDS, params), params, 'walmart')
      metas.push({ ids: env.data.map((r) => r.id), hasMore: env.meta.hasMore })
    }
    expect(metas).toEqual([
      { ids: ids(5).slice(0, 2), hasMore: true },
      { ids: ids(5).slice(2, 4), hasMore: true },
      { ids: ids(5).slice(4), hasMore: false },
    ])
  })
})

describe('walmart listTransactions walks the recon report by nextOffset', () => {
  const L = 2
  const D = '09102026'
  const ids = (date: string, n: number) => Array.from({ length: n }, (_, i) => txId(date, i))

  it('serves 2L+1 records once each across pages 1..3 with exact hasMore', async () => {
    fakeWalmart({ nodes: 0, reports: { [D]: 2 * L + 1 } })
    const { seen, hasMore } = await drive('listTransactions', L, 3, { reportDate: D })
    expect(seen).toEqual(ids(D, 2 * L + 1))
    expect(hasMore).toEqual([true, true, false])
  })

  it('sends offset 0 and noOfRecords on page 1, and page 1 nextOffset on page 2', async () => {
    const calls = fakeWalmart({ nodes: 0, reports: { [D]: 2 * L + 1 } })
    await call('listTransactions', withPageSink({ page: 1, limit: L, reportDate: D }))
    await call('listTransactions', withPageSink({ page: 2, limit: L, reportDate: D }))
    const recon = calls.filter((c) => c.path === RECON)
    expect(recon[0]!.params).toEqual({ reportDate: D, offset: 0, noOfRecords: L })
    // Page 1 ended after the header and L lines: that byte is page 2's offset.
    expect(recon[1]!.params).toEqual({ reportDate: D, offset: LINE * (L + 1), noOfRecords: L })
  })

  it('reaches page 2 with no prior walk by following nextOffset from 0', async () => {
    const calls = fakeWalmart({ nodes: 0, reports: { [D]: 2 * L + 1 } })
    const rows = await call('listTransactions', withPageSink({ page: 2, limit: L, reportDate: D }))
    expect(rows.map((r) => r.id)).toEqual(ids(D, 2 * L + 1).slice(L, 2 * L))
    const offsets = calls.filter((c) => c.path === RECON).map((c) => c.params?.['offset'])
    expect(offsets[0]).toBe(0)
    expect(offsets).toContain(LINE * (L + 1))
  })

  it('clamps noOfRecords to the documented 1000 and still serves every record', async () => {
    const n = 2 * RECON_MAX + 1
    const calls = fakeWalmart({ nodes: 0, reports: { [D]: n } })
    const params = withPageSink({ page: 1, limit: 5000, reportDate: D })
    const rows = await call('listTransactions', params)
    expect(rows.map((r) => r.id)).toEqual(ids(D, n))
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
    for (const c of calls.filter((c) => c.path === RECON))
      expect(c.params?.['noOfRecords']).toBeLessThanOrEqual(RECON_MAX)
  })

  it('with no reportDate, walks every available report, empty ones included', async () => {
    const A = '08272026'
    const B = '09032026'
    fakeWalmart({ nodes: 0, reports: { [A]: 3, [B]: 0, [D]: 4 } })
    const { seen, hasMore } = await drive('listTransactions', L, 4)
    expect(seen).toEqual([...ids(A, 3), ...ids(D, 4)])
    expect(hasMore).toEqual([true, true, true, false])
  })

  it('gives the right meta.hasMore through parseListQuery + listPage', async () => {
    fakeWalmart({ nodes: 0, reports: { [D]: 5 } })
    const adapter = new WalmartAdapter()
    const metas: Array<{ ids: string[]; hasMore: boolean | null }> = []
    for (const page of ['1', '2', '3']) {
      const params = parseListQuery({ page, limit: '2' })
      const env = listPage(await adapter.listTransactions(CREDS, params), params, 'walmart')
      metas.push({ ids: env.data.map((r) => r.id), hasMore: env.meta.hasMore })
    }
    const all = ids(D, 5)
    expect(metas).toEqual([
      { ids: all.slice(0, 2), hasMore: true },
      { ids: all.slice(2, 4), hasMore: true },
      { ids: all.slice(4), hasMore: false },
    ])
  })

  it('sizes noOfRecords from a numeric-string limit, and from the default without one', async () => {
    const calls = fakeWalmart({ nodes: 0, reports: { [D]: 7 } })
    const params = withPageSink({ page: 1, limit: '3' as unknown as number, reportDate: D })
    const rows = await call('listTransactions', params)
    expect(rows.map((r) => r.id)).toEqual(ids(D, 3))
    expect(calls.find((c) => c.path === RECON)!.params?.['noOfRecords']).toBe(3)

    _resetCursorPager()
    calls.length = 0
    await call('listTransactions', withPageSink({ page: 1, reportDate: D }))
    expect(calls.find((c) => c.path === RECON)!.params?.['noOfRecords']).toBe(100)
  })
})

describe('walmart listTransactions keeps walks apart', () => {
  const L = 2
  const A = '08272026'
  const B = '09032026'
  const ids = (date: string, n: number, token = '') =>
    Array.from({ length: n }, (_, i) => txId(date, i, token))

  it('page 2 of report B after page 1 of report A serves B, not A', async () => {
    fakeWalmart({ nodes: 0, reports: { [A]: 2 * L + 1, [B]: 2 * L + 1 } })
    await call('listTransactions', withPageSink({ page: 1, limit: L, reportDate: A }))
    const rows = await call('listTransactions', withPageSink({ page: 2, limit: L, reportDate: B }))
    expect(rows.map((r) => r.id)).toEqual(ids(B, 2 * L + 1).slice(L, 2 * L))
  })

  it("one connection's page 2 never comes from another connection's walk", async () => {
    const other: Credentials = {
      accessToken: 'tok2',
      extra: { clientId: 'cid', clientSecret: 's' },
    }
    fakeWalmart({
      nodes: 0,
      reports: {},
      byToken: { tok: { [A]: 2 * L + 1 }, tok2: { [A]: 2 * L + 1 } },
    })
    await call('listTransactions', withPageSink({ page: 1, limit: L, reportDate: A }), CREDS)
    const rows = await call(
      'listTransactions',
      withPageSink({ page: 2, limit: L, reportDate: A }),
      other,
    )
    expect(rows.map((r) => r.id)).toEqual(ids(A, 2 * L + 1, 'tok2').slice(L, 2 * L))
  })

  it('page 2 at another limit serves the rows of that limit', async () => {
    fakeWalmart({ nodes: 0, reports: { [A]: 10 } })
    await call('listTransactions', withPageSink({ page: 1, limit: 2, reportDate: A }))
    const params = withPageSink({ page: 2, limit: 3, reportDate: A })
    const rows = await call('listTransactions', params)
    expect(rows.map((r) => r.id)).toEqual(ids(A, 10).slice(3, 6))
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
  })
})

describe('walmart listTransactions ends a report whatever EOF looks like', () => {
  const L = 2
  const D = '09102026'
  const E = '09172026'
  const ids = (date: string, n: number) => Array.from({ length: n }, (_, i) => txId(date, i))

  for (const eof of ['stay', 'reset'] as const) {
    it(`a full last page whose nextOffset does not move forward (${eof}) ends the report`, async () => {
      fakeWalmart({ nodes: 0, reports: { [D]: 2 * L, [E]: 1 }, eof })
      const { seen, hasMore } = await drive('listTransactions', L, 3)
      expect(seen).toEqual([...ids(D, 2 * L), ...ids(E, 1)])
      expect(hasMore).toEqual([true, true, false])
    })
  }

  it('a short page ends the report with no request at end of file', async () => {
    const calls = fakeWalmart({ nodes: 0, reports: { [D]: 2 * L + 1 }, eof: 'throw' })
    const { seen, hasMore } = await drive('listTransactions', L, 3, { reportDate: D })
    expect(seen).toEqual(ids(D, 2 * L + 1))
    expect(hasMore).toEqual([true, true, false])
    const eofByte = LINE * (2 * L + 2)
    expect(calls.filter((c) => c.path === RECON).map((c) => c.params?.['offset'])).not.toContain(
      eofByte,
    )
  })
})
