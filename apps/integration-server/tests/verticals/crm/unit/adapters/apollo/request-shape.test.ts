/**
 * Apollo list requests: authentication, paging, order and the platform's limits.
 *
 * Authentication, from https://docs.apollo.io/reference/authentication.md:
 *
 *   "Pass the key in the `x-api-key` header of every request."
 *
 * and the base URL, from https://docs.apollo.io/openapi/apollo-rest-api.json:
 *
 *   "All API requests are made to `https://api.apollo.io/api/v1`."
 *
 * An `api_key` in the body or query string is not read: probed with an invalid
 * key, Apollo answered 401 `AUTH.AUTHENTICATION.CREDENTIALS_MISSING` ("This
 * request carried no credential Apollo could authenticate.") to both, and
 * `AUTH.AUTHENTICATION.API_KEY_INVALID` to the same key in `x-api-key`.
 *
 * Contacts and accounts search (POST /contacts/search, POST /accounts/search)
 * page by `page` + `per_page`. From https://docs.apollo.io/reference/search-for-contacts.md
 * and https://docs.apollo.io/reference/search-for-accounts.md:
 *
 *   `page`: "The page number of the Apollo data that you want to retrieve."
 *   `per_page`: "The number of search results that should be returned for each page."
 *   "this endpoint has a display limit of 50,000 records (100 records per page, up to 500 pages)"
 *   `sort_ascending`: "Set to `true` to sort the matching contacts in ascending order.
 *     This parameter must be used with `sort_by_field`."
 *
 * The parameter text never says where numbering starts. The accounts search
 * response example does, by being a single page (search-for-accounts.md,
 * lines 261-266, reflowed onto one line here):
 *
 *   "pagination": { "page": 1, "per_page": 5, "total_entries": 1, "total_pages": 1 }
 *
 * Apollo documents no default search order, so the fake below answers an
 * unsorted search newest-first: only the requested oldest-first sort yields
 * rows in id order.
 *
 * Notes (GET /notes) do NOT take page/per_page. From
 * https://docs.apollo.io/reference/get-a-list-of-notes.md:
 *
 *   "You must provide at least one relation parameter" (it then lists `account_id`,
 *   `contact_id`, `contact_ids`, `opportunity_id`, `calendar_event_id`,
 *   `conversation_id` and `conversation_ids`)
 *   `skip`: "The number of notes to skip for pagination. Must be a non-negative integer. Defaults to `0`."
 *   `limit`: "The maximum number of notes to return per request. Defaults to `25`. Maximum value is `100`."
 *   `sort_by_field`: "The field to sort results by. Defaults to `created_at`."
 *   `sort_direction`: "The direction to sort results. Defaults to `desc`."
 *
 * Deals list at GET /opportunities/search, not GET /opportunities (Apollo
 * documents /opportunities only as POST, to create a deal:
 * https://docs.apollo.io/reference/create-deal.md). From
 * https://docs.apollo.io/reference/list-all-deals.md:
 *
 *   "Use the list all deals endpoint to retrieve every deal that has been created
 *    for your team's Apollo account."
 *   `page`: "The page number of the Apollo data that you want to retrieve."
 *   `per_page`: "The number of search results that should be returned for each page."
 *   `sort_by_field`: `amount`, `is_closed` or `is_won` only — no creation order.
 *   The response example carries
 *   "pagination": { "page": 1, "per_page": 3, "total_entries": 35, "total_pages": 12 }
 *
 * It states no maximum `per_page`; the adapter clamps to its declared 100, and
 * the fake serves the deals in one stable order, since Apollo documents none.
 * The response also carries `"partial_results_limit": 10000`, undescribed;
 * the contacts search carries the same field and value beside its documented
 * 50,000-record display limit, so it is not a documented cap on deals.
 *
 * listPipelines and getPipeline read GET /opportunity_stages, whose reference
 * (https://docs.apollo.io/reference/list-deal-stages.md) documents no
 * parameters at all: "Use the list deal stages endpoint to retrieve information
 * about every deal stage that's available in your team's Apollo account." So
 * nothing is sent — a `page=1&per_page=25` would be a size of our own making,
 * which a paginated upstream would honour by serving 25 stages.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  listPage,
  parseListQuery,
  readUpstreamPage,
  withPageSink,
  type QueryParams,
} from '@opensteward/shared'
import { ApolloAdapter } from '../../../../../../src/verticals/crm/adapters/apollo/index'

const KEY = 'apollo_test'
const CREDS = { accessToken: KEY }
/** Documented: "100 records per page" (search) and "Maximum value is `100`" (notes). */
const MAX = 100
/** Documented: "display limit of 50,000 records". */
const DISPLAY_LIMIT = 50_000
const N_ROWS = 1000
const NOTE_RELATIONS = [
  'account_id',
  'contact_id',
  'contact_ids',
  'opportunity_id',
  'calendar_event_id',
  'conversation_id',
  'conversation_ids',
]

type Sent = Record<string, unknown>
interface Seen {
  method: string
  url: URL
  headers: Headers
  body: Record<string, unknown> | undefined
}

function reply(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

/**
 * A fake Apollo that honours ONLY the documented parameters of each endpoint,
 * and refuses a request without the key in `x-api-key`. Search: `page` (from
 * 1) + `per_page` (at most 100), the first 50,000 matches only, sorted when
 * `sort_by_field` + `sort_ascending` ask for it. Notes: a relation parameter
 * (required), `skip` (from 0) + `limit` (at most 100), `created_at` descending
 * unless `sort_direction=asc`. Anything else is ignored, exactly as an
 * upstream ignores a parameter it does not know.
 */
function fakeApollo(total: number, opts: { noPagination?: boolean } = {}) {
  const byCreated = Array.from({ length: total }, (_, i) => ({
    id: String(i + 1),
    name: `row ${i + 1}`,
    content: `note ${i + 1}`,
  }))
  const newestFirst = [...byCreated].reverse()
  const sent: Sent[] = []
  const requests: Seen[] = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(String(input))
    const method = init?.method ?? 'GET'
    const headers = new Headers(init?.headers)
    const body =
      typeof init?.body === 'string'
        ? (JSON.parse(init.body) as Record<string, unknown>)
        : undefined
    requests.push({ method, url, headers, body })
    if (url.origin !== 'https://api.apollo.io' || !url.pathname.startsWith('/api/v1/')) {
      return reply(404, { error: `no route ${url.href}` })
    }
    if (headers.get('x-api-key') !== KEY) {
      return reply(401, { error: 'Invalid access credentials.' })
    }
    if (method === 'GET' && url.pathname === '/api/v1/opportunity_stages') {
      return reply(200, {
        opportunity_stages: byCreated.slice(0, 30).map((r, i) => ({
          id: r.id,
          name: r.name,
          display_order: i,
        })),
      })
    }
    if (method === 'GET' && url.pathname === '/api/v1/opportunities/search') {
      const q = url.searchParams
      const page = Number(q.get('page') ?? '1')
      const perPage = Number(q.get('per_page') ?? '25')
      if (!Number.isInteger(page) || page < 1) {
        return reply(422, { error: `page must be an integer >= 1 (got ${q.get('page')})` })
      }
      if (!Number.isInteger(perPage) || perPage < 1) {
        return reply(422, { error: `per_page must be an integer >= 1 (got ${q.get('per_page')})` })
      }
      sent.push({ page, per_page: perPage })
      const start = (page - 1) * perPage
      return reply(200, {
        opportunities: byCreated.slice(start, start + perPage),
        ...(opts.noPagination
          ? {}
          : {
              pagination: {
                page,
                per_page: perPage,
                total_entries: total,
                total_pages: Math.ceil(total / perPage),
              },
            }),
      })
    }
    const search = /^\/api\/v1\/(contacts|accounts)\/search$/.exec(url.pathname)
    if (method === 'POST' && search) {
      const entity = search[1] === 'contacts' ? 'contact' : 'account'
      const page = body?.['page']
      const perPage = body?.['per_page']
      if (typeof page !== 'number' || !Number.isInteger(page) || page < 1) {
        return reply(422, { error: `page must be an integer >= 1 (got ${String(page)})` })
      }
      if (
        typeof perPage !== 'number' ||
        !Number.isInteger(perPage) ||
        perPage < 1 ||
        perPage > MAX
      ) {
        return reply(422, { error: `per_page must be 1..${MAX} (got ${String(perPage)})` })
      }
      sent.push({ page, per_page: perPage })
      const sorted =
        body?.['sort_by_field'] === `${entity}_created_at` && body?.['sort_ascending'] === true
      const visible = (sorted ? byCreated : newestFirst).slice(0, DISPLAY_LIMIT)
      const start = (page - 1) * perPage
      return reply(200, {
        [search[1]!]: visible.slice(start, start + perPage),
        ...(opts.noPagination
          ? {}
          : {
              pagination: {
                page,
                per_page: perPage,
                total_entries: total,
                total_pages: Math.ceil(total / perPage),
              },
            }),
      })
    }
    if (method === 'GET' && url.pathname === '/api/v1/notes') {
      const q = url.searchParams
      if (!NOTE_RELATIONS.some((k) => q.has(k))) {
        return reply(422, { error: 'You must provide at least one relation parameter' })
      }
      const skip = Number(q.get('skip') ?? '0')
      const limit = Number(q.get('limit') ?? '25')
      if (!Number.isInteger(skip) || skip < 0) {
        return reply(422, { error: `skip must be a non-negative integer (got ${skip})` })
      }
      if (!Number.isInteger(limit) || limit < 1 || limit > MAX) {
        return reply(422, { error: `limit must be 1..${MAX} (got ${limit})` })
      }
      sent.push({ skip, limit })
      const asc =
        (q.get('sort_by_field') ?? 'created_at') === 'created_at' &&
        q.get('sort_direction') === 'asc'
      return reply(200, { notes: (asc ? byCreated : newestFirst).slice(skip, skip + limit) })
    }
    return reply(404, { error: `unexpected ${method} ${url.pathname}` })
  })
  return { sent, requests }
}

function ids(start: number, count: number): string[] {
  return Array.from({ length: count }, (_, i) => String(start + i))
}

type Row = { id: string }

/** How each method expresses "page k of size s" in Apollo's own parameters. */
const byPage = (page: number, size: number): Sent => ({ page, per_page: size })
const bySkip = (page: number, size: number): Sent => ({ skip: (page - 1) * size, limit: size })

const NOTE_OF = { contact_id: 'c_1' }

const METHODS = [
  {
    name: 'listContacts',
    shape: byPage,
    extra: {},
    call: (a: ApolloAdapter, p: QueryParams): Promise<Row[]> => a.listContacts(CREDS, p),
  },
  {
    name: 'listCompanies',
    shape: byPage,
    extra: {},
    call: (a: ApolloAdapter, p: QueryParams): Promise<Row[]> => a.listCompanies(CREDS, p),
  },
  {
    name: 'listDeals',
    shape: byPage,
    extra: {},
    call: (a: ApolloAdapter, p: QueryParams): Promise<Row[]> => a.listDeals(CREDS, p),
  },
  {
    name: 'listNotes',
    shape: bySkip,
    extra: NOTE_OF,
    call: (a: ApolloAdapter, p: QueryParams): Promise<Row[]> => a.listNotes(CREDS, p),
  },
] as const

/** The page/per_page lists, whose responses carry Apollo's `pagination`. */
const PAGINATED = METHODS.filter((m) => m.shape === byPage)
/** Contacts and accounts search, the two with a documented 50,000-record display limit. */
const SEARCHES = PAGINATED.filter((m) => m.name !== 'listDeals')

/** A router-shaped query (sink attached), plus any relation the method needs. */
function query(q: Record<string, string>, extra: Record<string, string>): QueryParams {
  return Object.assign(parseListQuery(q), extra)
}

afterEach(() => vi.restoreAllMocks())

describe('apollo capabilities', () => {
  it('declares the documented 100-per-page ceiling so the sync worker never asks for more', () => {
    expect(new ApolloAdapter().capabilities).toEqual(expect.objectContaining({ maxPageSize: MAX }))
  })
})

describe.each(METHODS)('apollo $name request', ({ extra, call }) => {
  it('authenticates with x-api-key at the documented base, never with api_key', async () => {
    const { requests } = fakeApollo(N_ROWS)
    expect(await call(new ApolloAdapter(), query({ limit: '10' }, extra))).toHaveLength(10)
    expect(requests).toHaveLength(1)
    const [r] = requests
    expect(r!.headers.get('x-api-key')).toBe(KEY)
    expect(r!.url.href.startsWith('https://api.apollo.io/api/v1/')).toBe(true)
    expect(r!.url.searchParams.has('api_key')).toBe(false)
    expect(r!.body ?? {}).not.toHaveProperty('api_key')
    expect(r!.body ?? {}).not.toHaveProperty('__listKey')
  })
})

describe.each(METHODS)('apollo $name paging', ({ shape, extra, call }) => {
  const adapter = () => new ApolloAdapter()
  const run = async (q: Record<string, string>) =>
    (await call(adapter(), query(q, extra))).map((r) => r.id)
  /** Params at a page the router never sends, as a direct caller builds them. */
  const runAt = async (page: number) => {
    const params = query({ limit: '10' }, extra)
    params.page = page
    return (await call(adapter(), params)).map((r) => r.id)
  }

  it('page 1 returns the first rows and sends the caller limit', async () => {
    const { sent } = fakeApollo(N_ROWS)
    expect(await run({ page: '1', limit: '10' })).toEqual(ids(1, 10))
    expect(sent).toEqual([shape(1, 10)])
  })

  it('page 2 returns the next rows', async () => {
    const { sent } = fakeApollo(N_ROWS)
    expect(await run({ page: '2', limit: '10' })).toEqual(ids(11, 10))
    expect(sent).toEqual([shape(2, 10)])
  })

  it('a missing page returns the first rows', async () => {
    const { sent } = fakeApollo(N_ROWS)
    expect(await run({ limit: '10' })).toEqual(ids(1, 10))
    expect(sent).toEqual([shape(1, 10)])
  })

  // parseListQuery reads 0, -3 and non-numbers as the first page before an
  // adapter sees them, so this guard is for direct callers: built directly.
  it.each([0, -3])('a direct page %s is treated as page 1', async (page) => {
    const { sent } = fakeApollo(N_ROWS)
    expect(await runAt(page)).toEqual(ids(1, 10))
    expect(sent).toEqual([shape(1, 10)])
  })

  it('a limit above the documented 100 is clamped, and page 2 strides by the clamp', async () => {
    const { sent } = fakeApollo(N_ROWS)
    expect(await run({ page: '1', limit: '500' })).toEqual(ids(1, MAX))
    expect(await run({ page: '2', limit: '500' })).toEqual(ids(MAX + 1, MAX))
    expect(sent).toEqual([shape(1, MAX), shape(2, MAX)])
  })

  it('a direct call with no limit keeps the adapter default of 25', async () => {
    const { sent } = fakeApollo(N_ROWS)
    expect((await call(adapter(), { ...extra })).map((r) => r.id)).toEqual(ids(1, 25))
    expect(sent).toEqual([shape(1, 25)])
  })

  it.each([
    [Number.NaN, 25],
    [0, 25],
    [-5, 25],
    [7.5, 7],
    ['10', 10],
    ['abc', 25],
  ])('a direct call with limit %s sends a valid size (%i)', async (limit, size) => {
    const { sent } = fakeApollo(N_ROWS)
    const params = { ...extra, limit } as unknown as QueryParams
    expect((await call(adapter(), params)).map((r) => r.id)).toEqual(ids(1, size))
    expect(sent).toEqual([shape(1, size)])
  })

  it('a direct call with page "2" as a string reads it as page 2', async () => {
    const { sent } = fakeApollo(N_ROWS)
    const params = { ...extra, page: '2', limit: 10 } as unknown as QueryParams
    expect((await call(adapter(), params)).map((r) => r.id)).toEqual(ids(11, 10))
    expect(sent).toEqual([shape(2, 10)])
  })

  it.each([10, 7, MAX])(
    'walks every row exactly once, in order, driven like the sync (limit %i, N = 2L + 1)',
    async (limit) => {
      const n = 2 * limit + 1
      fakeApollo(n)
      const seen: string[] = []
      for (let k = 1; k <= 10; k++) {
        const params = withPageSink({ page: k, limit, ...extra })
        const page = (await call(adapter(), params)).map((r) => r.id)
        // The router truncates an over-return to the caller's limit.
        expect(page.length).toBeLessThanOrEqual(limit)
        seen.push(...page)
        // The sync worker's rule: the adapter's report when it gave one.
        const reported = readUpstreamPage(params)?.hasMore
        if (typeof reported === 'boolean' ? !reported : page.length < limit) break
      }
      expect(seen).toEqual(ids(1, n))
    },
  )
})

describe.each(PAGINATED)('apollo $name reports what Apollo said about paging', ({ call }) => {
  it('a clamped page says more rows exist, though it is shorter than the caller limit', async () => {
    fakeApollo(N_ROWS)
    const params = parseListQuery({ limit: '500' })
    const envelope = listPage(await call(new ApolloAdapter(), params), params, 'apollo')
    expect(envelope.data).toHaveLength(MAX)
    expect(envelope.meta.hasMore).toBe(true)
  })

  it('reports nothing when Apollo sends no pagination, rather than a made-up last page', async () => {
    fakeApollo(N_ROWS, { noPagination: true })
    const params = parseListQuery({ limit: '10' })
    expect(await call(new ApolloAdapter(), params)).toHaveLength(10)
    expect(readUpstreamPage(params)).toBeUndefined()
  })

  it('a full last page says it is the last', async () => {
    fakeApollo(N_ROWS)
    const params = parseListQuery({ page: '10', limit: '100' })
    const envelope = listPage(await call(new ApolloAdapter(), params), params, 'apollo')
    expect(envelope.data.map((r) => r.id)).toEqual(ids(901, 100))
    expect(envelope.meta.hasMore).toBe(false)
  })
})

describe.each(SEARCHES)('apollo $name at the 50,000-record display limit', ({ call }) => {
  it('refuses a page that starts past the limit instead of reading its answer as the end', async () => {
    const { requests } = fakeApollo(DISPLAY_LIMIT + 50)
    await expect(
      call(new ApolloAdapter(), parseListQuery({ page: '501', limit: '100' })),
    ).rejects.toMatchObject({ statusCode: 422, code: 'UPSTREAM_LIMIT' })
    expect(requests).toHaveLength(0)
  })

  it('serves the last page inside the limit, and says more exist', async () => {
    fakeApollo(DISPLAY_LIMIT + 50)
    const params = parseListQuery({ page: '500', limit: '100' })
    expect((await call(new ApolloAdapter(), params)).map((r) => r.id)).toEqual(
      ids(DISPLAY_LIMIT - 99, 100),
    )
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
  })

  it('refuses a page the limit cuts short, whose end cannot be told from the real one', async () => {
    fakeApollo(DISPLAY_LIMIT + 50)
    // limit 7, page 7143 → rows 49,995..50,001; Apollo serves only to 50,000.
    await expect(
      call(new ApolloAdapter(), parseListQuery({ page: '7143', limit: '7' })),
    ).rejects.toMatchObject({ statusCode: 422, code: 'UPSTREAM_LIMIT' })
  })
})

describe('apollo listDeals endpoint', () => {
  it('lists at the documented GET /opportunities/search, never GET /opportunities', async () => {
    const { requests } = fakeApollo(N_ROWS)
    await new ApolloAdapter().listDeals(CREDS, parseListQuery({ limit: '10' }))
    expect(requests.map((r) => `${r.method} ${r.url.pathname}`)).toEqual([
      'GET /api/v1/opportunities/search',
    ])
  })
})

describe('apollo deal stages', () => {
  it.each([
    ['listPipelines', (a: ApolloAdapter) => a.listPipelines(CREDS, parseListQuery({ page: '2', limit: '10' }))],
    ['getPipeline', (a: ApolloAdapter) => a.getPipeline(CREDS, 'default')],
  ] as const)(
    '%s reads GET /opportunity_stages with no parameters, since none is documented',
    async (_name, run) => {
      const { requests } = fakeApollo(N_ROWS)
      await run(new ApolloAdapter())
      expect(requests.map((r) => `${r.method} ${r.url.pathname}${r.url.search}`)).toEqual([
        'GET /api/v1/opportunity_stages',
      ])
    },
  )
})

describe('apollo listNotes relation', () => {
  it('refuses without a relation, sending nothing, since GET /notes requires one', async () => {
    const { requests } = fakeApollo(N_ROWS)
    await expect(
      new ApolloAdapter().listNotes(CREDS, parseListQuery({ limit: '10' })),
    ).rejects.toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
    expect(requests).toHaveLength(0)
  })

  it.each([
    ['contact_id', 'contact_id'],
    ['company_id', 'account_id'],
    ['deal_id', 'opportunity_id'],
  ])('forwards %s as Apollo %s', async (ours, theirs) => {
    const { requests } = fakeApollo(N_ROWS)
    await new ApolloAdapter().listNotes(CREDS, query({ limit: '10' }, { [ours]: 'x_42' }))
    expect(requests).toHaveLength(1)
    expect(requests[0]!.url.searchParams.get(theirs)).toBe('x_42')
  })
})
