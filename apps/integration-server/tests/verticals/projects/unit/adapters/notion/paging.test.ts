/**
 * Notion pages every list endpoint this adapter reads with `page_size` and
 * `start_cursor`, and ends a page with `has_more` / `next_cursor`
 * (https://developers.notion.com/reference/intro):
 *
 *   page_size — "The number of items from the full list to include in the
 *   response. Default: 100 Maximum: 100"
 *   start_cursor — "A next_cursor value returned in a previous response.
 *   Treat this as an opaque value."
 *   next_cursor — "A string that can be used to retrieve the next page of
 *   results by passing the value as the start_cursor parameter to the same
 *   endpoint. Only available when has_more is true."
 *   "GET requests accept parameters in the query string. POST requests
 *   receive parameters in the request body."
 *
 * Every list used to read only `params.cursor`, so caller page 2 repeated
 * page 1. The fake honours ONLY the documented paging inputs.
 *
 * `listUsers` drops bot users from each upstream page, so one upstream page
 * is not one caller page: it goes through the row pager. `listWorkspaces` is
 * the single workspace behind GET /users/me and is paged locally.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import axios from 'axios'
import {
  withPageSink,
  readUpstreamPage,
  _resetCursorPager,
  parseListQuery,
  listPage,
} from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import { NotionAdapter } from '../../../../../../src/verticals/projects/adapters/notion/index'

vi.mock('axios')

const C1: Credentials = { accessToken: 'tok-1', extra: { workspaceId: 'ws-1' } }
const C2: Credentials = { accessToken: 'tok-2', extra: { workspaceId: 'ws-1' } }

/** Documented maximum (and default) of `page_size`. */
const NOTION_MAX = 100

interface Req {
  token: string
  method: 'GET' | 'POST'
  path: string
  /** Query string for GET, body for POST: where Notion reads paging inputs. */
  paging: Record<string, unknown>
}

type Kind = 'projects' | 'tasks' | 'comments' | 'users'

function idOf(kind: Kind, token: string, parent: string, n: number): string {
  return `${kind}-${token}-${parent}-${String(n).padStart(4, '0')}`
}

/** In the users collection every third row is a bot, which the adapter drops. */
function isBot(n: number): boolean {
  return n % 3 === 2
}

function row(kind: Kind, token: string, parent: string, n: number): Record<string, unknown> {
  const id = idOf(kind, token, parent, n)
  switch (kind) {
    case 'projects':
      return { object: 'data_source', id, title: [{ plain_text: id }] }
    case 'tasks':
      return { object: 'page', id, properties: {} }
    case 'comments':
      return { object: 'comment', id, rich_text: [{ plain_text: id }], created_by: { id: 'u' } }
    case 'users':
      return isBot(n)
        ? { object: 'user', id, type: 'bot', name: id, bot: {} }
        : { object: 'user', id, type: 'person', name: id, person: { email: `${id}@example.com` } }
  }
}

/** Resolve a request to its collection, or throw on an unexpected path. */
function collectionOf(
  method: 'GET' | 'POST',
  path: string,
  paging: Record<string, unknown>,
): { kind: Kind; parent: string } {
  if (method === 'POST' && path === '/search') {
    const filter = paging['filter'] as { property?: string; value?: string } | undefined
    if (filter?.property !== 'object' || filter.value !== 'data_source')
      throw new Error('search without the data_source filter')
    // Each search query is its own collection: its rows and cursors differ.
    const query = paging['query']
    return { kind: 'projects', parent: typeof query === 'string' ? `q-${query}` : 'all' }
  }
  const q = method === 'POST' ? path.match(/^\/data_sources\/([^/]+)\/query$/) : null
  if (q) return { kind: 'tasks', parent: q[1]! }
  if (method === 'GET' && path === '/comments') {
    const block = paging['block_id']
    if (typeof block !== 'string') throw new Error('comments without block_id')
    return { kind: 'comments', parent: block }
  }
  if (method === 'GET' && path === '/users') return { kind: 'users', parent: 'all' }
  throw new Error(`unexpected ${method} ${path}`)
}

/**
 * Notion holding `total` rows per (token, collection). Honours only
 * `page_size` (default 100, max 100) and `start_cursor`; the cursor is opaque
 * and bound to its collection and token, so a borrowed one is refused.
 */
function fakeNotion(total: number, requests: Req[] = []) {
  vi.mocked(axios.create).mockImplementation(((config?: { headers?: Record<string, unknown> }) => {
    const token = String(config?.headers?.['Authorization'] ?? '').replace(/^Bearer /, '')
    const serve = (method: 'GET' | 'POST', path: string, paging: Record<string, unknown>) => {
      requests.push({ token, method, path, paging: { ...paging } })
      const { kind, parent } = collectionOf(method, path, paging)
      const all = Array.from({ length: total }, (_, i) => row(kind, token, parent, i))
      const rawSize = paging['page_size']
      const size = rawSize === undefined ? NOTION_MAX : Number(rawSize)
      if (!Number.isInteger(size) || size < 1 || size > NOTION_MAX)
        throw new Error(`page_size ${String(rawSize)} out of range`)
      const tag = `${token}|${kind}|${parent}|`
      const cur = paging['start_cursor']
      let start = 0
      if (cur !== undefined) {
        const s = String(cur)
        if (!s.startsWith(tag)) throw new Error(`start_cursor ${s} is not from this collection`)
        start = Number(s.slice(tag.length))
      }
      const results = all.slice(start, start + size)
      const hasMore = start + size < all.length
      return {
        data: {
          object: 'list',
          results,
          has_more: hasMore,
          next_cursor: hasMore ? `${tag}${start + size}` : null,
        },
      }
    }
    const get = vi.fn(async (path: string, cfg?: { params?: Record<string, unknown> }) =>
      serve('GET', path, cfg?.params ?? {}),
    )
    const post = vi.fn(async (path: string, body?: Record<string, unknown>) =>
      serve('POST', path, body ?? {}),
    )
    return { get, post }
  }) as unknown as typeof axios.create)
  return { requests }
}

type Lister = (
  a: NotionAdapter,
  c: Credentials,
  parent: string,
  p: QueryParams,
) => Promise<{ id: string }[]>

const CURSOR_LISTS: Array<[string, Kind, Lister]> = [
  ['listProjects', 'projects', (a, c, _parent, p) => a.listProjects(c, p)],
  ['listTasks', 'tasks', (a, c, parent, p) => a.listTasks(c, parent, p)],
  ['listComments', 'comments', (a, c, parent, p) => a.listComments(c, parent, p)],
]

function ids(kind: Kind, token: string, parent: string, from: number, n: number): string[] {
  const par = kind === 'projects' ? 'all' : parent
  return Array.from({ length: n }, (_, i) => idOf(kind, token, par, from + i))
}

/** Ids of the people (bots dropped) among the first `total` user rows. */
function peopleIds(token: string, total: number): string[] {
  return Array.from({ length: total }, (_, n) => n)
    .filter((n) => !isBot(n))
    .map((n) => idOf('users', token, 'all', n))
}

beforeEach(() => _resetCursorPager())
afterEach(() => vi.clearAllMocks())

describe('notion declares the documented page maximum', () => {
  it('capabilities.maxPageSize is 100', () => {
    expect(
      new NotionAdapter({ clientId: 'c', clientSecret: 's', redirectUri: 'r' }).capabilities
        .maxPageSize,
    ).toBe(NOTION_MAX)
  })
})

function adapter(): NotionAdapter {
  return new NotionAdapter({ clientId: 'c', clientSecret: 's', redirectUri: 'r' })
}

describe.each(CURSOR_LISTS)('notion %s pages at the caller size', (_name, kind, list) => {
  it('N = 2L+1 rows at limit L: pages 1-3 serve every id once, in order, hasMore exact', async () => {
    const L = 40
    fakeNotion(2 * L + 1)
    const a = adapter()
    const served: string[] = []
    const more: Array<boolean | undefined> = []
    for (let page = 1; page <= 3; page++) {
      const params = withPageSink({ page, limit: L })
      const rows = await list(a, C1, 'p1', params)
      served.push(...rows.map((r) => r.id))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(served).toEqual(ids(kind, 'tok-1', 'p1', 0, 2 * L + 1))
    expect(more).toEqual([true, true, false])
  })

  it('page 2 carries start_cursor from page 1 next_cursor, and page_size = limit', async () => {
    const { requests } = fakeNotion(150)
    const a = adapter()
    await list(a, C1, 'p1', withPageSink({ page: 1, limit: 50 }))
    await list(a, C1, 'p1', withPageSink({ page: 2, limit: 50 }))
    expect(requests).toHaveLength(2)
    expect(requests[0]!.paging['page_size']).toBe(50)
    expect(requests[0]!.paging['start_cursor']).toBeUndefined()
    expect(requests[1]!.paging['page_size']).toBe(50)
    const par = kind === 'projects' ? 'all' : 'p1'
    expect(requests[1]!.paging['start_cursor']).toBe(`tok-1|${kind}|${par}|50`)
  })

  it('a limit above the documented maximum is clamped to 100 and reported as the page size', async () => {
    const { requests } = fakeNotion(250)
    const a = adapter()
    const params = withPageSink({ page: 1, limit: 500 })
    const rows = await list(a, C1, 'p1', params)
    expect(requests[0]!.paging['page_size']).toBe(NOTION_MAX)
    expect(rows.map((r) => r.id)).toEqual(ids(kind, 'tok-1', 'p1', 0, NOTION_MAX))
    expect(readUpstreamPage(params)).toMatchObject({ hasMore: true, pageSize: NOTION_MAX })
    expect(parseListQuery({ limit: '500' }, a).limit).toBeLessThanOrEqual(NOTION_MAX)
  })

  it('API path: parseListQuery + listPage walks the whole collection once', async () => {
    fakeNotion(230)
    const a = adapter()
    const served: string[] = []
    for (let page = 1; page < 20; page++) {
      const params = parseListQuery({ limit: '25', page: String(page) }, a)
      const env = listPage(await list(a, C1, 'p1', params), params, 'notion')
      served.push(...env.data.map((r) => r.id))
      if (env.meta.hasMore !== true) break
    }
    expect(served).toEqual(ids(kind, 'tok-1', 'p1', 0, 230))
  })

  it('two connections interleaved within the TTL each walk their own rows', async () => {
    const L = 40
    fakeNotion(2 * L + 1)
    const a = adapter()
    const a1 = await list(a, C1, 'p1', withPageSink({ page: 1, limit: L }))
    const b2 = await list(a, C2, 'p1', withPageSink({ page: 2, limit: L }))
    const a2 = await list(a, C1, 'p1', withPageSink({ page: 2, limit: L }))
    expect(a1.map((r) => r.id)).toEqual(ids(kind, 'tok-1', 'p1', 0, L))
    expect(b2.map((r) => r.id)).toEqual(ids(kind, 'tok-2', 'p1', L, L))
    expect(a2.map((r) => r.id)).toEqual(ids(kind, 'tok-1', 'p1', L, L))
  })

  it.runIf(kind !== 'projects')('two parents interleaved each walk their own rows', async () => {
    const L = 40
    fakeNotion(2 * L + 1)
    const a = adapter()
    const a1 = await list(a, C1, 'p1', withPageSink({ page: 1, limit: L }))
    const b2 = await list(a, C1, 'p2', withPageSink({ page: 2, limit: L }))
    const a2 = await list(a, C1, 'p1', withPageSink({ page: 2, limit: L }))
    expect(a1.map((r) => r.id)).toEqual(ids(kind, 'tok-1', 'p1', 0, L))
    expect(b2.map((r) => r.id)).toEqual(ids(kind, 'tok-1', 'p2', L, L))
    expect(a2.map((r) => r.id)).toEqual(ids(kind, 'tok-1', 'p1', L, L))
  })

  it('an explicit cursor param is sent as start_cursor and names the upstream page directly', async () => {
    const { requests } = fakeNotion(40)
    const a = adapter()
    const par = kind === 'projects' ? 'all' : 'p1'
    const params = withPageSink({ page: 1, limit: 5 })
    params['cursor'] = `tok-1|${kind}|${par}|10`
    const rows = await list(a, C1, 'p1', params)
    expect(requests).toHaveLength(1)
    expect(requests[0]!.paging['start_cursor']).toBe(`tok-1|${kind}|${par}|10`)
    expect(rows.map((r) => r.id)).toEqual(ids(kind, 'tok-1', 'p1', 10, 5))
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
  })
})

describe('notion listProjects keys each search query separately', () => {
  it('interleaved searches each walk their own rows, and the query reaches /search', async () => {
    const L = 40
    const { requests } = fakeNotion(2 * L + 1)
    const a = adapter()
    const pa1 = withPageSink({ page: 1, limit: L })
    pa1['search'] = 'a'
    const pb2 = withPageSink({ page: 2, limit: L })
    pb2['search'] = 'b'
    const pa2 = withPageSink({ page: 2, limit: L })
    pa2['search'] = 'a'
    const a1 = await a.listProjects(C1, pa1)
    const b2 = await a.listProjects(C1, pb2)
    const a2 = await a.listProjects(C1, pa2)
    const qIds = (q: string, from: number) =>
      Array.from({ length: L }, (_, i) => idOf('projects', 'tok-1', `q-${q}`, from + i))
    expect(a1.map((r) => r.id)).toEqual(qIds('a', 0))
    expect(b2.map((r) => r.id)).toEqual(qIds('b', L))
    expect(a2.map((r) => r.id)).toEqual(qIds('a', L))
    // Search b's page 2 walks from b's own first page; it never borrows a's cursor.
    expect(requests.map((r) => [r.paging['query'], r.paging['start_cursor']])).toEqual([
      ['a', undefined],
      ['b', undefined],
      ['b', `tok-1|projects|q-b|${L}`],
      ['a', `tok-1|projects|q-a|${L}`],
    ])
  })
})

describe('notion listUsers drops bots and pages the people by rows', () => {
  it('N = 2L+1 people at limit L: pages 1-3 serve every person once, in order, hasMore exact', async () => {
    const L = 40
    // 121 rows of which every third is a bot (40): 2L+1 = 81 people.
    const total = 121
    const people = peopleIds('tok-1', total)
    expect(people).toHaveLength(2 * L + 1)
    fakeNotion(total)
    const a = adapter()
    const served: string[] = []
    const more: Array<boolean | undefined> = []
    for (let page = 1; page <= 3; page++) {
      const params = withPageSink({ page, limit: L })
      const rows = await a.listUsers(C1, 'ws-1', params)
      served.push(...rows.map((r) => r.id))
      more.push(readUpstreamPage(params)?.hasMore)
      expect(readUpstreamPage(params)?.pagedLocally).toBe(true)
    }
    expect(served).toEqual(people)
    expect(more).toEqual([true, true, false])
  })

  it('page 2 of the upstream walk carries start_cursor from next_cursor at page_size 100', async () => {
    const { requests } = fakeNotion(250)
    const a = adapter()
    const params = withPageSink({ page: 2, limit: 80 })
    const rows = await a.listUsers(C1, 'ws-1', params)
    expect(rows.map((r) => r.id)).toEqual(peopleIds('tok-1', 250).slice(80, 160))
    expect(requests.every((r) => r.paging['page_size'] === NOTION_MAX)).toBe(true)
    expect(requests[0]!.paging['start_cursor']).toBeUndefined()
    expect(requests[1]!.paging['start_cursor']).toBe('tok-1|users|all|100')
  })

  it('API path: parseListQuery + listPage walks every person once', async () => {
    fakeNotion(230)
    const a = adapter()
    const served: string[] = []
    for (let page = 1; page < 30; page++) {
      const params = parseListQuery({ limit: '25', page: String(page) }, a)
      const env = listPage(await a.listUsers(C1, 'ws-1', params), params, 'notion')
      served.push(...env.data.map((r) => r.id))
      if (env.meta.hasMore !== true) break
    }
    expect(served).toEqual(peopleIds('tok-1', 230))
  })

  it('an explicit cursor param names one upstream page at the caller size, hasMore exact', async () => {
    const { requests } = fakeNotion(40)
    const a = adapter()
    const mid = withPageSink({ page: 1, limit: 10 })
    mid['cursor'] = 'tok-1|users|all|15'
    const rows = await a.listUsers(C1, 'ws-1', mid)
    expect(requests).toHaveLength(1)
    expect(requests[0]!.paging).toMatchObject({ page_size: 10, start_cursor: 'tok-1|users|all|15' })
    // Upstream rows 15-24 with the bots dropped.
    expect(rows.map((r) => r.id)).toEqual(
      Array.from({ length: 10 }, (_, i) => 15 + i)
        .filter((n) => !isBot(n))
        .map((n) => idOf('users', 'tok-1', 'all', n)),
    )
    expect(readUpstreamPage(mid)?.hasMore).toBe(true)

    const last = withPageSink({ page: 1, limit: 10 })
    last['cursor'] = 'tok-1|users|all|30'
    await a.listUsers(C1, 'ws-1', last)
    expect(readUpstreamPage(last)?.hasMore).toBe(false)
  })

  it('two connections interleaved each walk their own people', async () => {
    fakeNotion(122)
    const a = adapter()
    const a1 = await a.listUsers(C1, 'ws-1', withPageSink({ page: 1, limit: 40 }))
    const b2 = await a.listUsers(C2, 'ws-1', withPageSink({ page: 2, limit: 40 }))
    const a2 = await a.listUsers(C1, 'ws-1', withPageSink({ page: 2, limit: 40 }))
    expect(a1.map((r) => r.id)).toEqual(peopleIds('tok-1', 122).slice(0, 40))
    expect(b2.map((r) => r.id)).toEqual(peopleIds('tok-2', 122).slice(40, 80))
    expect(a2.map((r) => r.id)).toEqual(peopleIds('tok-1', 122).slice(40, 80))
  })
})

describe('notion listWorkspaces pages its single workspace locally', () => {
  it('page 1 holds the workspace, page 2 is empty, hasMore false', async () => {
    vi.mocked(axios.create).mockImplementation((() => ({
      get: vi.fn(async () => ({
        data: {
          object: 'user',
          id: 'bot-1',
          type: 'bot',
          bot: { workspace_id: 'ws-1', workspace_name: 'W' },
        },
      })),
      post: vi.fn(),
    })) as unknown as typeof axios.create)
    const a = adapter()
    const p1 = withPageSink({ page: 1, limit: 10 })
    const p2 = withPageSink({ page: 2, limit: 10 })
    expect((await a.listWorkspaces(C1, p1)).map((w) => w.id)).toEqual(['ws-1'])
    expect(await a.listWorkspaces(C1, p2)).toEqual([])
    expect(readUpstreamPage(p1)).toMatchObject({ hasMore: false, pagedLocally: true })
    expect(readUpstreamPage(p2)).toMatchObject({ hasMore: false, pagedLocally: true })
  })
})
