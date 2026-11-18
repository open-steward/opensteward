/**
 * Zendesk lists page by cursor: `page[size]` and `page[after]`, with the next
 * cursor in `meta.after_cursor` while `meta.has_more` is true
 * (https://developer.zendesk.com/api-reference/introduction/pagination/).
 *
 * All seven list methods used to send `per_page` and nothing else. Without
 * `page[size]` Zendesk uses offset pagination ("If you omit the page[size]
 * parameter, offset pagination is used."), and with no `page` either every
 * request was page 1: the sync worker re-fetched the first page until its page
 * ceiling, and the API served page 1 for every page. A `cursor` passed through
 * as `page[after]` was ignored for the same reason.
 *
 * Each list now resolves the caller's 1-based `page` through the shared cursor
 * pager, sends `page[size]` (clamped to the documented 100) and reports
 * `has_more`. The fake below honours only what the docs describe: cursor
 * pagination when `page[size]` is sent, offset pagination (`per_page`, `page`)
 * otherwise, the two never mixed, and nothing above 100 a page. A non-empty
 * page always carries a cursor, the last one too ("After you reach the end of
 * the records, you can save the value of next or after_cursor to retrieve new
 * records in the future"), so only `has_more` says where a list ends. On
 * `/users.json` and `/groups.json` the fake returns `has_more` only when
 * `include_boundary_indicators` asks for it. That is the strictest reading of
 * "When true, includes has_more indicator in the cursor pagination response
 * meta.", which does not say `has_more` is left out otherwise. The cursor
 * guide's own `users.json` examples send only `page[size]` and still read
 * `meta.has_more`, so the real API may send it unasked. The fake is stricter
 * than the docs on purpose: it pins that the adapter asks, which is harmless
 * either way.
 * https://developer.zendesk.com/documentation/api-basics/pagination/paginating-through-lists-using-cursor-pagination/
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import axios from 'axios'
import {
  withPageSink,
  readUpstreamPage,
  _resetCursorPager,
  parseListQuery,
  listPage,
  type QueryParams,
} from '@opensteward/shared'
import { ZendeskAdapter } from '../../../../../src/verticals/customer-support/adapters/zendesk/index'

const CFG = {
  clientId: 'zd-client',
  clientSecret: 'zd-secret',
  redirectUri: 'http://localhost:3010/auth/customer-support/zendesk/callback',
}
const creds = (token: string, subdomain = 'acme') => ({
  accessToken: token,
  extra: { tenantSubdomain: subdomain },
})
const CREDS = creds('tok-a')

/** "Returns a maximum of 100 records per page." on every list endpoint used here. */
const ZENDESK_MAX = 100

interface Call {
  path: string
  params: Record<string, unknown>
}

type Row = Record<string, unknown>

const encode = (offset: number) => Buffer.from(`row:${offset}`).toString('base64')
const decode = (cursor: string) => Number(Buffer.from(cursor, 'base64').toString().slice(4))

function upstreamError(status: number, message: string): Error {
  return Object.assign(new Error(message), { response: { status } })
}

/**
 * The List Users and List Groups sections document `include_boundary_indicators`;
 * no other list used here does. On these paths the fake withholds `has_more`
 * unless the flag is sent. That is a strict reading, not documented behaviour
 * (see the file header).
 */
const BOUNDARY_FLAG_PATHS = new Set(['/users.json', '/groups.json'])

interface FakeOpts {
  /**
   * Leave `meta.has_more` out of every response, and hand out a cursor even
   * on an empty page: a caller that follows cursors alone never stops.
   */
  noHasMore?: boolean
  /**
   * A full last page says `has_more: true`, and the page after it is empty
   * with null cursors: "Occasionally, you may get an empty record set, where
   * after_cursor, before_cursor, next and prev are null, even though has_more
   * was true in the previous page."
   */
  fullLastPageClaimsMore?: boolean
}

/**
 * A Zendesk account holding `world[path]`. `/users.json` honours the
 * documented `role` filter. Cursor pagination when `page[size]` is sent;
 * offset pagination (`per_page`, default 100, and `page`, default 1)
 * otherwise; both at once is refused ("These are mutually exclusive").
 */
function fakeZendesk(world: Record<string, Row[]>, opts: FakeOpts = {}) {
  const calls: Call[] = []
  const get = vi.fn(async (path: string, cfg?: { params?: Record<string, unknown> }) => {
    const params = { ...(cfg?.params ?? {}) }
    calls.push({ path, params })
    const all = world[path]
    if (!all) throw upstreamError(404, `no such endpoint ${path}`)
    const rows =
      path === '/users.json' && params['role'] !== undefined
        ? all.filter((r) => r['role'] === params['role'])
        : all
    const key = resourceKey(path)
    const size = params['page[size]']
    if (size !== undefined) {
      if (params['per_page'] !== undefined || params['page'] !== undefined)
        throw upstreamError(400, 'offset and cursor pagination are mutually exclusive')
      const n = Number(size)
      if (!Number.isInteger(n) || n < 1 || n > ZENDESK_MAX)
        throw upstreamError(400, `page[size] must be 1..${ZENDESK_MAX}`)
      const after = params['page[after]']
      const start = after === undefined ? 0 : decode(String(after))
      const slice = rows.slice(start, start + n)
      const end = start + slice.length
      const hasMore =
        end < rows.length || (opts.fullLastPageClaimsMore === true && slice.length === n)
      const cursor = slice.length > 0 || opts.noHasMore === true ? encode(end) : null
      const flagged = String(params['include_boundary_indicators']) === 'true'
      const sendsHasMore = opts.noHasMore !== true && (!BOUNDARY_FLAG_PATHS.has(path) || flagged)
      return {
        data: {
          [key]: slice,
          meta: {
            ...(sendsHasMore ? { has_more: hasMore } : {}),
            after_cursor: cursor,
            before_cursor: slice.length > 0 ? encode(start) : null,
          },
          links: {
            next:
              cursor === null
                ? null
                : `https://acme.zendesk.com/api/v2${path}?page%5Bafter%5D=${cursor}&page%5Bsize%5D=${n}`,
            prev: null,
          },
        },
      }
    }
    const perPage = Number(params['per_page'] ?? ZENDESK_MAX)
    const page = Number(params['page'] ?? 1)
    const start = (page - 1) * perPage
    return {
      data: {
        [key]: rows.slice(start, start + perPage),
        next_page: start + perPage < rows.length ? `page=${page + 1}` : null,
        previous_page: null,
        count: rows.length,
      },
    }
  })
  vi.spyOn(axios, 'create').mockReturnValue({ get } as never)
  return calls
}

function resourceKey(path: string): string {
  if (path.endsWith('/comments.json')) return 'comments'
  return path.slice(1, -'.json'.length)
}

const TICKET = '77'

interface Case {
  method: string
  path: string
  role?: string
  /** The endpoint documents `include_boundary_indicators`, so the list sends it. */
  boundaryFlag?: boolean
  make: (i: number) => Row
  id: (i: number) => string
  list: (
    adapter: ZendeskAdapter,
    params: QueryParams,
    credentials?: ReturnType<typeof creds>,
  ) => Promise<Array<{ id: string }>>
}

const CASES: Case[] = [
  {
    method: 'listTickets',
    path: '/tickets.json',
    make: (i) => ({ id: 1000 + i, subject: `T${i}`, status: 'open' }),
    id: (i) => String(1000 + i),
    list: (a, p, c = CREDS) => a.listTickets(c, p),
  },
  {
    method: 'listMessages',
    path: `/tickets/${TICKET}/comments.json`,
    make: (i) => ({
      id: 2000 + i,
      body: `c${i}`,
      author_id: 1,
      created_at: '2026-01-01T00:00:00Z',
    }),
    id: (i) => String(2000 + i),
    list: (a, p, c = CREDS) => a.listMessages(c, TICKET, p),
  },
  {
    method: 'listContacts',
    path: '/users.json',
    role: 'end-user',
    boundaryFlag: true,
    make: (i) => ({ id: 3000 + i, name: `E${i}`, role: 'end-user' }),
    id: (i) => String(3000 + i),
    list: (a, p, c = CREDS) => a.listContacts(c, p),
  },
  {
    method: 'listUsers',
    path: '/users.json',
    role: 'agent',
    boundaryFlag: true,
    make: (i) => ({ id: 4000 + i, name: `A${i}`, role: 'agent' }),
    id: (i) => String(4000 + i),
    list: (a, p, c = CREDS) => a.listUsers(c, p),
  },
  {
    method: 'listTags',
    path: '/tags.json',
    make: (i) => ({ name: `tag-${String(i).padStart(4, '0')}`, count: 1 }),
    id: (i) => `tag-${String(i).padStart(4, '0')}`,
    list: (a, p, c = CREDS) => a.listTags(c, p),
  },
  {
    method: 'listTeams',
    path: '/groups.json',
    boundaryFlag: true,
    make: (i) => ({ id: 5000 + i, name: `G${i}` }),
    id: (i) => String(5000 + i),
    list: (a, p, c = CREDS) => a.listTeams(c, p),
  },
  {
    method: 'listMacros',
    path: '/macros.json',
    make: (i) => ({ id: 6000 + i, title: `M${i}`, active: true }),
    id: (i) => String(6000 + i),
    list: (a, p, c = CREDS) => a.listMacros(c, p),
  },
]

/**
 * `n` rows of the case's collection. For `/users.json` the other role's rows
 * are interleaved, so a list that drops the `role` filter serves them.
 */
function worldFor(c: Case, n: number): Record<string, Row[]> {
  const rows = Array.from({ length: n }, (_, i) => c.make(i))
  if (c.path !== '/users.json') return { [c.path]: rows }
  const otherRole = c.role === 'agent' ? 'end-user' : 'agent'
  const mixed = rows.flatMap((r, i) => [r, { id: 9000 + i, name: `X${i}`, role: otherRole }])
  return { [c.path]: mixed }
}

const ids = (c: Case, n: number) => Array.from({ length: n }, (_, i) => c.id(i))

/** One page as the sync worker asks for it. */
async function workerPage(c: Case, adapter: ZendeskAdapter, page: number, limit: number) {
  const params = withPageSink({ page, limit })
  const items = await c.list(adapter, params)
  return { ids: items.map((x) => x.id), report: readUpstreamPage(params) }
}

/** Pages 1..`pages` as the sync worker asks for them. */
async function workerWalk(c: Case, adapter: ZendeskAdapter, pages: number, limit: number) {
  const served: string[] = []
  const hasMore: Array<boolean | undefined> = []
  const sizes: number[] = []
  for (let k = 1; k <= pages; k++) {
    const p = await workerPage(c, adapter, k, limit)
    served.push(...p.ids)
    hasMore.push(p.report?.hasMore)
    sizes.push(p.ids.length)
  }
  return { served, hasMore, sizes }
}

/** A client walking the API: `parseListQuery` then the router's `listPage`, until `meta.hasMore` is not true. */
async function apiWalk(c: Case, adapter: ZendeskAdapter, limit: string) {
  const served: string[] = []
  const hasMore: Array<boolean | null> = []
  const limits: number[] = []
  for (let n = 1; n < 50; n++) {
    const params = parseListQuery({ limit, page: String(n) }, adapter)
    const env = listPage(await c.list(adapter, params), params, 'zendesk')
    served.push(...env.data.map((x) => x.id))
    hasMore.push(env.meta.hasMore)
    limits.push(env.meta.limit)
    if (env.meta.hasMore !== true) break
  }
  return { served, hasMore, limits }
}

beforeEach(() => _resetCursorPager())
afterEach(() => vi.restoreAllMocks())

describe('capabilities', () => {
  it('declares the documented maximum of 100 records per page', () => {
    expect(new ZendeskAdapter(CFG).capabilities?.maxPageSize).toBe(ZENDESK_MAX)
  })
})

describe.each(CASES)('$method', (c) => {
  it('N = 2L + 1: pages 1..3 serve every row once, in order, hasMore [true, true, false]', async () => {
    const L = 5
    const calls = fakeZendesk(worldFor(c, 2 * L + 1))
    const walk = await workerWalk(c, new ZendeskAdapter(CFG), 3, L)
    expect(walk.served).toEqual(ids(c, 2 * L + 1))
    expect(walk.hasMore).toEqual([true, true, false])
    expect(walk.sizes).toEqual([L, L, 1])
    // One request per page, each at the cursor the previous page returned.
    expect(calls.map((x) => x.params['page[after]'])).toEqual([undefined, encode(L), encode(2 * L)])
  })

  it('page 2 sends page[size] and page[after] from page 1, and no offset parameter', async () => {
    const L = 5
    const calls = fakeZendesk(worldFor(c, 2 * L + 1))
    const adapter = new ZendeskAdapter(CFG)
    await workerPage(c, adapter, 1, L)
    await workerPage(c, adapter, 2, L)
    const page2 = calls[1]!
    expect(page2.path).toBe(c.path)
    expect(page2.params['page[size]']).toBe(L)
    expect(page2.params['page[after]']).toBe(encode(L))
    expect(page2.params).not.toHaveProperty('per_page')
    expect(page2.params).not.toHaveProperty('page')
    if (c.role) expect(page2.params['role']).toBe(c.role)
    // Sent only where it is documented; elsewhere has_more comes back unasked.
    if (c.boundaryFlag) expect(page2.params['include_boundary_indicators']).toBe('true')
    else expect(page2.params).not.toHaveProperty('include_boundary_indicators')
  })

  it('N = 2L: page 2 is the last, and page 3 is empty without a request', async () => {
    const L = 5
    const calls = fakeZendesk(worldFor(c, 2 * L))
    const walk = await workerWalk(c, new ZendeskAdapter(CFG), 3, L)
    expect(walk.served).toEqual(ids(c, 2 * L))
    expect(walk.hasMore).toEqual([true, false, false])
    expect(walk.sizes).toEqual([L, L, 0])
    expect(calls).toHaveLength(2)
  })

  it('has_more true on a full last page, then an empty page with null cursors: the walk ends there', async () => {
    const L = 5
    const calls = fakeZendesk(worldFor(c, 2 * L), { fullLastPageClaimsMore: true })
    const walk = await workerWalk(c, new ZendeskAdapter(CFG), 4, L)
    expect(walk.served).toEqual(ids(c, 2 * L))
    expect(walk.hasMore).toEqual([true, true, false, false])
    expect(walk.sizes).toEqual([L, L, 0, 0])
    // Page 4 is past the known end: no request.
    expect(calls).toHaveLength(3)

    _resetCursorPager()
    const api = await apiWalk(c, new ZendeskAdapter(CFG), String(L))
    expect(api.served).toEqual(ids(c, 2 * L))
    expect(api.hasMore).toEqual([true, true, false])
  })

  it('a response without has_more follows the cursor until an empty page, never stopping short', async () => {
    const L = 5
    const calls = fakeZendesk(worldFor(c, 2 * L + 1), { noHasMore: true })
    const walk = await workerWalk(c, new ZendeskAdapter(CFG), 5, L)
    expect(walk.served).toEqual(ids(c, 2 * L + 1))
    // One extra, empty request at the end; the empty page ends the walk even
    // though it still hands out a cursor.
    expect(walk.hasMore).toEqual([true, true, true, false, false])
    expect(walk.sizes).toEqual([L, L, 1, 0, 0])
    expect(calls).toHaveLength(4)
  })

  it('a limit above 100 is clamped to page[size]=100 and still serves every row', async () => {
    const calls = fakeZendesk(worldFor(c, 2 * ZENDESK_MAX + 1))
    const adapter = new ZendeskAdapter(CFG)
    const pages = [1, 2, 3]
    const served: string[] = []
    const hasMore: Array<boolean | undefined> = []
    const pageSizes: Array<number | undefined> = []
    for (const k of pages) {
      const p = await workerPage(c, adapter, k, 250)
      served.push(...p.ids)
      hasMore.push(p.report?.hasMore)
      pageSizes.push(p.report?.pageSize)
    }
    expect(served).toEqual(ids(c, 2 * ZENDESK_MAX + 1))
    expect(hasMore).toEqual([true, true, false])
    expect(calls.map((x) => x.params['page[size]'])).toEqual([100, 100, 100])
    // The page was asked for at 100, not the caller's 250: judged at 100.
    expect(pageSizes).toEqual([100, 100, 100])
  })

  it('the limit parseListQuery delivers: capped at the declared 100, every row served', async () => {
    const calls = fakeZendesk(worldFor(c, 2 * ZENDESK_MAX + 1))
    const adapter = new ZendeskAdapter(CFG)
    expect(parseListQuery({ limit: '250' }, adapter).limit).toBe(ZENDESK_MAX)
    const walk = await apiWalk(c, adapter, '250')
    expect(walk.served).toEqual(ids(c, 2 * ZENDESK_MAX + 1))
    expect(walk.hasMore).toEqual([true, true, false])
    expect(walk.limits).toEqual([100, 100, 100])
    expect(calls.map((x) => x.params['page[size]'])).toEqual([100, 100, 100])
  })

  it('API path: meta.hasMore is exact through parseListQuery + listPage', async () => {
    fakeZendesk(worldFor(c, 11))
    const odd = await apiWalk(c, new ZendeskAdapter(CFG), '5')
    expect(odd.served).toEqual(ids(c, 11))
    expect(odd.hasMore).toEqual([true, true, false])

    _resetCursorPager()
    vi.restoreAllMocks()
    fakeZendesk(worldFor(c, 10))
    // A full last page reads `null` from its length alone; has_more makes it false.
    const even = await apiWalk(c, new ZendeskAdapter(CFG), '5')
    expect(even.served).toEqual(ids(c, 10))
    expect(even.hasMore).toEqual([true, false])
  })

  it('two connections on one subdomain never share cursors', async () => {
    const calls = fakeZendesk(worldFor(c, 11))
    const adapter = new ZendeskAdapter(CFG)
    await c.list(adapter, withPageSink({ page: 1, limit: 5 }), creds('tok-a'))
    await c.list(adapter, withPageSink({ page: 2, limit: 5 }), creds('tok-b'))
    // `tok-b` holds no cursor for page 2 yet, so it walks from its own page 1.
    expect(calls.map((x) => x.params['page[after]'])).toEqual([undefined, undefined, encode(5)])
  })

  it('an explicit cursor is one request at that position, and reports has_more', async () => {
    const calls = fakeZendesk(worldFor(c, 11))
    const params = withPageSink({ limit: 5, cursor: encode(10) })
    const items = await c.list(new ZendeskAdapter(CFG), params)
    expect(items.map((x) => x.id)).toEqual([c.id(10)])
    expect(calls).toHaveLength(1)
    expect(calls[0]!.params['page[after]']).toBe(encode(10))
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('an explicit cursor mid-list serves the page there and reports more', async () => {
    const calls = fakeZendesk(worldFor(c, 11))
    const params = withPageSink({ limit: 5, cursor: encode(5) })
    const items = await c.list(new ZendeskAdapter(CFG), params)
    expect(items.map((x) => x.id)).toEqual(ids(c, 10).slice(5))
    expect(calls).toHaveLength(1)
    expect(calls[0]!.params['page[after]']).toBe(encode(5))
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
  })

  it('an empty cursor is no position: page 1, with no page[after] sent', async () => {
    const calls = fakeZendesk(worldFor(c, 11))
    const params = withPageSink({ limit: 5, cursor: '' })
    const items = await c.list(new ZendeskAdapter(CFG), params)
    expect(items.map((x) => x.id)).toEqual(ids(c, 5))
    expect(calls).toHaveLength(1)
    expect(calls[0]!.params).not.toHaveProperty('page[after]')
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
  })
})

describe('cursor chains are per filter', () => {
  it('a different page size starts its own chain', async () => {
    const tickets = CASES.find((x) => x.method === 'listTickets')!
    const calls = fakeZendesk(worldFor(tickets, 30))
    const adapter = new ZendeskAdapter(CFG)
    await tickets.list(adapter, withPageSink({ page: 1, limit: 5 }))
    const p2 = await tickets.list(adapter, withPageSink({ page: 2, limit: 7 }))
    // Page 2 at 7 is rows 7..13, not the rows after a page of 5.
    expect(p2.map((x) => x.id)).toEqual(ids(tickets, 14).slice(7))
    expect(calls.map((x) => `${x.params['page[size]']}:${x.params['page[after]'] ?? '-'}`)).toEqual(
      ['5:-', '7:-', `7:${encode(7)}`],
    )
  })

  it('contacts (end-user) and users (agent) never share a chain', async () => {
    const contacts = CASES.find((x) => x.method === 'listContacts')!
    const users = CASES.find((x) => x.method === 'listUsers')!
    const world = {
      '/users.json': [
        ...Array.from({ length: 11 }, (_, i) => contacts.make(i)),
        ...Array.from({ length: 3 }, (_, i) => users.make(i)),
      ],
    }
    const calls = fakeZendesk(world)
    const adapter = new ZendeskAdapter(CFG)
    await contacts.list(adapter, withPageSink({ page: 1, limit: 5 }))
    const agents = await users.list(adapter, withPageSink({ page: 2, limit: 5 }))
    // page 2 of agents walks the agent chain from its own page 1 (3 rows: no page 2).
    expect(agents).toEqual([])
    expect(calls.map((x) => `${x.params['role']}:${x.params['page[after]'] ?? '-'}`)).toEqual([
      'end-user:-',
      'agent:-',
    ])
  })

  it('comments of two tickets never share a chain', async () => {
    const world = {
      '/tickets/1/comments.json': Array.from({ length: 11 }, (_, i) => ({ id: 100 + i })),
      '/tickets/2/comments.json': Array.from({ length: 11 }, (_, i) => ({ id: 200 + i })),
    }
    const calls = fakeZendesk(world)
    const adapter = new ZendeskAdapter(CFG)
    await adapter.listMessages(CREDS, '1', withPageSink({ page: 1, limit: 5 }))
    const p2 = await adapter.listMessages(CREDS, '2', withPageSink({ page: 2, limit: 5 }))
    expect(p2.map((m) => m.id)).toEqual(['205', '206', '207', '208', '209'])
    expect(p2.every((m) => m.ticketId === '2')).toBe(true)
    expect(calls.map((x) => `${x.path}:${x.params['page[after]'] ?? '-'}`)).toEqual([
      '/tickets/1/comments.json:-',
      '/tickets/2/comments.json:-',
      `/tickets/2/comments.json:${encode(5)}`,
    ])
  })
})

describe('pager scope', () => {
  const tickets = () => CASES.find((x) => x.method === 'listTickets')!

  it('one connection keeps its cursors across an access-token refresh', async () => {
    const c = tickets()
    const calls = fakeZendesk(worldFor(c, 11))
    const adapter = new ZendeskAdapter(CFG)
    const before = { ...creds('access-1'), refreshToken: 'refresh-x' }
    const after = { ...creds('access-2'), refreshToken: 'refresh-x' }
    await adapter.listTickets(before, withPageSink({ page: 1, limit: 5 }))
    const p2 = await adapter.listTickets(after, withPageSink({ page: 2, limit: 5 }))
    expect(p2.map((x) => x.id)).toEqual(ids(c, 10).slice(5))
    // Page 2 starts at the cursor page 1 returned: no re-walk.
    expect(calls.map((x) => x.params['page[after]'])).toEqual([undefined, encode(5)])
  })

  it('one token on two subdomains is two connections', async () => {
    const c = tickets()
    const calls = fakeZendesk(worldFor(c, 11))
    const adapter = new ZendeskAdapter(CFG)
    await adapter.listTickets(creds('tok-a', 'acme'), withPageSink({ page: 1, limit: 5 }))
    await adapter.listTickets(creds('tok-a', 'globex'), withPageSink({ page: 2, limit: 5 }))
    expect(calls.map((x) => x.params['page[after]'])).toEqual([undefined, undefined, encode(5)])
  })
})

describe('page size', () => {
  const tickets = () => CASES.find((x) => x.method === 'listTickets')!

  it.each([
    { label: 'no limit', limit: undefined, sent: 100 },
    { label: 'a zero limit', limit: 0, sent: 100 },
    { label: 'a fractional limit', limit: 5.7, sent: 5 },
  ])('$label sends page[size]=$sent', async ({ limit, sent }) => {
    const calls = fakeZendesk(worldFor(tickets(), 3))
    const params = withPageSink(limit === undefined ? { page: 1 } : { page: 1, limit })
    await tickets().list(new ZendeskAdapter(CFG), params)
    expect(calls.map((x) => x.params['page[size]'])).toEqual([sent])
  })
})
