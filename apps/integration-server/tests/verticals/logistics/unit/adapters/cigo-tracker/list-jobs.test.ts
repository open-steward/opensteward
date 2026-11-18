/**
 * CIGO Tracker listShipments / listOrders over the documented job endpoints
 * (https://app.cigotracker.com/reference/cigo-swagger.json):
 *
 * - `/jobs` has only `post` ("Create a new Job"); there is no GET list.
 * - POST /jobs/search: "Search for Job API IDs where the date is within a
 *   certain start and end range (within 30 days)"; `start_date` is required;
 *   the response holds `in_staging.ids` and `post_staging.ids`, and there is
 *   no paging parameter.
 * - GET /jobs/id/{jobID}: "Retrieve a Job".
 * - Auth: BasicAuth, "The **Account ID** serves as the `username` and the
 *   **Auth Key** serves as the `password`".
 *
 * No lookback limit is documented, so an unfiltered list is refused (501) and
 * a list with updatedAfter walks 30-day job-date windows newest first.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import axios from 'axios'
import { listPage, readUpstreamPage, withPageSink } from '@opensteward/shared'
import { ShipmentSchema } from '../../../../../../src/verticals/logistics/schema/shipment'
import { OrderSchema } from '../../../../../../src/verticals/logistics/schema/order'
import { CigoTrackerAdapter } from '../../../../../../src/verticals/logistics/adapters/cigo-tracker/index'
import { RETRIEVE_JOB_EXAMPLE, SEARCH_JOBS_EXAMPLE } from './fixtures/job'

const NOW = new Date('2026-09-24T12:00:00.000Z')
const DAY_MS = 86_400_000
const CALL_BUDGET = 60
/** The request-body properties of "Search Jobs request". */
const DOCUMENTED_SEARCH_KEYS = new Set([
  'start_date',
  'end_date',
  'status',
  'first_name',
  'last_name',
  'phone_number',
  'quick_desc',
  'invoice_number',
  'shipping_barcode',
  'reference_id',
  'confirmation_status',
  'branch_id',
  'distribution_center_id',
  'job_type',
  'creation_source',
  'on_itinerary',
])

let seq = 0
/** A fresh connection per test, so the row pager's memo never carries over. */
function creds(accountId = `acct_${++seq}`) {
  return { accessToken: `key_${seq}_${Math.random()}`, extra: { accountId } }
}

function basic(c: { accessToken: string; extra: { accountId: string } }): string {
  return `Basic ${Buffer.from(`${c.extra.accountId}:${c.accessToken}`).toString('base64')}`
}

interface FakeJob {
  id: string
  date: string
  staging?: boolean
  /** Found by the search, then gone: GET /jobs/id/{jobID} answers the documented 404. */
  deleted?: boolean
  /** Found by the search, but the read answers the documented 403. */
  forbidden?: boolean
}

interface SearchBody {
  start_date?: string
  end_date?: string
  [k: string]: unknown
}

/**
 * A fake CIGO honouring only the documented contract. Jobs are per
 * Authorization header, so one connection never sees another's.
 */
function fakeCigo(jobsFor: (auth: string) => FakeJob[], callBudget = CALL_BUDGET) {
  const searches: SearchBody[] = []
  const gets: string[] = []
  let calls = 0
  const create = vi.spyOn(axios, 'create').mockImplementation(((cfg: {
    baseURL: string
    headers: Record<string, string>
  }) => {
    expect(cfg.baseURL).toBe('https://app.cigotracker.com/api/v1')
    const auth = cfg.headers.Authorization!
    const jobs = jobsFor(auth)
    return {
      post: vi.fn(async (path: string, body: SearchBody) => {
        if (++calls > callBudget) throw new Error('call budget exceeded')
        if (path !== '/jobs/search') throw new Error(`unexpected POST ${path}`)
        searches.push(body)
        for (const k of Object.keys(body)) {
          if (!DOCUMENTED_SEARCH_KEYS.has(k)) throw new Error(`undocumented property ${k}`)
        }
        if (!body.start_date) {
          return { data: { statusCode: 400, error: "Required: 'start_date' is not set." } }
        }
        const end = body.end_date ?? body.start_date
        const span = (Date.parse(end) - Date.parse(body.start_date)) / DAY_MS + 1
        if (!(span >= 1 && span <= 30)) throw new Error(`search spans ${span} days`)
        const hits = jobs.filter((j) => j.date >= body.start_date! && j.date <= end)
        const staging = hits.filter((j) => j.staging).map((j) => j.id)
        const post = hits.filter((j) => !j.staging).map((j) => j.id)
        return {
          data: {
            statusCode: 200,
            status: 'OK',
            in_staging: { count: staging.length, ids: staging },
            post_staging: { count: post.length, ids: post },
          },
        }
      }),
      get: vi.fn(async (path: string, cfg2?: { params?: unknown }) => {
        if (++calls > callBudget) throw new Error('call budget exceeded')
        expect(cfg2?.params).toBeUndefined()
        const m = /^\/jobs\/id\/([^/]+)$/.exec(path)
        if (!m) throw new Error(`unexpected GET ${path}`)
        const id = decodeURIComponent(m[1]!)
        gets.push(id)
        const job = jobs.find((j) => j.id === id)
        if (job?.forbidden) {
          throw Object.assign(new Error('403'), { response: { status: 403 } })
        }
        if (!job || job.deleted) {
          throw Object.assign(new Error('404'), {
            response: { status: 404, data: { error: 'No Job found for given jobID.' } },
          })
        }
        return {
          data: {
            ...RETRIEVE_JOB_EXAMPLE,
            job: {
              ...RETRIEVE_JOB_EXAMPLE.job,
              job_id: id,
              date: job.date,
              status: job.staging ? 'staging' : 'completed',
            },
          },
        }
      }),
      defaults: { headers: { common: {} } },
    } as never
  }) as never)
  return { create, searches, gets }
}

const adapter = new CigoTrackerAdapter()
const UPDATED_AFTER = new Date('2026-07-01T15:30:00.000Z')

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('cigo-tracker auth', () => {
  it('sends HTTP Basic with the Account ID as username and the Auth Key as password', async () => {
    const c = creds()
    const { create } = fakeCigo(() => [{ id: 'j1', date: '2026-09-01' }])
    await adapter.getShipment(c, 'j1')
    const cfg = create.mock.calls[0]![0] as { headers: Record<string, string> }
    expect(cfg.headers.Authorization).toBe(basic(c))
    expect(cfg.headers).not.toHaveProperty('X-Account-Id')
    expect(cfg.headers).not.toHaveProperty('X-Auth-Key')
  })

  it('refuses a connection without an Account ID', async () => {
    fakeCigo(() => [])
    await expect(adapter.getShipment({ accessToken: 'k' }, 'j1')).rejects.toThrow(/Account ID/)
  })
})

describe('cigo-tracker lists without updatedAfter', () => {
  for (const method of ['listShipments', 'listOrders'] as const) {
    it(`${method} refuses with 501 NOT_SUPPORTED naming the 30-day window, and sends nothing`, async () => {
      const { create, searches, gets } = fakeCigo(() => [{ id: 'j1', date: '2026-09-01' }])
      const err = await adapter[method](creds(), { page: 1, limit: 10 }).catch((e: unknown) => e)
      expect(err).toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
      expect((err as Error).message).toMatch(/within 30 days/)
      expect((err as Error).message).toMatch(/updated_after/)
      expect(searches).toEqual([])
      expect(gets).toEqual([])
      // Not even a client with the credentials is used.
      for (const r of create.mock.results) {
        const inst = r.value as { post: ReturnType<typeof vi.fn>; get: ReturnType<typeof vi.fn> }
        expect(inst.post).not.toHaveBeenCalled()
        expect(inst.get).not.toHaveBeenCalled()
      }
    })
  }
})

describe('cigo-tracker lists with updatedAfter (30-day job-date windows, newest first)', () => {
  // 2026-07-01..2026-09-24 is 86 days: 08-26..09-24, 07-27..08-25, 07-01..07-26.
  it('searches each ≤30-day window from the UTC day of updatedAfter with only documented fields', async () => {
    const { searches, gets } = fakeCigo(() => [])
    const params = withPageSink({ page: 1, limit: 10, updatedAfter: UPDATED_AFTER })
    expect(await adapter.listShipments(creds(), params)).toEqual([])
    expect(searches).toEqual([
      { start_date: '2026-08-26', end_date: '2026-09-24' },
      { start_date: '2026-07-27', end_date: '2026-08-25' },
      { start_date: '2026-07-01', end_date: '2026-07-26' },
    ])
    expect(gets).toEqual([])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('reads the documented search response: in_staging ids, then post_staging ids', async () => {
    const [staged] = SEARCH_JOBS_EXAMPLE.in_staging.ids
    const [posted] = SEARCH_JOBS_EXAMPLE.post_staging.ids
    const { gets } = fakeCigo(() => [
      { id: posted!, date: '2026-09-10' },
      { id: staged!, date: '2026-09-11', staging: true },
    ])
    const rows = await adapter.listShipments(creds(), {
      page: 1,
      limit: 10,
      updatedAfter: UPDATED_AFTER,
    })
    expect(rows.map((s) => s.id)).toEqual([staged, posted])
    expect(rows.map((s) => s.status)).toEqual(['PENDING', 'DELIVERED'])
    expect(gets).toEqual([staged, posted])
  })

  const L = 4
  // Uneven windows: 5 jobs, 0 jobs, 4 jobs.
  const JOBS: FakeJob[] = [
    { id: 'a1', date: '2026-09-20', staging: true },
    { id: 'a2', date: '2026-09-20' },
    { id: 'a3', date: '2026-09-01' },
    { id: 'a4', date: '2026-08-30' },
    { id: 'a5', date: '2026-08-26' },
    { id: 'c1', date: '2026-07-26', staging: true },
    { id: 'c2', date: '2026-07-20' },
    { id: 'c3', date: '2026-07-05' },
    { id: 'c4', date: '2026-07-01' },
  ]
  const ORDER = ['a1', 'a2', 'a3', 'a4', 'a5', 'c1', 'c2', 'c3', 'c4']

  for (const [method, schema] of [
    ['listShipments', ShipmentSchema],
    ['listOrders', OrderSchema],
  ] as const) {
    it(`${method} walks N = 2L+1 jobs across uneven windows: every id once, hasMore exact`, async () => {
      expect(JOBS).toHaveLength(2 * L + 1)
      const { gets, searches } = fakeCigo(() => JOBS)
      const c = creds()
      const seen: string[] = []
      const hasMore: boolean[] = []
      for (let page = 1; page <= 3; page++) {
        const params = withPageSink({ page, limit: L, updatedAfter: UPDATED_AFTER })
        const rows: Array<{ id?: string }> = await adapter[method](c, params)
        for (const r of rows) schema.parse(r)
        const env = listPage(rows, params, 'cigo-tracker')
        seen.push(...env.data.map((r) => r.id!))
        hasMore.push(env.meta.hasMore as boolean)
      }
      expect(seen).toEqual(ORDER)
      expect(hasMore).toEqual([true, true, false])
      // Each job is read once, only when its page is served.
      expect(gets).toEqual(ORDER)
      // Each window is searched once across the walk.
      expect(searches).toHaveLength(3)
    })
  }

  it('reports hasMore true when rows remain in an older window only', async () => {
    fakeCigo(() => [
      { id: 'a1', date: '2026-09-20' },
      { id: 'c1', date: '2026-07-02' },
    ])
    const params = withPageSink({ page: 1, limit: 1, updatedAfter: UPDATED_AFTER })
    const rows = await adapter.listOrders(creds(), params)
    expect(rows.map((o) => o.id)).toEqual(['a1'])
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
  })

  it('an updatedAfter later than today sends nothing and reports the end', async () => {
    const { searches } = fakeCigo(() => [])
    const params = withPageSink({
      page: 1,
      limit: 10,
      updatedAfter: new Date('2026-09-25T00:00:00.000Z'),
    })
    expect(await adapter.listShipments(creds(), params)).toEqual([])
    expect(searches).toEqual([])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('skips a job deleted between the search and its read (documented 404), keeping the rest', async () => {
    const { gets } = fakeCigo(() => [
      { id: 'a1', date: '2026-09-20' },
      { id: 'gone', date: '2026-09-15', deleted: true },
      { id: 'a3', date: '2026-09-10' },
    ])
    const params = withPageSink({ page: 1, limit: 3, updatedAfter: UPDATED_AFTER })
    const rows = await adapter.listShipments(creds(), params)
    expect(rows.map((r) => r.id)).toEqual(['a1', 'a3'])
    expect(gets).toEqual(['a1', 'gone', 'a3'])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('still fails the page on a job read error other than 404', async () => {
    fakeCigo(() => [
      { id: 'a1', date: '2026-09-20' },
      { id: 'a2', date: '2026-09-15', forbidden: true },
    ])
    const params = { page: 1, limit: 3, updatedAfter: UPDATED_AFTER }
    await expect(adapter.listShipments(creds(), params)).rejects.toThrow('403')
  })

  it('walks every window of a long updatedAfter on one page, past the default 1,000-request budget', async () => {
    // 1900-01-01..2026-09-24 is 46,288 days: 1,543 windows, the oldest 28 days; all empty.
    const { searches } = fakeCigo(() => [], 2_000)
    const params = withPageSink({
      page: 1,
      limit: 10,
      updatedAfter: new Date('1900-01-01T00:00:00.000Z'),
    })
    expect(await adapter.listOrders(creds(), params)).toEqual([])
    expect(searches).toHaveLength(1_543)
    expect(searches.at(-1)).toEqual({ start_date: '1900-01-01', end_date: '1900-01-28' })
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('never serves one connection the ids another connection fetched', async () => {
    const a = creds()
    const b = creds()
    fakeCigo((auth) =>
      auth === basic(a)
        ? [
            { id: 'a1', date: '2026-09-20' },
            { id: 'a2', date: '2026-09-10' },
          ]
        : [
            { id: 'b1', date: '2026-09-21' },
            { id: 'b2', date: '2026-09-11' },
          ],
    )
    const pageOf = async (c: ReturnType<typeof creds>, page: number) =>
      (await adapter.listShipments(c, { page, limit: 1, updatedAfter: UPDATED_AFTER })).map(
        (s) => s.id,
      )
    // a's page 1 leaves its window in the pager's slot; b's page 2 continues
    // from exactly there, so a shared key would serve b the row a2.
    expect(await pageOf(a, 1)).toEqual(['a1'])
    expect(await pageOf(b, 2)).toEqual(['b2'])
    expect(await pageOf(b, 1)).toEqual(['b1'])
    expect(await pageOf(a, 2)).toEqual(['a2'])
  })
})

describe('cigo-tracker get by id', () => {
  it('getShipment and getOrder read GET /jobs/id/{jobID}', async () => {
    const { gets } = fakeCigo(() => [{ id: 'job 1', date: '2026-09-01' }])
    const c = creds()
    expect(ShipmentSchema.parse(await adapter.getShipment(c, 'job 1')).id).toBe('job 1')
    expect(OrderSchema.parse(await adapter.getOrder(c, 'job 1')).id).toBe('job 1')
    expect(gets).toEqual(['job 1', 'job 1'])
  })
})

describe('cigo-tracker getTrackingEvents', () => {
  it('refuses with 501 NOT_SUPPORTED and sends nothing', async () => {
    const { create } = fakeCigo(() => [])
    const err = await adapter.getTrackingEvents(creds(), 'P35UWX-GPIP6C-7ZZSJ2').catch((e) => e)
    expect(err).toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
    expect(create).not.toHaveBeenCalled()
  })
})
