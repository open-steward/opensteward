/**
 * Taiga list paging.
 *
 * Taiga documents its paging at https://docs.taiga.io/api.html#_pagination:
 *
 *   "By default the API will always return paginated results and includes the
 *    following headers in the response:"
 *   "x-pagination-next: next results"
 *   "Disabling pagination can be accomplished by setting an extra http header:
 *    x-disable-pagination: True"
 *
 * The parameter names and the ceiling are in taiga-back's PaginationMixin
 * (taiga/base/api/pagination.py) and REST settings (settings/common.py):
 * `page_kwarg = 'page'`, `"PAGINATE_BY": 30`, `"PAGINATE_BY_PARAM": "page_size"`,
 * `"MAX_PAGINATE_BY": 1000`, the size read with `cutoff=self.max_paginate_by`,
 * and a page past the last one raised as Http404 ("Invalid page").
 *
 * The fake below honours only those: `page`, `page_size` (default 30, cut off
 * at 1000), the `x-pagination-next` / `x-pagination-count` headers, 404 past
 * the last page, and `x-disable-pagination` returning everything.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { listPage, parseListQuery, readUpstreamPage, withPageSink } from '@opensteward/shared'
import { TaigaAdapter } from '../../../../../../src/verticals/projects/adapters/taiga/index'

let tokenSeq = 0
/** A fresh connection per test, so no row-pager memo is shared between tests. */
const creds = () => ({ accessToken: `taiga-test-${++tokenSeq}-${Date.now()}` })

type Row = Record<string, unknown>
interface Call {
  path: string
  params: Record<string, unknown>
  headers: Record<string, unknown>
  /** The instance and token the request went to, from the client's axios config. */
  baseURL: string
  auth: string
}

function notFound(): never {
  throw Object.assign(new Error('Request failed with status code 404'), {
    isAxiosError: true,
    response: { status: 404, data: { _error_message: 'Invalid page' } },
  })
}

/**
 * A fake Taiga serving `collections[path]` with only the documented paging.
 * A path in `gone` answers 404 on every page, as a bad project or base URL does.
 */
function fakeTaiga(
  collections: Record<string, Row[]>,
  single: Record<string, Row> = {},
  gone: string[] = [],
) {
  const calls: Call[] = []
  const get = vi.fn(
    async (
      conn: { baseURL: string; auth: string },
      path: string,
      cfg?: { params?: Record<string, unknown>; headers?: Record<string, unknown> },
    ) => {
      const params = cfg?.params ?? {}
      const headers = cfg?.headers ?? {}
      calls.push({ path, params, headers, ...conn })
      if (gone.includes(path)) notFound()
      if (path in single) return { data: single[path], headers: {} }
      // `path?project=N` serves one project's rows; plain `path` serves any.
      const rows = collections[`${path}?project=${String(params['project'])}`] ?? collections[path]
      if (!rows) throw new Error(`unexpected path ${path}`)
      if ('x-disable-pagination' in headers) return { data: rows, headers: {} }
      const asked = Number(params['page_size'])
      const size = Number.isInteger(asked) && asked > 0 ? Math.min(asked, 1000) : 30
      const page = params['page'] === undefined ? 1 : Number(params['page'])
      const start = (page - 1) * size
      if (page > 1 && start >= rows.length) notFound()
      const out: Record<string, string> = { 'x-pagination-count': String(rows.length) }
      if (start + size < rows.length) {
        out['x-pagination-next'] = `https://api.taiga.io/api/v1${path}?page=${page + 1}`
      }
      return { data: rows.slice(start, start + size), headers: out }
    },
  )
  vi.spyOn(axios, 'create').mockImplementation(((cfg: {
    baseURL: string
    headers: Record<string, string>
  }) => {
    const conn = { baseURL: cfg.baseURL, auth: cfg.headers['Authorization'] ?? '' }
    return { get: (path: string, c?: never) => get(conn, path, c) }
  }) as never)
  return { calls, get }
}

const ids = (n: number, from = 1) => Array.from({ length: n }, (_, i) => ({ id: from + i }))
const adapter = () => new TaigaAdapter()

afterEach(() => vi.restoreAllMocks())

describe('taiga listProjects paging (?page, page_size, x-pagination-next)', () => {
  const L = 3
  const N = 2 * L + 1

  it('walks pages 1..3 serving every project once, in order, with hasMore exact', async () => {
    fakeTaiga({ '/projects': ids(N) })
    const c = creds()
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (let k = 1; k <= 3; k++) {
      const params = withPageSink({ page: k, limit: L })
      seen.push(...(await adapter().listProjects(c, params)).map((p) => p.id))
      more.push(readUpstreamPage(params)?.hasMore)
      expect(readUpstreamPage(params)?.totalCount).toBe(N)
    }
    expect(seen).toEqual(ids(N).map((r) => String(r.id)))
    expect(more).toEqual([true, true, false])
  })

  it('the page-2 request carries page=2 and the caller page_size', async () => {
    const { calls } = fakeTaiga({ '/projects': ids(N) })
    await adapter().listProjects(creds(), withPageSink({ page: 2, limit: L }))
    expect(calls).toHaveLength(1)
    expect(calls[0]!.params).toMatchObject({ page: 2, page_size: L })
  })

  it('a limit above the 1000 cutoff is clamped and reported as the page size', async () => {
    const { calls } = fakeTaiga({ '/projects': ids(1200) })
    const params = withPageSink({ page: 1, limit: 1500 })
    const got = await adapter().listProjects(creds(), params)
    expect(calls[0]!.params['page_size']).toBe(1000)
    expect(got).toHaveLength(1000)
    expect(readUpstreamPage(params)).toMatchObject({ pageSize: 1000, hasMore: true })
  })

  it('a collection ending exactly on a page boundary reports hasMore=false on its last page', async () => {
    // 2L rows: page 2 is full, so only x-pagination-next can say it is the last.
    fakeTaiga({ '/projects': ids(2 * L) })
    const c = creds()
    const more: Array<boolean | undefined> = []
    for (let k = 1; k <= 2; k++) {
      const params = withPageSink({ page: k, limit: L })
      expect(await adapter().listProjects(c, params)).toHaveLength(L)
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(more).toEqual([true, false])
  })

  it('reports no page size when the limit was sent as asked', async () => {
    fakeTaiga({ '/projects': ids(N) })
    const params = withPageSink({ page: 1, limit: L })
    await adapter().listProjects(creds(), params)
    expect(readUpstreamPage(params)?.pageSize).toBeUndefined()
  })

  it('a 404 on page 1 is an error, not an empty list', async () => {
    fakeTaiga({}, {}, ['/projects'])
    await expect(
      adapter().listProjects(creds(), withPageSink({ page: 1, limit: L })),
    ).rejects.toMatchObject({ response: { status: 404 } })
  })

  it('a page past the end is empty, not a 404', async () => {
    fakeTaiga({ '/projects': ids(N) })
    const params = withPageSink({ page: 9, limit: L })
    expect(await adapter().listProjects(creds(), params)).toEqual([])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('API path: parseListQuery + listPage page through with an exact end', async () => {
    fakeTaiga({ '/projects': ids(N) })
    const c = creds()
    const seen: string[] = []
    const more: Array<boolean | null> = []
    for (let k = 1; k <= 3; k++) {
      const q = parseListQuery({ page: String(k), limit: String(L) })
      const env = listPage(await adapter().listProjects(c, q), q, 'taiga')
      seen.push(...env.data.map((p) => p.id))
      more.push(env.meta.hasMore)
    }
    expect(seen).toEqual(ids(N).map((r) => String(r.id)))
    expect(more).toEqual([true, true, false])
  })
})

describe('taiga listTasks paging (user stories, then tasks, then issues)', () => {
  const L = 3
  // 4 + 2 + 1 = 7 = 2L + 1 rows across the three endpoints.
  const stories = ids(4, 100)
  const tasks = ids(2, 200)
  const issues = ids(1, 300)
  const all = [...stories, ...tasks, ...issues].map((r) => String(r.id))
  const collections = () => ({
    '/userstories': stories,
    '/tasks': tasks,
    '/issues': issues,
  })

  it('walks pages 1..3 serving every row once, in order, with hasMore exact', async () => {
    fakeTaiga(collections())
    const c = creds()
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (let k = 1; k <= 3; k++) {
      const params = withPageSink({ page: k, limit: L })
      seen.push(...(await adapter().listTasks(c, '7', params)).map((t) => t.id))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(all)
    expect(more).toEqual([true, true, false])
  })

  it('follows x-pagination-next with page=2 at the caller page_size', async () => {
    const { calls } = fakeTaiga(collections())
    const c = creds()
    for (let k = 1; k <= 3; k++)
      await adapter().listTasks(c, '7', withPageSink({ page: k, limit: L }))
    expect(calls.map((x) => [x.path, x.params['page'], x.params['page_size']])).toEqual([
      ['/userstories', 1, L],
      ['/userstories', 2, L],
      ['/tasks', 1, L],
      ['/issues', 1, L],
    ])
    for (const x of calls) expect(x.params['project']).toBe('7')
  })

  it('a direct page 2 walks to its rows and serves the right ones', async () => {
    fakeTaiga(collections())
    const params = withPageSink({ page: 2, limit: L })
    const got = (await adapter().listTasks(creds(), '7', params)).map((t) => t.id)
    expect(got).toEqual(all.slice(L, 2 * L))
    expect(readUpstreamPage(params)).toMatchObject({ hasMore: true, pagedLocally: true })
  })

  it('a limit above the 1000 cutoff sends page_size=1000', async () => {
    const { calls } = fakeTaiga(collections())
    const params = withPageSink({ page: 1, limit: 1500 })
    const got = await adapter().listTasks(creds(), '7', params)
    expect(got.map((t) => t.id)).toEqual(all)
    for (const x of calls) expect(x.params['page_size']).toBe(1000)
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it("another connection (different token) walks on its own, not from the first one's marks", async () => {
    const { calls } = fakeTaiga(collections())
    const a = creds()
    const b = creds()
    await adapter().listTasks(a, '7', withPageSink({ page: 1, limit: L }))
    const before = calls.length
    const params = withPageSink({ page: 2, limit: L })
    const got = (await adapter().listTasks(b, '7', params)).map((t) => t.id)
    expect(got).toEqual(all.slice(L, 2 * L))
    const mine = calls.slice(before)
    // B fetches from the head of the chain itself, under its own token.
    expect(mine[0]).toMatchObject({ path: '/userstories', params: { page: 1 } })
    for (const x of mine) expect(x.auth).toBe(`Bearer ${b.accessToken}`)
  })

  it('the same token on another Taiga instance walks on its own', async () => {
    const { calls } = fakeTaiga(collections())
    const token = creds().accessToken
    const a = { accessToken: token, extra: { baseUrl: 'https://taiga-a.example/api/v1' } }
    const b = { accessToken: token, extra: { baseUrl: 'https://taiga-b.example/api/v1' } }
    await adapter().listTasks(a, '7', withPageSink({ page: 1, limit: L }))
    const before = calls.length
    await adapter().listTasks(b, '7', withPageSink({ page: 2, limit: L }))
    const mine = calls.slice(before)
    expect(mine[0]).toMatchObject({ path: '/userstories', params: { page: 1 } })
    for (const x of mine) expect(x.baseURL).toBe('https://taiga-b.example/api/v1')
  })

  it("another project walks on its own and never serves the first project's rows", async () => {
    const other = ids(4, 800)
    const { calls } = fakeTaiga({
      ...collections(),
      '/userstories?project=8': other,
      '/tasks?project=8': [],
      '/issues?project=8': [],
    })
    const c = creds()
    await adapter().listTasks(c, '7', withPageSink({ page: 1, limit: L }))
    const before = calls.length
    const params = withPageSink({ page: 2, limit: L })
    const got = (await adapter().listTasks(c, '8', params)).map((t) => t.id)
    expect(got).toEqual(other.slice(L).map((r) => String(r.id)))
    const mine = calls.slice(before)
    expect(mine[0]).toMatchObject({ path: '/userstories', params: { page: 1, project: '8' } })
    for (const x of mine) expect(x.params['project']).toBe('8')
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('a walk at another limit sends that page_size and serves the right rows', async () => {
    // 7 stories: at page_size 3 the second upstream page starts at row 3, at
    // page_size 4 it starts at row 4, so a mark from one is wrong for the other.
    const seven = ids(7, 100)
    const every = [...seven, ...tasks, ...issues].map((r) => String(r.id))
    const { calls } = fakeTaiga({ '/userstories': seven, '/tasks': tasks, '/issues': issues })
    const c = creds()
    for (let k = 1; k <= 2; k++)
      await adapter().listTasks(c, '7', withPageSink({ page: k, limit: 3 }))
    const before = calls.length
    const params = withPageSink({ page: 2, limit: 4 })
    const got = (await adapter().listTasks(c, '7', params)).map((t) => t.id)
    expect(got).toEqual(every.slice(4, 8))
    for (const x of calls.slice(before)) expect(x.params['page_size']).toBe(4)
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
  })

  it('with no limit, serves pages of the 100-row default', async () => {
    const many = ids(120, 1000)
    const { calls } = fakeTaiga({ '/userstories': many, '/tasks': [], '/issues': [] })
    const params = withPageSink({ page: 1 })
    const got = await adapter().listTasks(creds(), '7', params)
    expect(got).toHaveLength(100)
    expect(calls[0]!.params['page_size']).toBe(100)
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
  })

  it('API path: parseListQuery + listPage page through with an exact end', async () => {
    fakeTaiga(collections())
    const c = creds()
    const seen: string[] = []
    const more: Array<boolean | null> = []
    for (let k = 1; k <= 3; k++) {
      const q = parseListQuery({ page: String(k), limit: String(L) })
      const env = listPage(await adapter().listTasks(c, '7', q), q, 'taiga')
      seen.push(...env.data.map((t) => t.id))
      more.push(env.meta.hasMore)
    }
    expect(seen).toEqual(all)
    expect(more).toEqual([true, true, false])
  })
})

describe('taiga whole-collection lists are paged locally', () => {
  const L = 2

  it('listComments: every history comment once over pages 1..3', async () => {
    const entries = [
      { id: 'h1', comment: 'one' },
      { id: 'h2', comment: '' },
      { id: 'h3', comment: 'three' },
      { id: 'h4', comment: 'four' },
      { id: 'h5', comment: 'five' },
      { id: 'h6', comment: 'six' },
    ]
    const { calls } = fakeTaiga({ '/history/userstory/42': entries })
    const c = creds()
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (let k = 1; k <= 3; k++) {
      const params = withPageSink({ page: k, limit: L })
      seen.push(...(await adapter().listComments(c, '42', params)).map((x) => x.id))
      more.push(readUpstreamPage(params)?.hasMore)
      expect(readUpstreamPage(params)).toMatchObject({ totalCount: 5, pagedLocally: true })
    }
    expect(seen).toEqual(['h1', 'h3', 'h4', 'h5', 'h6'])
    expect(more).toEqual([true, true, false])
    for (const x of calls) expect(x.headers['x-disable-pagination']).toBe('True')
  })

  it('listTags: every tag of the project once over pages 1..3', async () => {
    fakeTaiga(
      {},
      { '/projects/9': { id: 9, tags_colors: { a: '#1', b: null, c: '#3', d: '#4', e: null } } },
    )
    const c = creds()
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (let k = 1; k <= 3; k++) {
      const params = withPageSink({ page: k, limit: L })
      seen.push(...(await adapter().listTags(c, '9', params)).map((t) => t.id))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(['9:a', '9:b', '9:c', '9:d', '9:e'])
    expect(more).toEqual([true, true, false])
  })

  it('listWorkspaces: the one workspace is served on page 1 only', async () => {
    fakeTaiga({}, { '/users/me': { id: 5, username: 'me', full_name_display: 'Me' } })
    const c = creds()
    const p1 = withPageSink({ page: 1, limit: 1 })
    expect((await adapter().listWorkspaces(c, p1)).map((w) => w.id)).toEqual(['5'])
    expect(readUpstreamPage(p1)).toMatchObject({ hasMore: false, totalCount: 1 })
    const p2 = withPageSink({ page: 2, limit: 1 })
    expect(await adapter().listWorkspaces(c, p2)).toEqual([])
  })

  it('API path: listComments page 2 through parseListQuery + listPage', async () => {
    fakeTaiga({ '/history/task/8': ids(5).map((r) => ({ id: `c${r.id}`, comment: 'x' })) })
    const q = parseListQuery({ page: '2', limit: String(L) })
    const env = listPage(await adapter().listComments(creds(), 'task:8', q), q, 'taiga')
    expect(env.data.map((x) => x.id)).toEqual(['c3', 'c4'])
    expect(env.meta).toMatchObject({ page: 2, hasMore: true, totalCount: 5 })
  })
})
