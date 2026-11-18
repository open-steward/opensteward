/**
 * Freshsales listActivities: GET /api/tasks, filtered, paged by `page` +
 * `per_page`.
 *
 * From https://developers.freshworks.com/crm/api/ ("List All Tasks"):
 *
 *   GET /api/tasks?filter=[filter param]
 *   "The parameter filter is mandatory."
 *   "Only one filter is allowed at a time. Getting multiple filtered tasks is not possible."
 *   "You can use this API to receive a list of filtered tasks i.e get your open , due today ,
 *    due tomorrow , overdue and completed tasks."
 *   The Tasks "Properties" table gives Status values Open (0) and Completed (1).
 *   The response example ends with `"meta" : { "total" : 3 }` (reflowed onto one line).
 *
 * So every task is in exactly one of `open` and `completed`, and the adapter
 * lists `open` then `completed`: page k is rows [(k − 1)·size, k·size) of that
 * sequence, which is what the fake's ids number (open 1..O, completed
 * O+1..O+C).
 *
 * Paging ("Pagination"):
 *
 *   "To scroll through the pages, add the parameter page to the query string. The page number starts with 1."
 *   "By default, the number of objects returned per page is 25."
 *
 * and, for the page size, the same page's sales-activities example:
 *
 *   "If you’d like to list 10 sales activities for first page use this API."
 *   GET https://domain.myfreshworks.com/crm/sales/api/sales_activities?per_page=10&page=1
 *
 * The docs state no maximum `per_page` for list endpoints; the only stated
 * ceiling ("you can’t have more than 100 results displayed") is on /search and
 * /filtered_search. 100 is therefore UNVERIFIED for /tasks. The fake refuses
 * more, and the adapter checks every page against `meta.total`, so a lower
 * ceiling that Freshsales enforced silently would fail loudly (tested below).
 *
 * Refused before any request (501 NOT_SUPPORTED), from the same page:
 *
 *   listContacts, listCompanies, listDeals. GET /api/contacts, /api/sales_accounts
 *   and /api/deals are documented only for create. "List All Contacts" is
 *   GET /api/contacts/view/[view_id], and "To fetch contacts from a view, first
 *   fetch the view id using the filters API and then use view API to fetch." The
 *   filters carry only id, name, model_class_name, user_id, is_default, is_public
 *   and updated_at — nothing marks the view of every record — and the page's own
 *   examples disagree on which it is: "To fetch all contacts (view_id => 3 from
 *   the filters API)" where view 3 is "New Contacts" and view 4 "All Contacts",
 *   and "To fetch all deals (view_id => 4 from the filters API)" where view 4 is
 *   "Recent Deals" and no view is named for all deals. `is_default` is true on
 *   seven of the ten contact views and all three account views, so it marks the
 *   built-in views, not the view of all records; only the display name ("All
 *   Contacts", "All Accounts") does, and the prose contradicts even that. Views
 *   also document no page size: "By default, the number of objects returned per
 *   page is 25."
 *
 *   listNotes. The Notes section documents only "Create a Note", "Update a note"
 *   and "Delete a note"; notes come back only inside one record
 *   ("api/contacts/[id]?include=notes").
 *
 * listPipelines reads the documented configuration list, "api/selector/deal_pipelines
 * — Fetch all existing deal pipelines' details in the Freshsales portal. Will
 * give id, name of the deal pipelines", which documents no paging: the page's
 * "Pagination" section covers "API responses that return a list of objects,
 * such as View List of contacts or View List of deals". So nothing is sent.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  listPage,
  parseListQuery,
  readUpstreamPage,
  withPageSink,
  type QueryParams,
} from '@opensteward/shared'
import { FreshsalesAdapter } from '../../../../../../src/verticals/crm/adapters/freshsales/index'

const BASE = 'https://acme.myfreshworks.com/crm/sales/api'
const CREDS = { accessToken: 'fs_key', extra: { domain: 'acme.myfreshworks.com', baseUrl: BASE } }
/** UNVERIFIED for list endpoints — see the header. */
const MAX = 100
const FILTERS = ['open', 'due_today', 'due_tomorrow', 'overdue', 'completed']

type Sent = { filter: string; page: number; per_page: number }

interface FakeOptions {
  /** Page size Freshsales actually uses, when it is not the one sent. */
  servesPerPage?: number
  /** Leave `meta.total` out of the response. */
  noTotal?: boolean
}

/**
 * A fake Freshsales /tasks that honours ONLY what is documented: a mandatory
 * `filter` (one value), `page` (from 1, default 1), `per_page` (default 25,
 * at most 100), and `meta.total` for the filtered list. `open` holds ids
 * 1..openCount, `completed` the next completedCount. Out-of-range values are
 * refused rather than silently corrected.
 */
function fakeTasks(openCount: number, completedCount: number, opts: FakeOptions = {}) {
  const task = (id: number, status: number) => ({ id, status, title: `task ${id}` })
  const open = Array.from({ length: openCount }, (_, i) => task(i + 1, 0))
  const completed = Array.from({ length: completedCount }, (_, i) => task(openCount + i + 1, 1))
  const sent: Sent[] = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(String(input))
    if ((init?.method ?? 'GET') !== 'GET' || url.pathname !== '/crm/sales/api/tasks') {
      return new Response(`unexpected ${init?.method} ${url.pathname}`, { status: 404 })
    }
    const filter = url.searchParams.getAll('filter')
    if (filter.length !== 1 || !FILTERS.includes(filter[0]!)) {
      return new Response('The parameter filter is mandatory.', { status: 400 })
    }
    const page = Number(url.searchParams.get('page') ?? '1')
    const perPage = Number(url.searchParams.get('per_page') ?? '25')
    if (!Number.isInteger(page) || page < 1) {
      return new Response(`page must be >= 1 (got ${page})`, { status: 400 })
    }
    if (!Number.isInteger(perPage) || perPage < 1 || perPage > MAX) {
      return new Response(`per_page must be 1..${MAX} (got ${perPage})`, { status: 400 })
    }
    sent.push({ filter: filter[0]!, page, per_page: perPage })
    const list = filter[0] === 'completed' ? completed : filter[0] === 'open' ? open : []
    const size = opts.servesPerPage ?? perPage
    const start = (page - 1) * size
    return new Response(
      JSON.stringify({
        tasks: list.slice(start, start + size),
        meta: opts.noTotal ? {} : { total: list.length },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )
  })
  return { sent }
}

function ids(start: number, count: number): string[] {
  return Array.from({ length: count }, (_, i) => String(start + i))
}

type Row = { id: string }

const METHODS = [
  {
    name: 'listActivities',
    call: (a: FreshsalesAdapter, p: QueryParams): Promise<Row[]> => a.listActivities(CREDS, p),
  },
] as const

afterEach(() => vi.restoreAllMocks())

const UNLISTABLE = [
  {
    name: 'listContacts',
    call: (a: FreshsalesAdapter, p: QueryParams): Promise<unknown[]> => a.listContacts(CREDS, p),
  },
  {
    name: 'listCompanies',
    call: (a: FreshsalesAdapter, p: QueryParams): Promise<unknown[]> => a.listCompanies(CREDS, p),
  },
  {
    name: 'listDeals',
    call: (a: FreshsalesAdapter, p: QueryParams): Promise<unknown[]> => a.listDeals(CREDS, p),
  },
  {
    name: 'listNotes',
    call: (a: FreshsalesAdapter, p: QueryParams): Promise<unknown[]> => a.listNotes(CREDS, p),
  },
] as const

describe.each(UNLISTABLE)('freshsales $name', ({ call }) => {
  it.each([{}, { page: '2', limit: '10' }])(
    'refuses with 501 NOT_SUPPORTED and sends no request (query %o)',
    async (q) => {
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockImplementation(async () => new Response('{}', { status: 404 }))
      await expect(call(new FreshsalesAdapter(), parseListQuery(q))).rejects.toMatchObject({
        statusCode: 501,
        code: 'NOT_SUPPORTED',
        message: expect.stringMatching(/^Freshsales cannot list /),
      })
      expect(fetchSpy).not.toHaveBeenCalled()
    },
  )
})

describe('freshsales listPipelines', () => {
  /** The selector answers every request with all `count` pipelines. */
  function fakeSelector(count: number) {
    const seen: string[] = []
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = new URL(String(input))
      seen.push(`${init?.method ?? 'GET'} ${url.pathname}${url.search}`)
      const deal_pipelines = Array.from({ length: count }, (_, i) => ({
        id: i + 1,
        name: `Pipeline ${i + 1}`,
      }))
      return new Response(JSON.stringify({ deal_pipelines }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    })
    return seen
  }

  it.each([
    [{}, ['1']],
    [{ page: '2', limit: '10' }, []],
  ])(
    'reads GET /api/selector/deal_pipelines whole, with no paging parameters (query %o)',
    async (q, ids) => {
      const seen = fakeSelector(1)
      const pipelines = await new FreshsalesAdapter().listPipelines(CREDS, parseListQuery(q))
      expect(seen).toEqual(['GET /crm/sales/api/selector/deal_pipelines'])
      // Paged locally: page 2 of a one-pipeline list is empty, not page 1 again.
      expect(pipelines.map((p) => p.id)).toEqual(ids)
    },
  )

  it('pages the whole selector list locally, reaching every pipeline once', async () => {
    fakeSelector(12)
    const adapter = new FreshsalesAdapter()
    const page1 = parseListQuery({ limit: '10' })
    const page2 = parseListQuery({ page: '2', limit: '10' })
    const first = await adapter.listPipelines(CREDS, page1)
    const second = await adapter.listPipelines(CREDS, page2)
    expect([...first, ...second].map((p) => p.id)).toEqual(
      Array.from({ length: 12 }, (_, i) => String(i + 1)),
    )
    expect(readUpstreamPage(page1)).toMatchObject({ totalCount: 12, hasMore: true })
    expect(readUpstreamPage(page2)).toMatchObject({ totalCount: 12, hasMore: false })
  })
})

describe('freshsales capabilities', () => {
  it('declares the 100-per-page ceiling it clamps to, so the sync worker never asks for more', () => {
    expect(new FreshsalesAdapter().capabilities).toEqual(
      expect.objectContaining({ maxPageSize: MAX }),
    )
  })
})

describe.each(METHODS)('freshsales $name paging', ({ call }) => {
  const adapter = () => new FreshsalesAdapter()
  const run = async (query: Record<string, string>) =>
    (await call(adapter(), parseListQuery(query))).map((r) => r.id)
  /** Params at a page the router never sends, as a direct caller builds them. */
  const runAt = async (page: number) => {
    const params = parseListQuery({ limit: '10' })
    params.page = page
    return (await call(adapter(), params)).map((r) => r.id)
  }

  it('page 1 returns the first rows and sends filter=open with the caller limit', async () => {
    const { sent } = fakeTasks(1000, 500)
    expect(await run({ page: '1', limit: '10' })).toEqual(ids(1, 10))
    expect(sent).toEqual([{ filter: 'open', page: 1, per_page: 10 }])
  })

  it('page 2 returns the next rows', async () => {
    const { sent } = fakeTasks(1000, 500)
    expect(await run({ page: '2', limit: '10' })).toEqual(ids(11, 10))
    expect(sent).toEqual([{ filter: 'open', page: 2, per_page: 10 }])
  })

  it('a missing page returns the first rows', async () => {
    const { sent } = fakeTasks(1000, 500)
    expect(await run({ limit: '10' })).toEqual(ids(1, 10))
    expect(sent).toEqual([{ filter: 'open', page: 1, per_page: 10 }])
  })

  // parseListQuery reads 0, -3 and non-numbers as the first page before an
  // adapter sees them, so this guard is for direct callers: built directly.
  it.each([0, -3])('a direct page %s is treated as page 1', async (page) => {
    const { sent } = fakeTasks(1000, 500)
    expect(await runAt(page)).toEqual(ids(1, 10))
    expect(sent).toEqual([{ filter: 'open', page: 1, per_page: 10 }])
  })

  it('a limit above 100 is clamped, and page 2 strides by the clamp', async () => {
    const { sent } = fakeTasks(1000, 500)
    expect(await run({ page: '1', limit: '500' })).toEqual(ids(1, MAX))
    expect(await run({ page: '2', limit: '500' })).toEqual(ids(MAX + 1, MAX))
    expect(sent).toEqual([
      { filter: 'open', page: 1, per_page: MAX },
      { filter: 'open', page: 2, per_page: MAX },
    ])
  })

  it('a direct call with no limit keeps the documented default of 25', async () => {
    const { sent } = fakeTasks(1000, 500)
    expect((await call(adapter(), {})).map((r) => r.id)).toEqual(ids(1, 25))
    expect(sent).toEqual([{ filter: 'open', page: 1, per_page: 25 }])
  })

  it.each([
    [Number.NaN, 25],
    [0, 25],
    [-5, 25],
    [7.5, 7],
    ['10', 10],
    ['abc', 25],
  ])('a direct call with limit %s sends a valid per_page (%i)', async (limit, size) => {
    const { sent } = fakeTasks(1000, 500)
    const params = { limit } as unknown as QueryParams
    expect((await call(adapter(), params)).map((r) => r.id)).toEqual(ids(1, size))
    expect(sent).toEqual([{ filter: 'open', page: 1, per_page: size }])
  })

  it('a direct call with page "2" as a string reads it as page 2', async () => {
    const { sent } = fakeTasks(1000, 500)
    const params = { page: '2', limit: 10 } as unknown as QueryParams
    expect((await call(adapter(), params)).map((r) => r.id)).toEqual(ids(11, 10))
    expect(sent).toEqual([{ filter: 'open', page: 2, per_page: 10 }])
  })

  it('the page where open tasks run out is topped up from completed ones', async () => {
    const { sent } = fakeTasks(15, 100)
    expect(await run({ page: '2', limit: '10' })).toEqual(ids(11, 10))
    expect(sent).toEqual([
      { filter: 'open', page: 2, per_page: 10 },
      { filter: 'completed', page: 1, per_page: 10 },
    ])
  })

  it('a page past the open tasks reads the completed ones it covers', async () => {
    const { sent } = fakeTasks(15, 100)
    // Rows 21..30 are completed tasks 6..15: pages 1 and 2 of `completed`.
    expect(await run({ page: '3', limit: '10' })).toEqual(ids(21, 10))
    expect(sent).toEqual([
      { filter: 'open', page: 3, per_page: 10 },
      { filter: 'completed', page: 1, per_page: 10 },
      { filter: 'completed', page: 2, per_page: 10 },
    ])
  })

  describe.each([10, 7, MAX])('walked like the sync at limit %i (N = 2L + 1)', (limit) => {
    const n = 2 * limit + 1
    it.each([0, 3, limit, limit + 3, n])('%i open tasks, the rest completed', async (openCount) => {
      fakeTasks(openCount, n - openCount)
      const seen: string[] = []
      for (let k = 1; k <= 10; k++) {
        const params = withPageSink({ page: k, limit })
        const page = (await call(adapter(), params)).map((r) => r.id)
        // The router truncates an over-return to the caller's limit.
        expect(page.length).toBeLessThanOrEqual(limit)
        seen.push(...page)
        // The sync worker's rule: the adapter's report when it gave one.
        const reported = readUpstreamPage(params)?.hasMore
        if (typeof reported === 'boolean' ? !reported : page.length < limit) break
      }
      expect(seen).toEqual(ids(1, n))
    })
  })
})

describe('freshsales listActivities reports what the totals say', () => {
  it('a clamped page says more rows exist, though it is shorter than the caller limit', async () => {
    fakeTasks(1000, 500)
    const params = parseListQuery({ limit: '500' })
    const envelope = listPage(
      await new FreshsalesAdapter().listActivities(CREDS, params),
      params,
      'freshsales',
    )
    expect(envelope.data).toHaveLength(MAX)
    expect(envelope.meta.hasMore).toBe(true)
  })

  it('a full page that ends the completed tasks says it is the last', async () => {
    fakeTasks(15, 5)
    const params = parseListQuery({ page: '2', limit: '10' })
    const envelope = listPage(
      await new FreshsalesAdapter().listActivities(CREDS, params),
      params,
      'freshsales',
    )
    expect(envelope.data.map((r) => r.id)).toEqual(ids(11, 10))
    expect(envelope.meta.hasMore).toBe(false)
  })

  it('a last page cut from a short completed page says it is the last', async () => {
    const { sent } = fakeTasks(3, 18)
    const params = parseListQuery({ page: '3', limit: '10' })
    const envelope = listPage(
      await new FreshsalesAdapter().listActivities(CREDS, params),
      params,
      'freshsales',
    )
    expect(envelope.data.map((r) => r.id)).toEqual(['21'])
    expect(envelope.meta.hasMore).toBe(false)
    // The short page ends `completed`; nothing past it is asked for.
    expect(sent).toEqual([
      { filter: 'open', page: 3, per_page: 10 },
      { filter: 'completed', page: 2, per_page: 10 },
    ])
  })
})

describe('freshsales listActivities refuses pages it cannot place', () => {
  it('fails loudly when Freshsales pages by a smaller size than per_page asked for', async () => {
    fakeTasks(300, 0, { servesPerPage: 25 })
    await expect(
      new FreshsalesAdapter().listActivities(CREDS, parseListQuery({ limit: '100' })),
    ).rejects.toMatchObject({ statusCode: 502, code: 'UPSTREAM_ERROR' })
  })

  it('fails loudly when Freshsales ignores a smaller per_page and over-returns', async () => {
    fakeTasks(300, 0, { servesPerPage: 25 })
    await expect(
      new FreshsalesAdapter().listActivities(CREDS, parseListQuery({ limit: '10' })),
    ).rejects.toMatchObject({ statusCode: 502, code: 'UPSTREAM_ERROR' })
  })

  it('fails loudly on an empty open page it cannot place without meta.total', async () => {
    fakeTasks(5, 100, { noTotal: true })
    await expect(
      new FreshsalesAdapter().listActivities(CREDS, parseListQuery({ page: '3', limit: '10' })),
    ).rejects.toMatchObject({ statusCode: 502, code: 'UPSTREAM_ERROR' })
  })

  it('places a short open page without meta.total, from its own length', async () => {
    fakeTasks(15, 100, { noTotal: true })
    const rows = await new FreshsalesAdapter().listActivities(
      CREDS,
      parseListQuery({ page: '2', limit: '10' }),
    )
    expect(rows.map((r) => r.id)).toEqual(ids(11, 10))
  })
})
