/**
 * Microsoft To Do list paging (Microsoft Graph).
 *
 * Graph collections take `$top` and answer with an absolute `@odata.nextLink`
 * while more rows remain. The paging guide
 * (https://learn.microsoft.com/en-us/graph/paging):
 *
 *   "Use the entire URL in the `@odata.nextLink` property in a GET request to
 *   retrieve the next page of results. Depending on the API that the query is
 *   being performed against, the `@odata.nextLink` URL value contains either a
 *   `$skiptoken` or a `$skip` query parameter. Any other query parameters
 *   that were present in the original request are also encoded in this URL."
 *
 *   "A page of results might contain zero or more results."
 *
 *   "Different APIs might behave differently if you specify a page size (via
 *   the `$top` query parameter) that exceeds the maximum page size for that
 *   API. The requested page size might be ignored, it might default to the
 *   maximum page size for that API, or Microsoft Graph might return an error."
 *
 * So one upstream page is not reliably one caller page. Before this, every
 * list sent `$top=limit` and ignored `page`, answering page 2 with page 1.
 *
 * The fake honours only `$top` on the first request and the opaque nextLink
 * after it; a nextLink request carries no params of its own.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import axios from 'axios'
import {
  _resetCursorPager,
  listPage,
  parseListQuery,
  readUpstreamPage,
  withPageSink,
  type QueryParams,
} from '@opensteward/shared'
import { MicrosoftTodoAdapter } from '../../../../../../src/verticals/projects/adapters/microsoft-todo/index'

const BASE = 'https://graph.microsoft.com/v1.0'
const CREDS = { accessToken: 'graph-token', refreshToken: 'graph-refresh' }

interface Call {
  url: string
  params: Record<string, unknown> | undefined
}

interface FakeOptions {
  /** Rows per collection path. */
  rows: Record<string, Array<Record<string, unknown>>>
  /** The server's maximum page size; a larger `$top` is served at this size. */
  maxTop?: number
  /** Default page size when no `$top` is sent. */
  defaultTop?: number
  /** Rows per access token, overriding `rows` for that connection. */
  rowsByToken?: Record<string, Record<string, Array<Record<string, unknown>>>>
  /** HTTP statuses thrown by the first requests, in order, before any is served. */
  failures?: number[]
}

const ME = { id: 'user-1', displayName: 'Ada Lovelace', mail: 'ada@example.com' }

function fakeGraph(opts: FakeOptions) {
  const calls: Call[] = []
  const failures = [...(opts.failures ?? [])]
  // Which token minted each nextLink: a skiptoken is only valid for its own user.
  const owners = new Map<string, Set<string>>()
  vi.spyOn(axios, 'create').mockImplementation(((config: { headers?: Record<string, string> }) => ({
    get: vi.fn(async (url: string, cfg?: { params?: Record<string, unknown> }) => {
      calls.push({ url, params: cfg?.params ? { ...cfg.params } : undefined })
      const status = failures.shift()
      if (status !== undefined)
        throw Object.assign(new Error(`HTTP ${status}`), { response: { status } })
      const token = String(config.headers?.Authorization ?? '').replace(/^Bearer /, '')
      const table = opts.rowsByToken?.[token] ?? opts.rows
      if (url === '/me') return { data: ME }
      let path: string
      let skip = 0
      let size: number
      if (url.startsWith(BASE)) {
        // A nextLink: every param is encoded in the URL; nothing else is read.
        if (cfg?.params !== undefined) throw new Error('fake graph: nextLink request sent params')
        if (!owners.get(url)?.has(token))
          throw new Error('fake graph: nextLink replayed by another connection')
        const u = new URL(url)
        path = u.pathname.replace('/v1.0', '')
        skip = Number(u.searchParams.get('$skip'))
        size = Number(u.searchParams.get('$top'))
      } else {
        path = url
        const top = cfg?.params?.['$top']
        const asked = top == null ? (opts.defaultTop ?? 10) : Number(top)
        size = Math.min(asked, opts.maxTop ?? 1000)
      }
      const all = table[path]
      if (!all) throw new Error(`fake graph: no route for ${path}`)
      const value = all.slice(skip, skip + size)
      const end = skip + value.length
      const next = end < all.length ? `${BASE}${path}?$top=${size}&$skip=${end}` : undefined
      if (next) owners.set(next, (owners.get(next) ?? new Set()).add(token))
      return { data: { value, ...(next ? { '@odata.nextLink': next } : {}) } }
    }),
  })) as never)
  return calls
}

const list = (i: number) => ({
  id: `list-${i}`,
  displayName: `List ${i}`,
  wellknownListName: 'none',
})
const task = (i: number) => ({ id: `task-${i}`, title: `Task ${i}`, status: 'notStarted' })
const category = (i: number) => ({ id: `cat-${i}`, displayName: `Category ${i}`, color: 'preset0' })

const adapter = () =>
  new MicrosoftTodoAdapter({ clientId: 'cid', clientSecret: 'secret', redirectUri: 'https://x/cb' })

/** Pages 1..3 at `limit`, returning ids and the hasMore each page reported. */
async function walk(
  limit: number,
  run: (params: QueryParams) => Promise<Array<{ id: string }>>,
): Promise<{ ids: string[]; hasMore: Array<boolean | undefined>; sizes: number[] }> {
  const ids: string[] = []
  const hasMore: Array<boolean | undefined> = []
  const sizes: number[] = []
  for (const page of [1, 2, 3]) {
    const params = withPageSink({ page, limit })
    const rows = await run(params)
    ids.push(...rows.map((r) => r.id))
    sizes.push(rows.length)
    hasMore.push(readUpstreamPage(params)?.hasMore)
  }
  return { ids, hasMore, sizes }
}

beforeEach(() => _resetCursorPager())
afterEach(() => vi.restoreAllMocks())

const CASES: Array<{
  name: string
  path: string
  row: (i: number) => Record<string, unknown>
  id: (i: number) => string
  run: (p: QueryParams) => Promise<Array<{ id: string }>>
}> = [
  {
    name: 'listProjects (GET /me/todo/lists)',
    path: '/me/todo/lists',
    row: list,
    id: (i: number) => `list-${i}`,
    run: (p: QueryParams) => adapter().listProjects(CREDS, p),
  },
  {
    name: 'listTasks (GET /me/todo/lists/{id}/tasks)',
    path: '/me/todo/lists/list-x/tasks',
    row: task,
    id: (i: number) => `list-x:task-${i}`,
    run: (p: QueryParams) => adapter().listTasks(CREDS, 'list-x', p),
  },
  {
    name: 'listTags (GET /me/outlook/masterCategories)',
    path: '/me/outlook/masterCategories',
    row: category,
    id: (i: number) => `cat-${i}`,
    run: (p: QueryParams) => adapter().listTags(CREDS, 'me', p),
  },
]

for (const c of CASES) {
  describe(`Microsoft To Do ${c.name} pages by @odata.nextLink`, () => {
    const L = 3
    const N = 2 * L + 1
    const rows = () => ({ [c.path]: Array.from({ length: N }, (_, i) => c.row(i)) })

    it('serves every row once, in order, with hasMore exact', async () => {
      fakeGraph({ rows: rows() })
      const res = await walk(L, c.run)
      expect(res.ids).toEqual(Array.from({ length: N }, (_, i) => c.id(i)))
      expect(res.sizes).toEqual([L, L, 1])
      expect(res.hasMore).toEqual([true, true, false])
    })

    it('the page-2 request is the @odata.nextLink from page 1', async () => {
      const calls = fakeGraph({ rows: rows() })
      const got = await c.run(withPageSink({ page: 2, limit: L }))
      expect(got.map((r) => r.id)).toEqual([c.id(3), c.id(4), c.id(5)])
      expect(calls[0]).toEqual({ url: c.path, params: { $top: L } })
      expect(calls[1]).toEqual({ url: `${BASE}${c.path}?$top=${L}&$skip=${L}`, params: undefined })
    })

    it('a $top above the server maximum still fills the page from the next link', async () => {
      // The guide: an oversized `$top` "might default to the maximum page size".
      fakeGraph({ rows: { [c.path]: Array.from({ length: 17 }, (_, i) => c.row(i)) }, maxTop: 5 })
      const res = await walk(8, c.run)
      expect(res.ids).toEqual(Array.from({ length: 17 }, (_, i) => c.id(i)))
      expect(res.sizes).toEqual([8, 8, 1])
      expect(res.hasMore).toEqual([true, true, false])
    })

    it('API path: parseListQuery → list → listPage serves page 3', async () => {
      fakeGraph({ rows: rows() })
      const params = parseListQuery({ limit: String(L), page: '3' })
      const env = listPage(await c.run(params), params, 'microsoft-todo')
      expect(env.data.map((r) => r.id)).toEqual([c.id(6)])
      expect(env.meta.hasMore).toBe(false)
    })
  })
}

describe('Microsoft To Do listWorkspaces and listUsers (GET /me) page locally', () => {
  it('serves the single /me row on page 1 and nothing after it', async () => {
    fakeGraph({ rows: {} })
    for (const run of [
      (p: QueryParams) => adapter().listWorkspaces(CREDS, p),
      (p: QueryParams) => adapter().listUsers(CREDS, 'me', p),
    ]) {
      const res = await walk(1, run)
      expect(res.ids).toEqual(['user-1'])
      expect(res.sizes).toEqual([1, 0, 0])
      expect(res.hasMore).toEqual([false, false, false])
    }
  })

  it('API path: page 2 of workspaces is empty', async () => {
    fakeGraph({ rows: {} })
    const params = parseListQuery({ limit: '1', page: '2' })
    const env = listPage(await adapter().listWorkspaces(CREDS, params), params, 'microsoft-todo')
    expect(env.data).toEqual([])
    expect(env.meta.hasMore).toBe(false)
  })
})

describe('Microsoft To Do pager keys isolate connection, collection and $top', () => {
  const L = 3
  const rowsOf = (prefix: string, n = 2 * L + 1) =>
    Array.from({ length: n }, (_, i) => ({
      id: `${prefix}-${i}`,
      displayName: `${prefix} ${i}`,
      wellknownListName: 'none',
    }))

  it("a second connection never sees the first connection's rows", async () => {
    const OTHER = { accessToken: 'graph-token-2', refreshToken: 'graph-refresh-2' }
    fakeGraph({
      rows: {},
      rowsByToken: {
        [CREDS.accessToken]: { '/me/todo/lists': rowsOf('a') },
        [OTHER.accessToken]: { '/me/todo/lists': rowsOf('b') },
      },
    })
    const a1 = await adapter().listProjects(CREDS, withPageSink({ page: 1, limit: L }))
    const b2 = await adapter().listProjects(OTHER, withPageSink({ page: 2, limit: L }))
    const a2 = await adapter().listProjects(CREDS, withPageSink({ page: 2, limit: L }))
    expect(a1.map((r) => r.id)).toEqual(['a-0', 'a-1', 'a-2'])
    expect(a2.map((r) => r.id)).toEqual(['a-3', 'a-4', 'a-5'])
    expect(b2.map((r) => r.id)).toEqual(['b-3', 'b-4', 'b-5'])
  })

  it('tasks of one list never serve another list, nor lists serve categories', async () => {
    const tasksOf = (prefix: string) =>
      Array.from({ length: 2 * L + 1 }, (_, i) => ({
        id: `${prefix}-${i}`,
        title: `T ${i}`,
        status: 'notStarted',
      }))
    fakeGraph({
      rows: {
        '/me/todo/lists/list-a/tasks': tasksOf('ta'),
        '/me/todo/lists/list-b/tasks': tasksOf('tb'),
        '/me/todo/lists': rowsOf('l'),
        '/me/outlook/masterCategories': Array.from({ length: 2 * L + 1 }, (_, i) => category(i)),
      },
    })
    await adapter().listTasks(CREDS, 'list-a', withPageSink({ page: 1, limit: L }))
    const b2 = await adapter().listTasks(CREDS, 'list-b', withPageSink({ page: 2, limit: L }))
    expect(b2.map((r) => r.id)).toEqual(['list-b:tb-3', 'list-b:tb-4', 'list-b:tb-5'])
    await adapter().listProjects(CREDS, withPageSink({ page: 1, limit: L }))
    const tags2 = await adapter().listTags(CREDS, 'me', withPageSink({ page: 2, limit: L }))
    expect(tags2.map((r) => r.id)).toEqual(['cat-3', 'cat-4', 'cat-5'])
  })

  it('a walk at a new page size mints its own chain at that $top', async () => {
    const calls = fakeGraph({ rows: { '/me/todo/lists': rowsOf('l', 20) } })
    await adapter().listProjects(CREDS, withPageSink({ page: 2, limit: 3 }))
    const before = calls.length
    const got = await adapter().listProjects(CREDS, withPageSink({ page: 2, limit: 5 }))
    expect(got.map((r) => r.id)).toEqual(['l-5', 'l-6', 'l-7', 'l-8', 'l-9'])
    expect(calls[before]).toEqual({ url: '/me/todo/lists', params: { $top: 5 } })
  })
})

describe('Microsoft To Do list defaults and retries', () => {
  it('a call with no limit sends $top=100 and serves a 100-row page', async () => {
    const calls = fakeGraph({
      rows: { '/me/todo/lists': Array.from({ length: 150 }, (_, i) => list(i)) },
    })
    const params = withPageSink({})
    const got = await adapter().listProjects(CREDS, params)
    expect(calls[0]).toEqual({ url: '/me/todo/lists', params: { $top: 100 } })
    expect(got).toHaveLength(100)
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
  })

  it('a 503 on a page fetch is retried, not surfaced', async () => {
    vi.useFakeTimers()
    try {
      const calls = fakeGraph({
        rows: { '/me/todo/lists': Array.from({ length: 4 }, (_, i) => list(i)) },
        failures: [503],
      })
      const pending = adapter().listProjects(CREDS, withPageSink({ page: 1, limit: 3 }))
      await vi.advanceTimersByTimeAsync(1_000)
      const got = await pending
      expect(got.map((r) => r.id)).toEqual(['list-0', 'list-1', 'list-2'])
      // The failed first request is replayed as is, then served.
      expect(calls.slice(0, 2)).toEqual([
        { url: '/me/todo/lists', params: { $top: 3 } },
        { url: '/me/todo/lists', params: { $top: 3 } },
      ])
    } finally {
      vi.useRealTimers()
    }
  })
})
