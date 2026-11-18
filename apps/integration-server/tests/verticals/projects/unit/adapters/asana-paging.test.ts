/**
 * Asana pages every list by an opaque `offset` token. From the reference
 * pages of each endpoint (getprojects, getprojectsforworkspace,
 * gettasksforproject, getstoriesfortask, gettagsforworkspace, getworkspaces):
 *
 *   "If more results exist, then the response will contain a next_page
 *    attribute, which will include an offset, a relative path attribute, and
 *    a full uri attribute."
 *   "The number of objects to return per page. The value must be between 1
 *    and 100."
 *
 * The adapter only ever forwarded `offset` from `params.cursor`, which the
 * router and the sync worker never set, so page 2 of every list was page 1
 * again. Each list now walks the `next_page.offset` chain for the caller's
 * 1-based page and reports whether `next_page` named more.
 *
 * Comments are the stories of a task filtered to comments. No documented
 * query parameter filters by story type, so one upstream page is not one
 * caller page: they are cut from the filtered stream by the row pager.
 *
 * The fake upstream below honours only the documented parameters: `limit`
 * (1..100, anything else is a 400) and `offset` (a token it minted for that
 * path, anything else is a 400). It ignores `page` and every other key. It
 * records the bearer token each request went out with, and can serve each
 * token its own rows, so the connection tests see whose request it was.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import axios from 'axios'
import {
  withPageSink,
  readUpstreamPage,
  _resetCursorPager,
  parseListQuery,
  listPage,
  type Credentials,
  type QueryParams,
} from '@opensteward/shared'
import { AsanaAdapter } from '../../../../../src/verticals/projects/adapters/asana/index'

const CFG = { clientId: 'cid', clientSecret: 'sec', redirectUri: 'http://localhost/cb' }
const CREDS: Credentials = { accessToken: 'at-1', refreshToken: 'rt-1', extra: { userId: 'u1' } }

interface Call {
  path: string
  params: Record<string, unknown>
  /** The Authorization header the request went out with. */
  auth: string
  /** The `next_page.offset` this request was answered with, if any. */
  next?: string
}

type Rows = Array<Record<string, unknown>>

function httpError(status: number, message: string): Error {
  return Object.assign(new Error(`Request failed with status code ${status}`), {
    isAxiosError: true,
    response: { status, data: { errors: [{ message }] } },
  })
}

/**
 * Asana, as documented: `limit` 1..100, `offset` an opaque token from a
 * previous `next_page`. A collection is its rows, or the rows each
 * Authorization header sees.
 */
function fakeAsana(collections: Record<string, Rows | ((auth: string) => Rows)>) {
  const calls: Call[] = []
  const tokens = new Map<string, { path: string; at: number }>()
  let minted = 0
  const get = async (auth: string, path: string, cfg?: { params?: Record<string, unknown> }) => {
    const params = { ...(cfg?.params ?? {}) }
    const call: Call = { path, params, auth }
    calls.push(call)
    const collection = collections[path]
    if (!collection) throw httpError(404, `unknown path ${path}`)
    const rows = typeof collection === 'function' ? collection(auth) : collection
    const limit = Number(params['limit'])
    if (!Number.isInteger(limit) || limit < 1 || limit > 100)
      throw httpError(400, 'limit: The value must be between 1 and 100.')
    let start = 0
    if (params['offset'] !== undefined) {
      const token = tokens.get(String(params['offset']))
      if (!token || token.path !== path)
        throw httpError(400, 'offset: Your pagination token is invalid.')
      start = token.at
    }
    const data = rows.slice(start, start + limit)
    const end = start + data.length
    let nextPage: { offset: string; path: string; uri: string } | null = null
    if (end < rows.length) {
      const offset = `eyJ0eXAi${(minted++).toString(36)}OiJKV1Qi`
      tokens.set(offset, { path, at: end })
      const rel = `${path}?limit=${limit}&offset=${offset}`
      nextPage = { offset, path: rel, uri: `https://app.asana.com/api/1.0${rel}` }
      call.next = offset
    }
    return { data: { data, next_page: nextPage } }
  }
  vi.spyOn(axios, 'create').mockImplementation(((cfg?: { headers?: Record<string, unknown> }) => {
    const auth = String(cfg?.headers?.['Authorization'] ?? '')
    return {
      get: (path: string, c?: { params?: Record<string, unknown> }) => get(auth, path, c),
      post: vi.fn(),
    }
  }) as never)
  return calls
}

beforeEach(() => _resetCursorPager())
afterEach(() => vi.restoreAllMocks())

type Row = { id: string }

interface Case {
  method: string
  path: string
  make: (i: number) => Record<string, unknown>
  list: (a: AsanaAdapter, creds: Credentials, params: QueryParams) => Promise<Row[]>
  /** Filters the method reads from params. */
  extra?: Record<string, unknown>
}

const CASES: Case[] = [
  {
    method: 'listProjects',
    path: '/projects',
    make: (i) => ({ gid: `p${i}`, name: `P${i}` }),
    list: (a, c, p) => a.listProjects(c, p),
  },
  {
    method: 'listProjects (workspace_id)',
    path: '/workspaces/w1/projects',
    make: (i) => ({ gid: `wp${i}`, name: `WP${i}` }),
    list: (a, c, p) => a.listProjects(c, p),
    extra: { workspace_id: 'w1' },
  },
  {
    method: 'listTasks',
    path: '/projects/p1/tasks',
    make: (i) => ({ gid: `t${i}`, name: `T${i}` }),
    list: (a, c, p) => a.listTasks(c, 'p1', p),
  },
  {
    method: 'listTags',
    path: '/workspaces/w1/tags',
    make: (i) => ({ gid: `g${i}`, name: `G${i}` }),
    list: (a, c, p) => a.listTags(c, 'w1', p),
  },
  {
    method: 'listWorkspaces',
    path: '/workspaces',
    make: (i) => ({ gid: `w${i}`, name: `W${i}` }),
    list: (a, c, p) => a.listWorkspaces(c, p),
  },
]

describe.each(CASES)('$method walks the next_page.offset chain', (c) => {
  const rows = (n: number) => Array.from({ length: n }, (_, i) => c.make(i))
  const ids = (n: number) => rows(n).map((r) => String(r['gid']))

  async function pageAt(adapter: AsanaAdapter, page: number, limit: number) {
    const params = withPageSink({ page, limit, ...c.extra })
    const items = await c.list(adapter, CREDS, params)
    return { ids: items.map((x) => x.id), meta: readUpstreamPage(params) }
  }

  it('2L+1 rows at limit L: every row once, in order, hasMore [true, true, false]', async () => {
    const L = 3
    const calls = fakeAsana({ [c.path]: rows(2 * L + 1) })
    const adapter = new AsanaAdapter(CFG)
    const pages = [
      await pageAt(adapter, 1, L),
      await pageAt(adapter, 2, L),
      await pageAt(adapter, 3, L),
    ]
    expect(pages.flatMap((p) => p.ids)).toEqual(ids(2 * L + 1))
    expect(pages.map((p) => p.meta?.hasMore)).toEqual([true, true, false])
    // One request per page, each at the caller's limit.
    expect(calls.map((x) => x.params['limit'])).toEqual([L, L, L])
    // Page 2 carries the offset token page 1's next_page named, page 3 page 2's.
    expect(calls[0]!.params['offset']).toBeUndefined()
    expect(calls[1]!.params['offset']).toBe(calls[0]!.next)
    expect(calls[2]!.params['offset']).toBe(calls[1]!.next)
    expect(calls.every((x) => x.path === c.path)).toBe(true)
  })

  it('2L rows: page 2 is the last, page 3 is empty without a request', async () => {
    const L = 3
    const calls = fakeAsana({ [c.path]: rows(2 * L) })
    const adapter = new AsanaAdapter(CFG)
    const pages = [
      await pageAt(adapter, 1, L),
      await pageAt(adapter, 2, L),
      await pageAt(adapter, 3, L),
    ]
    expect(pages.flatMap((p) => p.ids)).toEqual(ids(2 * L))
    expect(pages.map((p) => p.meta?.hasMore)).toEqual([true, false, false])
    expect(pages[2]!.ids).toEqual([])
    expect(calls).toHaveLength(2)
  })

  it('a jump to page 3 on a cold pager walks the chain and serves page 3', async () => {
    const L = 3
    const calls = fakeAsana({ [c.path]: rows(2 * L + 1) })
    const p3 = await pageAt(new AsanaAdapter(CFG), 3, L)
    expect(p3.ids).toEqual(ids(2 * L + 1).slice(2 * L))
    expect(p3.meta?.hasMore).toBe(false)
    expect(calls.map((x) => x.params['offset'])).toEqual([
      undefined,
      calls[0]!.next,
      calls[1]!.next,
    ])
  })

  it('a limit above the documented 100 is sent as 100 and reported, and still serves every row', async () => {
    const N = 2 * 100 + 1
    const calls = fakeAsana({ [c.path]: rows(N) })
    const adapter = new AsanaAdapter(CFG)
    const pages = [
      await pageAt(adapter, 1, 250),
      await pageAt(adapter, 2, 250),
      await pageAt(adapter, 3, 250),
    ]
    expect(pages.map((p) => p.ids.length)).toEqual([100, 100, 1])
    expect(pages.flatMap((p) => p.ids)).toEqual(ids(N))
    expect(pages.map((p) => p.meta?.hasMore)).toEqual([true, true, false])
    expect(pages.map((p) => p.meta?.pageSize)).toEqual([100, 100, 100])
    expect(calls.map((x) => x.params['limit'])).toEqual([100, 100, 100])
  })

  it('at or under 100 no page size is reported: the page is the caller’s limit', async () => {
    fakeAsana({ [c.path]: rows(5) })
    const p1 = await pageAt(new AsanaAdapter(CFG), 1, 100)
    expect(p1.meta).toEqual({ hasMore: false })
  })

  it('through parseListQuery and listPage: meta.hasMore true, true, false and every row once', async () => {
    const L = 3
    fakeAsana({ [c.path]: rows(2 * L + 1) })
    const adapter = new AsanaAdapter(CFG)
    const served: string[] = []
    const hasMore: Array<boolean | null> = []
    for (let k = 1; k <= 3; k++) {
      const params = Object.assign(parseListQuery({ limit: String(L), page: String(k) }), c.extra)
      const env = listPage(await c.list(adapter, CREDS, params), params, 'asana')
      served.push(...env.data.map((x) => x.id))
      hasMore.push(env.meta.hasMore)
      expect(env.meta.limit).toBe(L)
    }
    expect(served).toEqual(ids(2 * L + 1))
    expect(hasMore).toEqual([true, true, false])
  })

  it('through parseListQuery at limit=500: meta.limit is the 100 asked for and hasMore is true', async () => {
    fakeAsana({ [c.path]: rows(150) })
    const params = Object.assign(parseListQuery({ limit: '500' }), c.extra)
    const env = listPage(await c.list(new AsanaAdapter(CFG), CREDS, params), params, 'asana')
    expect(env.data).toHaveLength(100)
    expect(env.meta.limit).toBe(100)
    expect(env.meta.hasMore).toBe(true)
  })
})

describe('offset chain: explicit cursors and connections', () => {
  const tasks = Array.from({ length: 7 }, (_, i) => ({ gid: `t${i}`, name: `T${i}` }))

  it('an explicit cursor is one request at that offset, and reports hasMore', async () => {
    const calls = fakeAsana({ '/projects/p1/tasks': tasks })
    const adapter = new AsanaAdapter(CFG)
    await adapter.listTasks(CREDS, 'p1', withPageSink({ page: 1, limit: 3 }))
    const token = calls[0]!.next
    const params = withPageSink({ limit: 3, cursor: token })
    const items = await adapter.listTasks(CREDS, 'p1', params)
    expect(items.map((t) => t.id)).toEqual(['t3', 't4', 't5'])
    expect(calls).toHaveLength(2)
    expect(calls[1]!.params).toMatchObject({ limit: 3, offset: token })
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
  })

  it('an explicit cursor on the last page reports hasMore false', async () => {
    const calls = fakeAsana({ '/projects/p1/tasks': tasks.slice(0, 5) })
    const adapter = new AsanaAdapter(CFG)
    await adapter.listTasks(CREDS, 'p1', withPageSink({ page: 1, limit: 3 }))
    const params = withPageSink({ limit: 3, cursor: calls[0]!.next })
    const items = await adapter.listTasks(CREDS, 'p1', params)
    expect(items.map((t) => t.id)).toEqual(['t3', 't4'])
    expect(calls[1]!.next).toBeUndefined()
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('two connections never share a walk, and each request goes out under its own token', async () => {
    const theirs = Array.from({ length: 7 }, (_, i) => ({ gid: `b${i}`, name: `B${i}` }))
    const calls = fakeAsana({
      '/projects/p1/tasks': (auth) => (auth === 'Bearer at-2' ? theirs : tasks),
    })
    const adapter = new AsanaAdapter(CFG)
    await adapter.listTasks(CREDS, 'p1', withPageSink({ page: 1, limit: 3 }))
    const other: Credentials = {
      accessToken: 'at-2',
      refreshToken: 'rt-2',
      extra: { userId: 'u1' },
    }
    const items = await adapter.listTasks(other, 'p1', withPageSink({ page: 2, limit: 3 }))
    expect(items.map((t) => t.id)).toEqual(['b3', 'b4', 'b5'])
    // The second connection has no token for page 2 of its own yet.
    expect(calls.map((x) => x.params['offset'])).toEqual([undefined, undefined, calls[1]!.next])
    expect(calls.map((x) => x.auth)).toEqual(['Bearer at-1', 'Bearer at-2', 'Bearer at-2'])
  })

  it('a refreshed access token on the same connection keeps its walk', async () => {
    const calls = fakeAsana({ '/projects/p1/tasks': tasks })
    const adapter = new AsanaAdapter(CFG)
    await adapter.listTasks(CREDS, 'p1', withPageSink({ page: 1, limit: 3 }))
    const refreshed: Credentials = { ...CREDS, accessToken: 'at-1-refreshed' }
    await adapter.listTasks(refreshed, 'p1', withPageSink({ page: 2, limit: 3 }))
    expect(calls.map((x) => x.params['offset'])).toEqual([undefined, calls[0]!.next])
    // The walk is kept, not the client: page 2 goes out under the new token.
    expect(calls.map((x) => x.auth)).toEqual(['Bearer at-1', 'Bearer at-1-refreshed'])
  })
})

describe('offset chain: each walk is one list at one size', () => {
  const of = (prefix: string, n: number) =>
    Array.from({ length: n }, (_, i) => ({ gid: `${prefix}-t${i}`, name: `T${i}` }))

  it('an API walk at limit 3 keeps its place while a sync walks the same list at 500', async () => {
    const calls = fakeAsana({ '/projects/p1/tasks': of('p1', 250) })
    const adapter = new AsanaAdapter(CFG)
    await adapter.listTasks(CREDS, 'p1', withPageSink({ page: 1, limit: 3 }))
    // The sync worker's page 1, sent to Asana as 100.
    await adapter.listTasks(CREDS, 'p1', withPageSink({ page: 1, limit: 500 }))
    const p2 = await adapter.listTasks(CREDS, 'p1', withPageSink({ page: 2, limit: 3 }))
    expect(p2.map((t) => t.id)).toEqual(['p1-t3', 'p1-t4', 'p1-t5'])
    expect(calls.map((x) => x.params['limit'])).toEqual([3, 100, 3])
    expect(calls[2]!.params['offset']).toBe(calls[0]!.next)
  })

  it('two projects on one connection keep their own places', async () => {
    const calls = fakeAsana({
      '/projects/p1/tasks': of('p1', 7),
      '/projects/p2/tasks': of('p2', 7),
    })
    const adapter = new AsanaAdapter(CFG)
    await adapter.listTasks(CREDS, 'p1', withPageSink({ page: 1, limit: 3 }))
    const p2 = await adapter.listTasks(CREDS, 'p2', withPageSink({ page: 2, limit: 3 }))
    expect(p2.map((t) => t.id)).toEqual(['p2-t3', 'p2-t4', 'p2-t5'])
    // p2 walks its own chain from its first page; p1's token never goes to it.
    expect(calls.map((x) => [x.path, x.params['offset']])).toEqual([
      ['/projects/p1/tasks', undefined],
      ['/projects/p2/tasks', undefined],
      ['/projects/p2/tasks', calls[1]!.next],
    ])
  })

  it('a direct call with no limit gets Asana pages of 100', async () => {
    const calls = fakeAsana({ '/projects/p1/tasks': of('p1', 150) })
    const params = withPageSink({ page: 1 })
    const items = await new AsanaAdapter(CFG).listTasks(CREDS, 'p1', params)
    expect(items).toHaveLength(100)
    expect(calls.map((x) => x.params['limit'])).toEqual([100])
    expect(readUpstreamPage(params)).toEqual({ hasMore: true })
  })

  it('a limit below 1 goes upstream as 100, never as a limit Asana rejects', async () => {
    const calls = fakeAsana({ '/projects/p1/tasks': of('p1', 150) })
    const items = await new AsanaAdapter(CFG).listTasks(
      CREDS,
      'p1',
      withPageSink({ page: 1, limit: 0 }),
    )
    expect(items).toHaveLength(100)
    expect(calls.map((x) => x.params['limit'])).toEqual([100])
  })
})

// ── comments: stories of a task, filtered ──────────────────────────────────

const STORIES = '/tasks/k1/stories'

const system = (i: number, prefix = '') => ({
  gid: `${prefix}s${i}`,
  type: 'system',
  resource_subtype: 'assigned',
  text: 'assigned',
})
const comment = (i: number, prefix = '') => ({
  gid: `${prefix}c${i}`,
  type: 'comment',
  resource_subtype: 'comment_added',
  text: 'hi',
})

/** `total` stories, comments at `at`, system stories elsewhere; gids start with `prefix`. */
function stories(total: number, at: readonly number[], prefix = '') {
  const set = new Set(at)
  return Array.from({ length: total }, (_, i) =>
    set.has(i) ? comment(i, prefix) : system(i, prefix),
  )
}

async function commentsAt(
  adapter: AsanaAdapter,
  page: number,
  limit: number,
  creds = CREDS,
  task = 'k1',
) {
  const params = withPageSink({ page, limit })
  const items = await adapter.listComments(creds, task, params)
  return { ids: items.map((x) => x.id), meta: readUpstreamPage(params) }
}

describe('listComments: comments cut from the stream of stories', () => {
  // 270 stories over three upstream pages of 100; seven comments, spread so
  // that pages of three comments straddle upstream pages.
  const AT = [5, 40, 99, 100, 150, 230, 260]

  it('2L+1 comments at limit L: every comment once, in order, hasMore [true, true, false]', async () => {
    const calls = fakeAsana({ [STORIES]: stories(270, AT) })
    const adapter = new AsanaAdapter(CFG)
    const pages = [
      await commentsAt(adapter, 1, 3),
      await commentsAt(adapter, 2, 3),
      await commentsAt(adapter, 3, 3),
    ]
    expect(pages.flatMap((p) => p.ids)).toEqual(AT.map((i) => `c${i}`))
    expect(pages.map((p) => p.ids.length)).toEqual([3, 3, 1])
    expect(pages.map((p) => p.meta?.hasMore)).toEqual([true, true, false])
    // Each upstream page read once, at Asana's maximum, following next_page.
    expect(calls.map((x) => x.params['limit'])).toEqual([100, 100, 100])
    expect(calls.map((x) => x.params['offset'])).toEqual([
      undefined,
      calls[0]!.next,
      calls[1]!.next,
    ])
  })

  it('2L comments: page 2 is the last, page 3 is empty without a request', async () => {
    const calls = fakeAsana({ [STORIES]: stories(270, AT.slice(0, 6)) })
    const adapter = new AsanaAdapter(CFG)
    const pages = [
      await commentsAt(adapter, 1, 3),
      await commentsAt(adapter, 2, 3),
      await commentsAt(adapter, 3, 3),
    ]
    expect(pages.flatMap((p) => p.ids)).toEqual(AT.slice(0, 6).map((i) => `c${i}`))
    expect(pages.map((p) => p.meta?.hasMore)).toEqual([true, false, false])
    expect(calls).toHaveLength(3)
  })

  it('a page never comes back short because stories between comments were filtered out', async () => {
    // Every other story a comment: an upstream page of 100 stories holds 50.
    const at = Array.from({ length: 150 }, (_, i) => i * 2)
    fakeAsana({ [STORIES]: stories(300, at) })
    const p1 = await commentsAt(new AsanaAdapter(CFG), 1, 100)
    expect(p1.ids).toEqual(at.slice(0, 100).map((i) => `c${i}`))
    expect(p1.meta?.hasMore).toBe(true)
  })

  it('a limit above the documented 100 still serves every comment, 100 stories a request', async () => {
    // 300 stories; every one but each 15th is a comment: 280 comments.
    const at = Array.from({ length: 300 }, (_, i) => i).filter((i) => i % 15 !== 0)
    const calls = fakeAsana({ [STORIES]: stories(300, at) })
    const adapter = new AsanaAdapter(CFG)
    const pages = [await commentsAt(adapter, 1, 250), await commentsAt(adapter, 2, 250)]
    expect(pages.map((p) => p.ids.length)).toEqual([250, 30])
    expect(pages.flatMap((p) => p.ids)).toEqual(at.map((i) => `c${i}`))
    expect(pages.map((p) => p.meta?.hasMore)).toEqual([true, false])
    expect(calls.every((x) => x.params['limit'] === 100)).toBe(true)
  })

  it('through parseListQuery and listPage: meta.hasMore true, true, false and every comment once', async () => {
    fakeAsana({ [STORIES]: stories(270, AT) })
    const adapter = new AsanaAdapter(CFG)
    const served: string[] = []
    const hasMore: Array<boolean | null> = []
    for (let k = 1; k <= 3; k++) {
      const params = parseListQuery({ limit: '3', page: String(k) })
      const env = listPage(await adapter.listComments(CREDS, 'k1', params), params, 'asana')
      served.push(...env.data.map((x) => x.id))
      hasMore.push(env.meta.hasMore)
    }
    expect(served).toEqual(AT.map((i) => `c${i}`))
    expect(hasMore).toEqual([true, true, false])
  })

  it('two connections never share rows', async () => {
    // Each connection sees its own stories: the second's gids start with 'b'.
    const calls = fakeAsana({
      [STORIES]: (auth) => (auth === 'Bearer at-2' ? stories(270, AT, 'b') : stories(270, AT)),
    })
    const adapter = new AsanaAdapter(CFG)
    await commentsAt(adapter, 1, 2)
    const before = calls.length
    const other: Credentials = {
      accessToken: 'at-2',
      refreshToken: 'rt-2',
      extra: { userId: 'u1' },
    }
    const p2 = await commentsAt(adapter, 2, 2, other)
    expect(p2.ids).toEqual(['bc99', 'bc100'])
    // Its own walk from the first upstream page, under its own token.
    expect(calls.length).toBeGreaterThan(before)
    expect(calls[before]!.params['offset']).toBeUndefined()
    expect(calls.slice(0, before).every((x) => x.auth === 'Bearer at-1')).toBe(true)
    expect(calls.slice(before).every((x) => x.auth === 'Bearer at-2')).toBe(true)
  })

  it('two tasks on one connection never serve each other’s comments', async () => {
    const all = Array.from({ length: 10 }, (_, i) => i)
    fakeAsana({
      '/tasks/k1/stories': stories(10, all, 'k1-'),
      '/tasks/k2/stories': stories(10, all, 'k2-'),
    })
    const adapter = new AsanaAdapter(CFG)
    const k1p1 = await commentsAt(adapter, 1, 2, CREDS, 'k1')
    const k2p1 = await commentsAt(adapter, 1, 2, CREDS, 'k2')
    const k1p2 = await commentsAt(adapter, 2, 2, CREDS, 'k1')
    const k2p2 = await commentsAt(adapter, 2, 2, CREDS, 'k2')
    expect([k1p1.ids, k2p1.ids, k1p2.ids, k2p2.ids]).toEqual([
      ['k1-c0', 'k1-c1'],
      ['k2-c0', 'k2-c1'],
      ['k1-c2', 'k1-c3'],
      ['k2-c2', 'k2-c3'],
    ])
  })

  it('a story is a comment when either its type or its resource_subtype says so', async () => {
    fakeAsana({
      [STORIES]: [
        { gid: 'both', type: 'comment', resource_subtype: 'comment_added', text: 'x' },
        { gid: 'subtype-only', resource_subtype: 'comment_added', text: 'x' },
        { gid: 'system-1', type: 'system', resource_subtype: 'comment_liked', text: 'x' },
        { gid: 'type-only', type: 'comment', text: 'x' },
        { gid: 'system-2', type: 'system', resource_subtype: 'assigned', text: 'x' },
      ],
    })
    const adapter = new AsanaAdapter(CFG)
    const pages = [await commentsAt(adapter, 1, 2), await commentsAt(adapter, 2, 2)]
    expect(pages.map((p) => p.ids)).toEqual([['both', 'subtype-only'], ['type-only']])
    expect(pages.map((p) => p.meta?.hasMore)).toEqual([true, false])
  })

  it('a direct call with no limit gets a page of 100 comments', async () => {
    const all = Array.from({ length: 150 }, (_, i) => i)
    fakeAsana({ [STORIES]: stories(150, all) })
    const params = withPageSink({ page: 1 })
    const items = await new AsanaAdapter(CFG).listComments(CREDS, 'k1', params)
    expect(items.map((x) => x.id)).toEqual(all.slice(0, 100).map((i) => `c${i}`))
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
  })

  it('an explicit cursor is one request at that offset, filtered', async () => {
    const calls = fakeAsana({ [STORIES]: stories(270, AT) })
    const adapter = new AsanaAdapter(CFG)
    await commentsAt(adapter, 1, 3)
    const token = calls[0]!.next
    const params = withPageSink({ limit: 100, cursor: token })
    const items = await adapter.listComments(CREDS, 'k1', params)
    expect(items.map((x) => x.id)).toEqual(['c100', 'c150'])
    expect(calls.at(-1)!.params).toMatchObject({ limit: 100, offset: token })
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
  })

  it('an explicit cursor on the last upstream page reports hasMore false', async () => {
    const calls = fakeAsana({ [STORIES]: stories(270, AT) })
    const adapter = new AsanaAdapter(CFG)
    // Page 1 of three comments ends at story 99, so the pager peeks at the
    // second upstream page; its next_page names the third and last.
    await commentsAt(adapter, 1, 3)
    const token = calls[1]!.next
    expect(token).toBeDefined()
    const params = withPageSink({ limit: 100, cursor: token })
    const items = await adapter.listComments(CREDS, 'k1', params)
    expect(items.map((x) => x.id)).toEqual(['c230', 'c260'])
    expect(calls.at(-1)!.next).toBeUndefined()
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('an explicit cursor reads the caller’s limit of stories, so never more than that many comments', async () => {
    const all = Array.from({ length: 250 }, (_, i) => i)
    const calls = fakeAsana({ [STORIES]: stories(250, all) })
    const adapter = new AsanaAdapter(CFG)
    await commentsAt(adapter, 1, 3)
    const token = calls[0]!.next
    const params = withPageSink({ limit: 3, cursor: token })
    const items = await adapter.listComments(CREDS, 'k1', params)
    expect(items.map((x) => x.id)).toEqual(['c100', 'c101', 'c102'])
    expect(calls.at(-1)!.params).toMatchObject({ limit: 3, offset: token })
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
  })
})
