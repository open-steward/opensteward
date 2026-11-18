/**
 * Supportbench list paging.
 *
 * https://supportbench.readme.io/reference/return-activities documents
 * POST /activities: "The top 500 results are returned order by the case
 * creation date.", filtered by `cases`, `status_id` and others, with the
 * code sample `"page_number":2 // return results from page 2`. No size
 * parameter is documented. The fake below honours ONLY `page_number`
 * (1-based) and the `cases` filter, serves a fixed upstream page size, and
 * returns an empty `activities` array past the end.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import axios from 'axios'
import {
  _resetRowPager,
  listPage,
  parseListQuery,
  withPageSink,
  type Credentials,
  type QueryParams,
} from '@opensteward/shared'
import { SupportbenchAdapter } from '../../../../../../src/verticals/customer-support/adapters/supportbench/index'

const creds: Credentials = { accessToken: 'key' }

interface Call {
  path: string
  body: Record<string, unknown>
}

let calls: Call[] = []
let handler: (body: Record<string, unknown>) => unknown

beforeEach(() => {
  _resetRowPager()
  calls = []
  vi.spyOn(axios, 'create').mockImplementation(
    () =>
      ({
        post: async (path: string, body: Record<string, unknown>) => {
          calls.push({ path, body: { ...body } })
          return { data: handler(body) }
        },
      }) as unknown as ReturnType<typeof axios.create>,
  )
})

afterEach(() => {
  vi.restoreAllMocks()
})

interface Act {
  id: number
  case_id?: string
}

/** POST /activities honouring only `page_number` (default 1) and `cases`, `size` rows a page. */
function activities(rows: Act[], size = 500) {
  return (body: Record<string, unknown>) => {
    const page = body['page_number'] === undefined ? 1 : Number(body['page_number'])
    const cases = typeof body['cases'] === 'string' ? body['cases'].split(',') : undefined
    const matching = cases
      ? rows.filter((r) => r.case_id !== undefined && cases.includes(r.case_id))
      : rows
    const slice = matching.slice((page - 1) * size, page * size)
    return { activities: slice, count: slice.length, page: page - 1, page_count: size }
  }
}

/** `n` activities on case C-1. */
function messagesOn(n: number): Act[] {
  return Array.from({ length: n }, (_, i) => ({ id: i + 1, case_id: 'C-1' }))
}

/** `n` cases, each with `per` contiguous activities (ordered by case). */
function casesWith(n: number, per: number): Act[] {
  const out: Act[] = []
  let id = 1
  for (let c = 1; c <= n; c++)
    for (let k = 0; k < per; k++) out.push({ id: id++, case_id: `C-${c}` })
  return out
}

const range = (n: number) => Array.from({ length: n }, (_, i) => String(i + 1))
const caseIds = (n: number) => Array.from({ length: n }, (_, i) => `C-${i + 1}`)

async function walk(run: (p: QueryParams) => Promise<{ id: string }[]>, limit: number, pages = 3) {
  const ids: string[] = []
  const hasMore: (boolean | null)[] = []
  for (let page = 1; page <= pages; page++) {
    const params = withPageSink({ page, limit })
    const rows = await run(params)
    ids.push(...rows.map((r) => r.id))
    hasMore.push(listPage(rows, params, 'supportbench').meta.hasMore)
  }
  return { ids, hasMore }
}

describe('supportbench listMessages paging', () => {
  const adapter = new SupportbenchAdapter()
  const run = (p: QueryParams) => adapter.listMessages(creds, 'C-1', p)

  it('serves every activity once, in order, across pages of 2L+1 rows', async () => {
    const L = 10
    handler = activities(messagesOn(2 * L + 1))
    const { ids, hasMore } = await walk(run, L)
    expect(ids).toEqual(range(2 * L + 1))
    expect(hasMore).toEqual([true, true, false])
  })

  it('serves every activity once when caller pages span small upstream pages', async () => {
    const L = 10
    handler = activities(messagesOn(2 * L + 1), 4)
    const { ids, hasMore } = await walk(run, L)
    expect(ids).toEqual(range(2 * L + 1))
    expect(hasMore).toEqual([true, true, false])
  })

  it('page 2 requests the documented page_number with the case filter', async () => {
    handler = activities(messagesOn(21), 10)
    await run(withPageSink({ page: 2, limit: 10 }))
    expect(calls.every((c) => c.path === '/activities' && c.body['cases'] === 'C-1')).toBe(true)
    expect(calls.map((c) => c.body['page_number'])).toEqual([1, 2, 3])
  })

  it('a limit above the maximum is clamped to 500', async () => {
    handler = activities(messagesOn(1200))
    const params = parseListQuery({ limit: '9999' }, adapter)
    expect(params.limit).toBe(500)
    const rows = await run(params)
    expect(rows.map((r) => r.id)).toEqual(range(500))
    expect(listPage(rows, params, 'supportbench').meta.hasMore).toBe(true)
  })

  it('API path: page 2 through parseListQuery and listPage', async () => {
    handler = activities(messagesOn(41), 7)
    const params = parseListQuery({ page: '2', limit: '20' }, adapter)
    const env = listPage(await run(params), params, 'supportbench')
    expect(env.data.map((r) => r.id)).toEqual(range(40).slice(20))
    expect(env.meta.hasMore).toBe(true)
  })

  it('a legacy page_number cursor sends that page once', async () => {
    handler = activities(messagesOn(30), 10)
    const rows = await run({ cursor: '2' } as QueryParams)
    expect(calls).toEqual([{ path: '/activities', body: { cases: 'C-1', page_number: 2 } }])
    expect(rows.map((r) => r.id)).toEqual(range(20).slice(10))
  })

  it("keeps one ticket's messages away from another ticket's walk", async () => {
    const rows: Act[] = [
      ...Array.from({ length: 15 }, (_, i) => ({ id: i + 1, case_id: 'C-1' })),
      ...Array.from({ length: 15 }, (_, i) => ({ id: 101 + i, case_id: 'C-2' })),
    ]
    handler = activities(rows, 10)
    await adapter.listMessages(creds, 'C-1', withPageSink({ page: 1, limit: 10 }))
    const before = calls.length
    const page2 = await adapter.listMessages(creds, 'C-2', withPageSink({ page: 2, limit: 10 }))
    // C-2 starts its own walk from page_number 1 with its own filter.
    expect(calls[before]!.body).toEqual({ cases: 'C-2', page_number: 1 })
    expect(page2.map((r) => r.id)).toEqual(['111', '112', '113', '114', '115'])
  })
})

describe('supportbench listTickets paging', () => {
  const adapter = new SupportbenchAdapter()
  const run = (p: QueryParams) => adapter.listTickets(creds, p)

  it('serves every case once, in order, across pages of 2L+1 cases', async () => {
    const L = 10
    handler = activities(casesWith(2 * L + 1, 3), 500)
    const { ids, hasMore } = await walk(run, L)
    expect(ids).toEqual(caseIds(2 * L + 1))
    expect(hasMore).toEqual([true, true, false])
  })

  it('counts a case once when its activities straddle upstream pages', async () => {
    const L = 10
    // 3 activities a case in upstream pages of 4: every page boundary splits a case.
    handler = activities(casesWith(2 * L + 1, 3), 4)
    const { ids, hasMore } = await walk(run, L)
    expect(ids).toEqual(caseIds(2 * L + 1))
    expect(hasMore).toEqual([true, true, false])
  })

  it('page 2 requests the documented page_number with status_id -1', async () => {
    handler = activities(casesWith(21, 1), 10)
    await run(withPageSink({ page: 2, limit: 10 }))
    expect(calls.every((c) => c.path === '/activities' && c.body['status_id'] === -1)).toBe(true)
    expect(calls.map((c) => c.body['page_number'])).toEqual([1, 2, 3])
  })

  it('a limit above the maximum is clamped to 500', async () => {
    handler = activities(casesWith(1200, 1))
    const params = parseListQuery({ limit: '9999' }, adapter)
    expect(params.limit).toBe(500)
    const rows = await run(params)
    expect(rows.map((r) => r.id)).toEqual(caseIds(500))
    expect(listPage(rows, params, 'supportbench').meta.hasMore).toBe(true)
  })

  it('API path: page 2 through parseListQuery and listPage', async () => {
    handler = activities(casesWith(41, 2), 9)
    const params = parseListQuery({ page: '2', limit: '20' }, adapter)
    const env = listPage(await run(params), params, 'supportbench')
    expect(env.data.map((r) => r.id)).toEqual(caseIds(40).slice(20))
    expect(env.meta.hasMore).toBe(true)
  })

  it("keeps one connection's cases away from another API key", async () => {
    handler = activities(casesWith(30, 1), 10)
    await run(withPageSink({ page: 1, limit: 10 }))
    const before = calls.length
    await adapter.listTickets({ accessToken: 'other' }, withPageSink({ page: 2, limit: 10 }))
    // The other key starts its own walk from page_number 1.
    expect(calls[before]!.body['page_number']).toBe(1)
  })

  it('keeps walking past an upstream page made only of the previous case', async () => {
    // C-1 has 9 activities in upstream pages of 4: page 2 holds only C-1 and
    // yields no new case, yet C-2..C-12 follow on later pages.
    const rows: Act[] = [
      ...Array.from({ length: 9 }, (_, i) => ({ id: i + 1, case_id: 'C-1' })),
      ...casesWith(12, 1)
        .slice(1)
        .map((a, i) => ({ id: 100 + i, case_id: a.case_id })),
    ]
    handler = activities(rows, 4)
    const { ids, hasMore } = await walk(run, 5)
    expect(ids).toEqual(caseIds(12).slice(0, 15))
    expect(hasMore).toEqual([true, true, false])
  })

  it('carries the last case across a page that ends on an activity without a case', async () => {
    // Upstream page 1 ends on an activity with no case_id; page 2 opens with
    // more of C-2, which must not be served a second time.
    const rows: Act[] = [
      { id: 1, case_id: 'C-1' },
      { id: 2, case_id: 'C-2' },
      { id: 3 },
      { id: 4, case_id: 'C-2' },
      { id: 5, case_id: 'C-3' },
      { id: 6, case_id: 'C-4' },
    ]
    handler = activities(rows, 3)
    const { ids, hasMore } = await walk(run, 2, 2)
    expect(ids).toEqual(caseIds(4))
    expect(hasMore).toEqual([true, false])
  })

  it('carries the last case across a whole upstream page without cases', async () => {
    // Upstream page 2 names no case at all; page 3 reopens C-2.
    const rows: Act[] = [
      { id: 1, case_id: 'C-1' },
      { id: 2, case_id: 'C-2' },
      { id: 3 },
      { id: 4 },
      { id: 5, case_id: 'C-2' },
      { id: 6, case_id: 'C-3' },
    ]
    handler = activities(rows, 2)
    const { ids, hasMore } = await walk(run, 2, 2)
    expect(ids).toEqual(caseIds(3))
    expect(hasMore).toEqual([true, false])
  })

  it('a legacy page_number cursor sends that page once', async () => {
    handler = activities(casesWith(30, 1), 10)
    const rows = await run({ cursor: '2' } as QueryParams)
    expect(calls).toEqual([{ path: '/activities', body: { status_id: -1, page_number: 2 } }])
    expect(rows.map((r) => r.id)).toEqual(caseIds(20).slice(10))
  })
})
