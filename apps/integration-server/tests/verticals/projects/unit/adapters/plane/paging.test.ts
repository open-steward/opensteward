/**
 * Plane pages its list endpoints with `per_page` and an opaque `cursor`
 * (https://developers.plane.so/api-reference/introduction): "per_page
 * (optional) : Number of items to display per page. Defaults to 100. The
 * maximum allowed value specified by the server is 100. cursor (optional) :
 * Cursor string to navigate to a specific page." The response carries
 * `next_cursor` and "next_page_results Boolean indicating if there are more
 * results after the current page."
 *
 * `GET /workspaces/{slug}/members/` documents no query parameters and returns
 * a bare JSON array
 * (https://developers.plane.so/api-reference/members/get-workspace-members),
 * so listUsers pages it locally.
 *
 * listProjects, listTasks and listUsers used to read only `params.cursor`, so
 * caller page 2 repeated page 1. The fake honours ONLY the documented paging
 * inputs, and — like Plane's paginator — always mints a `next_cursor`, even on
 * the last page: only `next_page_results` says whether another page exists.
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
import { PlaneAdapter } from '../../../../../../src/verticals/projects/adapters/plane/index'

vi.mock('axios')

const C1: Credentials = { accessToken: 'tok-1', extra: { workspaceSlug: 'ws' } }
const C2: Credentials = { accessToken: 'tok-2', extra: { workspaceSlug: 'ws' } }

/** Documented maximum of `per_page`. */
const PLANE_MAX = 100
/** Documented default of `per_page` on the per-endpoint pages. */
const PLANE_DEFAULT = 20

type Kind = 'projects' | 'work-items' | 'members'

interface Req {
  token: string
  path: string
  params: Record<string, unknown>
}

function idOf(kind: Kind, token: string, parent: string, n: number): string {
  return `${kind}-${token}-${parent}-${String(n).padStart(4, '0')}`
}

function row(kind: Kind, token: string, parent: string, n: number): Record<string, unknown> {
  const id = idOf(kind, token, parent, n)
  switch (kind) {
    case 'projects':
      return { id, name: id, identifier: `P${n}` }
    case 'work-items':
      return { id, name: id, project: parent }
    case 'members':
      return { id, display_name: id, email: `${id}@example.com`, role: 15 }
  }
}

/** Match a request path to one of Plane's list endpoints. */
function route(path: string): { kind: Kind; parent: string } | { kind: 'states' } | null {
  let m = path.match(/^\/workspaces\/ws\/projects\/$/)
  if (m) return { kind: 'projects', parent: 'all' }
  m = path.match(/^\/workspaces\/ws\/projects\/([^/]+)\/work-items\/$/)
  if (m) return { kind: 'work-items', parent: m[1]! }
  m = path.match(/^\/workspaces\/ws\/projects\/([^/]+)\/states\/$/)
  if (m) return { kind: 'states' }
  m = path.match(/^\/workspaces\/ws\/members\/$/)
  if (m) return { kind: 'members', parent: 'all' }
  return null
}

/**
 * A Plane workspace holding `total` rows per (token, collection, parent).
 * Cursor endpoints honour only `per_page` (default 20, max 100) and a
 * `value:offset:is_prev` cursor; the members endpoint honours nothing and
 * returns every row as a bare array.
 */
function fakePlane(
  total: number | Record<string, number>,
  requests: Req[] = [],
  opts: { omitNextPageResults?: boolean } = {},
) {
  vi.mocked(axios.create).mockImplementation(((config?: { headers?: Record<string, unknown> }) => {
    const token = String(config?.headers?.['Authorization'] ?? '').replace(/^Bearer /, '')
    const get = vi.fn(async (path: string, cfg?: { params?: Record<string, unknown> }) => {
      const params = { ...(cfg?.params ?? {}) }
      requests.push({ token, path, params })
      const r = route(path)
      if (!r) throw new Error(`unexpected path ${path}`)
      if (r.kind === 'states') return { data: { results: [], next_page_results: false } }
      const n =
        typeof total === 'number' ? total : (total[`${token}:${r.parent}`] ?? total[token] ?? 0)
      const all = Array.from({ length: n }, (_, i) => row(r.kind as Kind, token, r.parent, i))
      if (r.kind === 'members') return { data: all }
      const perRaw = params['per_page']
      const per = perRaw === undefined ? PLANE_DEFAULT : Number(perRaw)
      if (!Number.isInteger(per) || per < 1 || per > PLANE_MAX)
        throw new Error(`per_page ${String(perRaw)} out of range`)
      let offset = 0
      const cursor = params['cursor']
      if (cursor !== undefined) {
        const [value, off, isPrev] = String(cursor).split(':')
        if (Number(value) !== per || isPrev !== '0') throw new Error(`bad cursor ${String(cursor)}`)
        offset = Number(off)
      }
      const results = all.slice(offset * per, offset * per + per)
      const more = (offset + 1) * per < all.length
      return {
        data: {
          next_cursor: `${per}:${offset + 1}:0`,
          prev_cursor: `${per}:${offset - 1}:1`,
          ...(opts.omitNextPageResults ? {} : { next_page_results: more }),
          prev_page_results: offset > 0,
          count: results.length,
          total_pages: Math.ceil(all.length / per),
          total_results: all.length,
          results,
        },
      }
    })
    return { get }
  }) as unknown as typeof axios.create)
  return { requests }
}

type Lister = (
  a: PlaneAdapter,
  c: Credentials,
  parent: string,
  p: QueryParams,
) => Promise<{ id: string }[]>

const LISTS: Array<[string, Kind, Lister]> = [
  ['listProjects', 'projects', (a, c, _parent, p) => a.listProjects(c, p)],
  ['listTasks', 'work-items', (a, c, parent, p) => a.listTasks(c, parent, p)],
  ['listUsers', 'members', (a, c, _parent, p) => a.listUsers(c, 'ws', p)],
]

/** Canonical ids the adapter surfaces for rows n..n+count. */
function ids(kind: Kind, token: string, parent: string, from: number, count: number): string[] {
  const par = kind === 'work-items' ? parent : 'all'
  return Array.from({ length: count }, (_, i) => idOf(kind, token, par, from + i))
}

function adapter(): PlaneAdapter {
  return new PlaneAdapter({ clientId: 'id', clientSecret: 'secret', redirectUri: 'https://x' })
}

beforeEach(() => _resetCursorPager())
afterEach(() => vi.clearAllMocks())

describe.each(LISTS)('plane %s pages at the caller size', (_name, kind, list) => {
  it('N = 2L+1 rows at limit L: pages 1-3 serve every id once, in order, hasMore exact', async () => {
    const L = 40
    fakePlane(2 * L + 1)
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

  it('API path: parseListQuery + listPage walks the whole collection once', async () => {
    fakePlane(230)
    const a = adapter()
    const served: string[] = []
    for (let page = 1; page < 20; page++) {
      const params = parseListQuery({ limit: '25', page: String(page) })
      const env = listPage(await list(a, C1, 'p1', params), params, 'plane')
      served.push(...env.data.map((r) => r.id))
      if (env.meta.hasMore !== true) break
    }
    expect(served).toEqual(ids(kind, 'tok-1', 'p1', 0, 230))
  })

  it('two connections interleaved within the TTL each walk their own rows', async () => {
    const L = 40
    fakePlane(2 * L + 1)
    const a = adapter()
    const a1 = await list(a, C1, 'p1', withPageSink({ page: 1, limit: L }))
    const b2 = await list(a, C2, 'p1', withPageSink({ page: 2, limit: L }))
    const a2 = await list(a, C1, 'p1', withPageSink({ page: 2, limit: L }))
    expect(a1.map((r) => r.id)).toEqual(ids(kind, 'tok-1', 'p1', 0, L))
    expect(b2.map((r) => r.id)).toEqual(ids(kind, 'tok-2', 'p1', L, L))
    expect(a2.map((r) => r.id)).toEqual(ids(kind, 'tok-1', 'p1', L, L))
  })
})

describe.each(LISTS)('plane %s keeps one walk per connection', (_name, kind, list) => {
  it('a walk that reached its end on one connection does not end a longer one on another', async () => {
    const L = 40
    fakePlane({ 'tok-1': 2 * L + 1, 'tok-2': 4 * L })
    const a = adapter()
    for (let page = 1; page <= 3; page++) {
      await list(a, C1, 'p1', withPageSink({ page, limit: L }))
    }
    const params = withPageSink({ page: 4, limit: L })
    const rows = await list(a, C2, 'p1', params)
    expect(rows.map((r) => r.id)).toEqual(ids(kind, 'tok-2', 'p1', 3 * L, L))
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })
})

const CURSOR_LISTS = LISTS.filter(([, kind]) => kind !== 'members')

describe.each(CURSOR_LISTS)('plane %s sends the documented paging inputs', (_n, kind, list) => {
  const onList = (reqs: Req[]) => reqs.filter((r) => route(r.path)?.kind === kind)

  it('page 1 sends per_page = limit and no cursor; page 2 carries the returned next_cursor', async () => {
    const { requests } = fakePlane(250)
    const a = adapter()
    await list(a, C1, 'p1', withPageSink({ page: 1, limit: 50 }))
    await list(a, C1, 'p1', withPageSink({ page: 2, limit: 50 }))
    const reqs = onList(requests)
    expect(reqs).toHaveLength(2)
    expect(reqs[0]!.params['per_page']).toBe(50)
    expect(reqs[0]!.params['cursor']).toBeUndefined()
    expect(reqs[1]!.params['per_page']).toBe(50)
    expect(reqs[1]!.params['cursor']).toBe('50:1:0')
  })

  it('a limit above the documented maximum is clamped to 100 and reported as the page size', async () => {
    const { requests } = fakePlane(250)
    const a = adapter()
    const params = withPageSink({ page: 1, limit: 500 })
    const rows = await list(a, C1, 'p1', params)
    expect(onList(requests)[0]!.params['per_page']).toBe(PLANE_MAX)
    expect(rows).toHaveLength(PLANE_MAX)
    expect(readUpstreamPage(params)?.pageSize).toBe(PLANE_MAX)
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
  })

  it('a clamped walk serves every row once at the clamped size', async () => {
    fakePlane(250)
    const a = adapter()
    const served: string[] = []
    for (let page = 1; page <= 4; page++) {
      const params = withPageSink({ page, limit: 500 })
      served.push(...(await list(a, C1, 'p1', params)).map((r) => r.id))
      if (readUpstreamPage(params)?.hasMore !== true) break
    }
    expect(served).toEqual(ids(kind, 'tok-1', 'p1', 0, 250))
  })

  it('stops on next_page_results = false even though next_cursor is always set', async () => {
    const { requests } = fakePlane(30)
    const a = adapter()
    const p1 = withPageSink({ page: 1, limit: 50 })
    expect(await list(a, C1, 'p1', p1)).toHaveLength(30)
    expect(readUpstreamPage(p1)?.hasMore).toBe(false)
    const p2 = withPageSink({ page: 2, limit: 50 })
    expect(await list(a, C1, 'p1', p2)).toEqual([])
    expect(readUpstreamPage(p2)?.hasMore).toBe(false)
    expect(onList(requests)).toHaveLength(1)
  })
})

describe('plane listUsers pages the unpaginated members list locally', () => {
  it('sends no paging parameters and reports pagedLocally', async () => {
    const { requests } = fakePlane(30)
    const params = withPageSink({ page: 2, limit: 10 })
    const rows = await adapter().listUsers(C1, 'ws', params)
    expect(rows.map((r) => r.id)).toEqual(ids('members', 'tok-1', 'all', 10, 10))
    expect(requests).toHaveLength(1)
    expect(requests[0]!.params).toEqual({})
    expect(readUpstreamPage(params)).toMatchObject({
      pagedLocally: true,
      totalCount: 30,
      hasMore: true,
    })
  })
})

describe.each(CURSOR_LISTS)('plane %s keys each walk by its page size', (_n, kind, list) => {
  it('a limit change mid-walk starts a fresh walk instead of reusing a cursor minted at the old size', async () => {
    // Plane's cursor is `per_page:offset:is_prev`, so a cursor minted at
    // per_page=50 is meaningless at per_page=40 (the fake rejects it).
    const { requests } = fakePlane(250)
    const a = adapter()
    await list(a, C1, 'p1', withPageSink({ page: 1, limit: 50 }))
    await list(a, C1, 'p1', withPageSink({ page: 2, limit: 50 }))
    const params = withPageSink({ page: 3, limit: 40 })
    const rows = await list(a, C1, 'p1', params)
    expect(rows.map((r) => r.id)).toEqual(ids(kind, 'tok-1', 'p1', 80, 40))
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
    const at40 = requests.filter((r) => route(r.path)?.kind === kind && r.params['per_page'] === 40)
    expect(at40.some((r) => String(r.params['cursor'] ?? '').startsWith('50:'))).toBe(false)
  })
})

describe('plane keeps one walk per collection and per project', () => {
  it('a finished work-items walk on one project does not end the walk on another', async () => {
    fakePlane({ 'tok-1:p1': 30, 'tok-1:p2': 200 })
    const a = adapter()
    const first = withPageSink({ page: 1, limit: 50 })
    await a.listTasks(C1, 'p1', first)
    expect(readUpstreamPage(first)?.hasMore).toBe(false)
    const params = withPageSink({ page: 2, limit: 50 })
    const rows = await a.listTasks(C1, 'p2', params)
    expect(rows.map((r) => r.id)).toEqual(ids('work-items', 'tok-1', 'p2', 50, 50))
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
  })

  it('a finished projects walk does not end a work-items walk', async () => {
    fakePlane({ 'tok-1:all': 30, 'tok-1:p1': 200 })
    const a = adapter()
    const first = withPageSink({ page: 1, limit: 50 })
    await a.listProjects(C1, first)
    expect(readUpstreamPage(first)?.hasMore).toBe(false)
    const params = withPageSink({ page: 2, limit: 50 })
    const rows = await a.listTasks(C1, 'p1', params)
    expect(rows.map((r) => r.id)).toEqual(ids('work-items', 'tok-1', 'p1', 50, 50))
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
  })
})

describe.each(CURSOR_LISTS)('plane %s trusts only next_page_results', (_n, kind, list) => {
  it('a page without next_page_results ends the walk, although next_cursor is set', async () => {
    const { requests } = fakePlane(250, [], { omitNextPageResults: true })
    const a = adapter()
    const params = withPageSink({ page: 1, limit: 50 })
    expect(await list(a, C1, 'p1', params)).toHaveLength(50)
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
    expect(requests.filter((r) => route(r.path)?.kind === kind)).toHaveLength(1)
  })
})
