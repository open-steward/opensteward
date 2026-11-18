/**
 * Tookan order reads, against a fake that honours only documented parameters
 * (https://jsapi.apiary.io/apis/tookanapi.apib). Every call is a POST to
 * https://api.tookanapp.com/v2/<endpoint> with `api_key` in the JSON body.
 *
 * - listOrders: "View All Tasks" [/get_all_tasks]: job_type* (0..3),
 *   start_date* / end_date* (YYYY-MM-DD, "inside the 31 days span"),
 *   is_pagination, requested_page. No page size and no end marker are
 *   documented; the fake pages by a hidden size and answers past the end with
 *   an empty array.
 * - getOrder: "Get Task Details" [/get_job_details]: job_ids* array.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import axios from 'axios'
import { withPageSink, readUpstreamPage } from '@opensteward/shared'
import { TookanAdapter } from '../../../../../../src/verticals/logistics/adapters/tookan/index'
import { OrderSchema } from '../../../../../../src/verticals/logistics/schema/order'
import type { TookanTaskOrder } from '../../../../../../src/verticals/logistics/adapters/tookan/transform/order'
import { docJobDetails, docRelatedTask } from './fixtures'

// 2026-09-24T10:00:00Z: the newest window ends on 2026-09-24.
const NOW = Date.UTC(2026, 8, 24, 10, 0, 0)
const DAY_MS = 86_400_000

type Body = Record<string, unknown>
type Handler = (path: string, body: Body) => unknown
type Call = { path: string; body: Body }

let handler: Handler
let calls: Call[]
let baseURLs: unknown[]
let credSeq = 0

function freshCreds() {
  // A fresh key per test: pager keys are per connection.
  credSeq += 1
  return { accessToken: `key-${credSeq}-${Math.random()}` }
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
        throw new Error('Tookan documents only POST')
      }),
    } as unknown as ReturnType<typeof axios.create>
  })
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

function documented(body: Body, allowed: string[]): void {
  for (const k of Object.keys(body)) {
    if (![...allowed, 'api_key'].includes(k)) throw new Error(`undocumented ${k}`)
  }
  if (!body['api_key']) throw new Error('"API key is mandatory in all the API\'s request."')
}

const ALL_TASKS_FIELDS = [
  'job_status',
  'job_type',
  'start_date',
  'end_date',
  'custom_fields',
  'is_pagination',
  'requested_page',
  'customer_id',
  'fleet_id',
  'job_id',
  'order_id',
  'team_id',
]

type Row = TookanTaskOrder & { job_date: string }

/** A task on `date` (the documented "job_date" shape) of `jobType`. */
function task(id: number, date: string, jobType: number): Row {
  return docRelatedTask({ job_id: id, job_type: jobType, job_date: `${date}T00:00:00.000Z` }) as Row
}

const YMD = /^\d{4}-\d{2}-\d{2}$/

/** get_all_tasks over `rows`, paging by a hidden `pageSize`, empty past the end. */
function allTasksFake(rows: Row[], pageSize: number): Handler {
  return (path, body) => {
    if (path !== 'get_all_tasks') throw new Error(`unexpected path ${path}`)
    documented(body, ALL_TASKS_FIELDS)
    const jobType = body['job_type']
    if (![0, 1, 2, 3].includes(jobType as number)) throw new Error('job_type* is mandatory')
    const start = String(body['start_date'] ?? '')
    const end = String(body['end_date'] ?? '')
    if (!YMD.test(start) || !YMD.test(end)) throw new Error('start_date*/end_date* are YYYY-MM-DD')
    const span = (Date.parse(end) - Date.parse(start)) / DAY_MS + 1
    if (span < 1 || span > 31) throw new Error('"inside the 31 days span"')
    const hit = rows.filter(
      (r) =>
        r.job_type === jobType &&
        r.job_date.slice(0, 10) >= start &&
        r.job_date.slice(0, 10) <= end,
    )
    if (body['is_pagination'] !== 1) return { message: 'Successful', status: 200, data: hit }
    const p = Number(body['requested_page'])
    return {
      message: 'Successful',
      status: 200,
      data: hit.slice((p - 1) * pageSize, p * pageSize),
    }
  }
}

describe('tookan listOrders', () => {
  it('refuses a call with no updated_after with 501 NOT_SUPPORTED, sending nothing', async () => {
    handler = allTasksFake([], 3)
    await expect(
      new TookanAdapter().listOrders(freshCreds(), withPageSink({ page: 1, limit: 10 })),
    ).rejects.toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
    expect(calls).toEqual([])
  })

  it('asks for the newest 31-day UTC window, each documented job_type, page by page', async () => {
    handler = allTasksFake([task(1, '2026-09-24', 1)], 3)
    const creds = freshCreds()
    await new TookanAdapter().listOrders(
      creds,
      withPageSink({ page: 1, limit: 10, updatedAfter: new Date('2026-08-01T15:00:00Z') }),
    )
    expect(baseURLs).toEqual(['https://api.tookanapp.com/v2/'])
    const req = (
      job_type: number,
      requested_page: number,
      start_date: string,
      end_date: string,
    ) => ({
      path: 'get_all_tasks',
      body: {
        job_type,
        start_date,
        end_date,
        is_pagination: 1,
        requested_page,
        api_key: creds.accessToken,
      },
    })
    expect(calls).toEqual([
      req(0, 1, '2026-08-25', '2026-09-24'),
      req(1, 1, '2026-08-25', '2026-09-24'),
      req(1, 2, '2026-08-25', '2026-09-24'),
      req(2, 1, '2026-08-25', '2026-09-24'),
      req(3, 1, '2026-08-25', '2026-09-24'),
      // The last window stops at the day of updatedAfter.
      req(0, 1, '2026-08-01', '2026-08-24'),
      req(1, 1, '2026-08-01', '2026-08-24'),
      req(2, 1, '2026-08-01', '2026-08-24'),
      req(3, 1, '2026-08-01', '2026-08-24'),
    ])
  })

  it('walks N = 2L+1 tasks over uneven pages and windows: every id once, hasMore exact', async () => {
    const L = 4
    const rows = [
      // Window 0 (2026-08-25..09-24): 5 delivery tasks (pages of 3: 3 + 2), 1 pickup.
      task(10, '2026-09-24', 1),
      task(11, '2026-09-20', 1),
      task(12, '2026-09-01', 1),
      task(13, '2026-08-30', 1),
      task(14, '2026-08-25', 1),
      task(20, '2026-09-10', 0),
      // Window 1 (2026-07-25..08-24): one appointment, one FOS.
      task(30, '2026-08-24', 2),
      task(40, '2026-07-26', 3),
      // Window 2 (2026-07-20..07-24): one delivery.
      task(50, '2026-07-20', 1),
      // Before the day of updatedAfter: never asked for.
      task(99, '2026-07-19', 1),
    ]
    handler = allTasksFake(rows, 3)
    const creds = freshCreds()
    const adapter = new TookanAdapter()
    const seen: string[] = []
    const hasMore: boolean[] = []
    for (let page = 1; page <= 3; page++) {
      const params = withPageSink({
        page,
        limit: L,
        updatedAfter: new Date('2026-07-20T09:00:00Z'),
      })
      const got = await adapter.listOrders(creds, params)
      got.forEach((o) => OrderSchema.parse(o))
      seen.push(...got.map((o) => o.id!))
      hasMore.push(readUpstreamPage(params)!.hasMore!)
    }
    expect(seen).toEqual(['20', '10', '11', '12', '13', '14', '30', '40', '50'])
    expect(new Set(seen).size).toBe(2 * L + 1)
    expect(hasMore).toEqual([true, true, false])
    // Every window within the documented span, none before updatedAfter's day.
    for (const c of calls) {
      expect(String(c.body['start_date']) >= '2026-07-20').toBe(true)
    }
    // Each upstream page fetched once across the walk.
    const asked = calls.map(
      (c) => `${c.body['start_date']}|${c.body['job_type']}|${c.body['requested_page']}`,
    )
    expect(new Set(asked).size).toBe(asked.length)
  })

  it('sends no empty window when the day count is an exact multiple of 31', async () => {
    // 2026-07-25..2026-09-24 is 62 days: exactly two windows, while "now" is
    // 10:00 UTC, not midnight.
    handler = allTasksFake([], 3)
    const params = withPageSink({
      page: 1,
      limit: 10,
      updatedAfter: new Date('2026-07-25T12:00:00Z'),
    })
    expect(await new TookanAdapter().listOrders(freshCreds(), params)).toEqual([])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
    const windows = [...new Set(calls.map((c) => `${c.body['start_date']}..${c.body['end_date']}`))]
    expect(windows).toEqual(['2026-08-25..2026-09-24', '2026-07-25..2026-08-24'])
    expect(calls).toHaveLength(8)
  })

  it('keeps one connection walk apart from another', async () => {
    const byKey = new Map<string, Row[]>()
    const a = freshCreds()
    const b = freshCreds()
    byKey.set(
      a.accessToken,
      [1, 2, 3, 4, 5].map((id) => task(id, '2026-09-24', 1)),
    )
    byKey.set(
      b.accessToken,
      [101, 102, 103, 104, 105].map((id) => task(id, '2026-09-24', 1)),
    )
    handler = (path, body) => allTasksFake(byKey.get(String(body['api_key']))!, 3)(path, body)
    const adapter = new TookanAdapter()
    const since = new Date('2026-09-24T00:00:00Z')
    const a1 = await adapter.listOrders(a, withPageSink({ page: 1, limit: 2, updatedAfter: since }))
    const b2 = await adapter.listOrders(b, withPageSink({ page: 2, limit: 2, updatedAfter: since }))
    expect(a1.map((o) => o.id)).toEqual(['1', '2'])
    expect(b2.map((o) => o.id)).toEqual(['103', '104'])
  })

  it('answers an updated_after in the future with no rows and no request', async () => {
    handler = allTasksFake([], 3)
    const params = withPageSink({
      page: 1,
      limit: 10,
      updatedAfter: new Date('2026-09-25T00:00:00Z'),
    })
    expect(await new TookanAdapter().listOrders(freshCreds(), params)).toEqual([])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
    expect(calls).toEqual([])
  })

  it('throws on a documented error status instead of reading it as an empty page', async () => {
    handler = () => ({ message: 'Invalid API Key', status: 101, data: [] })
    await expect(
      new TookanAdapter().listOrders(
        freshCreds(),
        withPageSink({ page: 1, limit: 10, updatedAfter: new Date('2026-09-24T00:00:00Z') }),
      ),
    ).rejects.toMatchObject({ statusCode: 502, code: 'UPSTREAM_ERROR' })
  })
})

describe('tookan getOrder', () => {
  function jobDetailsFake(rows: TookanTaskOrder[]): Handler {
    return (path, body) => {
      if (path !== 'get_job_details') throw new Error(`unexpected path ${path}`)
      documented(body, [
        'job_ids',
        'include_task_history',
        'job_additional_info',
        'include_job_report',
      ])
      const ids = body['job_ids']
      if (!Array.isArray(ids) || ids.length === 0) throw new Error('job_ids* is an array')
      return {
        message: 'Successful',
        status: 200,
        data: rows.filter((r) => ids.includes(r.job_id)),
      }
    }
  }

  it('reads one task by job_ids and parses it as an Order', async () => {
    handler = jobDetailsFake([docJobDetails()])
    const creds = freshCreds()
    const o = OrderSchema.parse(await new TookanAdapter().getOrder(creds, '5145'))
    expect(o.id).toBe('5145')
    expect(calls).toEqual([
      { path: 'get_job_details', body: { job_ids: [5145], api_key: creds.accessToken } },
    ])
  })

  it('returns an id listOrders served', async () => {
    handler = allTasksFake([task(123456, '2026-09-24', 0)], 3)
    const creds = freshCreds()
    const adapter = new TookanAdapter()
    const [listed] = await adapter.listOrders(
      creds,
      withPageSink({ page: 1, limit: 10, updatedAfter: new Date('2026-09-24T00:00:00Z') }),
    )
    handler = jobDetailsFake([docRelatedTask()])
    expect((await adapter.getOrder(creds, listed!.id!)).id).toBe(listed!.id)
  })

  it('is 404 NOT_FOUND for an unknown id, never a synthetic order', async () => {
    handler = jobDetailsFake([])
    await expect(new TookanAdapter().getOrder(freshCreds(), '777')).rejects.toMatchObject({
      statusCode: 404,
      code: 'NOT_FOUND',
    })
  })

  it('is 404 NOT_FOUND when the task that comes back is not the one asked for', async () => {
    handler = () => ({ message: 'Successful', status: 200, data: [docJobDetails()] })
    await expect(new TookanAdapter().getOrder(freshCreds(), '777')).rejects.toMatchObject({
      statusCode: 404,
      code: 'NOT_FOUND',
    })
  })

  it('is 404 NOT_FOUND for a non-numeric id without a request', async () => {
    await expect(new TookanAdapter().getOrder(freshCreds(), 'abc')).rejects.toMatchObject({
      statusCode: 404,
    })
    expect(calls).toEqual([])
  })
})
