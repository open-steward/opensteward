/**
 * Fieldwire pages its list endpoints with a `Fieldwire-Per-Page` request
 * header ("Number of items returned (default: 50, max: 1000)") and a
 * `last_synced_at` query parameter set from the previous response's
 * `X-Last-Synced-At` header; `X-Has-More` says whether another page exists
 * (https://developers.fieldwire.com/docs/pagination).
 *
 * `GET /api/v3/account/projects/{project_id}/users` documents neither the
 * header nor the query parameter, and no `X-Has-More` response header
 * (https://developers.fieldwire.com/reference/get_projects_users_in_account_project):
 * it returns the whole list, so the adapter pages it locally.
 *
 * Every list used to read only `params.cursor`, so caller page 2 repeated
 * page 1. The fake honours ONLY the documented paging inputs.
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
import { FieldwireAdapter } from '../../../../../../src/verticals/projects/adapters/fieldwire/index'

vi.mock('axios')

const C1: Credentials = { accessToken: 'api-token-1', extra: {} }
const C2: Credentials = { accessToken: 'api-token-2', extra: {} }

/** Documented default and maximum of `Fieldwire-Per-Page`. */
const FW_DEFAULT = 50
const FW_MAX = 1000

interface Req {
  jwt: string
  path: string
  params: Record<string, unknown>
  headers: Record<string, unknown>
}

type Kind = 'projects' | 'tasks' | 'entity_tags' | 'bubbles' | 'users'

function pathFor(kind: Kind, parent: string): string {
  switch (kind) {
    case 'projects':
      return '/projects'
    case 'tasks':
      return `/projects/${parent}/tasks`
    case 'entity_tags':
      return `/projects/${parent}/entity_tags`
    case 'bubbles':
      return `/projects/${parent}/tasks/t1/bubbles`
    case 'users':
      return `/account/projects/${parent}/users`
  }
}

function idOf(kind: Kind, jwt: string, parent: string, n: number): string {
  return `${kind}-${jwt}-${parent}-${String(n).padStart(4, '0')}`
}

/**
 * Row n of a (token, parent) collection was last updated n seconds after that
 * collection's own base, so timestamps are distinct and ordered. The base is
 * offset per token and per parent, far apart, so a `last_synced_at` cursor
 * borrowed from another connection or parent lands on the wrong rows: a pager
 * key that is not per connection and per path cannot pass the interleave tests.
 */
function baseOffsetSeconds(jwt: string, parent: string): number {
  return (jwt === 'api-token-2' ? 100_000 : 0) + (parent === 'p2' ? 200_000 : 0)
}

function stamp(n: number, jwt = 'api-token-1', parent = 'p1'): string {
  return new Date(
    Date.UTC(2024, 0, 1) + (baseOffsetSeconds(jwt, parent) + n + 1) * 1000,
  ).toISOString()
}

/** The parent a kind's rows are generated under (projects are unparented). */
function parentOf(kind: Kind, parent: string): string {
  return kind === 'projects' ? 'all' : parent
}

function row(kind: Kind, jwt: string, parent: string, n: number): Record<string, unknown> {
  const id = idOf(kind, jwt, parent, n)
  const base = { id, created_at: stamp(n, jwt, parent), updated_at: stamp(n, jwt, parent) }
  switch (kind) {
    case 'projects':
      return { ...base, name: id, account_id: 1 }
    case 'tasks':
      return { ...base, name: id, project_id: parent }
    case 'entity_tags':
      return { ...base, name: id, project_id: parent }
    case 'bubbles':
      return { ...base, content: id, project_id: parent, task_id: 't1' }
    case 'users':
      return { ...base, first_name: id, last_name: 'X', email: `${id}@example.com` }
  }
}

/**
 * One Fieldwire endpoint holding `total` rows per (token, parent).
 * Cursor endpoints honour only `Fieldwire-Per-Page` and `last_synced_at`;
 * the users endpoint honours nothing and returns every row.
 */
function fakeFieldwire(kind: Kind, total: number, requests: Req[] = []) {
  vi.mocked(axios.post).mockImplementation((async (_url: string, body: { api_token: string }) => ({
    data: { access_token: `jwt:${body.api_token}` },
  })) as unknown as typeof axios.post)
  vi.mocked(axios.create).mockImplementation(((config?: { headers?: Record<string, unknown> }) => {
    const jwt = String(config?.headers?.['Authorization'] ?? '').replace(/^Bearer jwt:/, '')
    const get = vi.fn(
      async (
        path: string,
        cfg?: { params?: Record<string, unknown>; headers?: Record<string, unknown> },
      ) => {
        const params = { ...(cfg?.params ?? {}) }
        const headers = { ...(cfg?.headers ?? {}) }
        requests.push({ jwt, path, params, headers })
        const m =
          kind === 'projects'
            ? path === '/projects'
              ? ['', 'all']
              : null
            : path.match(new RegExp(`^${pathFor(kind, '__P__').replace('__P__', '([^/]+)')}$`))
        if (!m) throw new Error(`unexpected path ${path}`)
        const parent = m[1]!
        const all = Array.from({ length: total }, (_, i) => row(kind, jwt, parent, i))
        if (kind === 'users') return { data: all, headers: {} }
        const perRaw = headers['Fieldwire-Per-Page']
        const per = perRaw === undefined ? FW_DEFAULT : Number(perRaw)
        if (!Number.isInteger(per) || per < 1 || per > FW_MAX)
          throw new Error(`Fieldwire-Per-Page ${String(perRaw)} out of range`)
        const since = params['last_synced_at']
        const rest =
          typeof since === 'string' ? all.filter((r) => String(r['updated_at']) > since) : all
        const page = rest.slice(0, per)
        const last = page.length > 0 ? String(page[page.length - 1]!['updated_at']) : String(since)
        return {
          data: page,
          headers: {
            'x-count': String(page.length),
            'x-has-more': String(rest.length > per),
            'x-last-synced-at': last,
          },
        }
      },
    )
    return { get }
  }) as unknown as typeof axios.create)
  return { requests }
}

type Lister = (
  a: FieldwireAdapter,
  c: Credentials,
  parent: string,
  p: QueryParams,
) => Promise<{ id: string }[]>

const LISTS: Array<[string, Kind, Lister]> = [
  ['listProjects', 'projects', (a, c, _parent, p) => a.listProjects(c, p)],
  ['listTasks', 'tasks', (a, c, parent, p) => a.listTasks(c, parent, p)],
  ['listTags', 'entity_tags', (a, c, parent, p) => a.listTags(c, parent, p)],
  ['listComments', 'bubbles', (a, c, parent, p) => a.listComments(c, `${parent}:t1`, p)],
  ['listUsers', 'users', (a, c, parent, p) => a.listUsers(c, parent, p)],
]

function ids(kind: Kind, token: string, parent: string, from: number, n: number): string[] {
  const par = kind === 'projects' ? 'all' : parent
  return Array.from({ length: n }, (_, i) => idOf(kind, token, par, from + i))
}

beforeEach(() => _resetCursorPager())
afterEach(() => vi.clearAllMocks())

describe('fieldwire declares the documented page maximum', () => {
  it('capabilities.maxPageSize is 1000', () => {
    expect(new FieldwireAdapter().capabilities.maxPageSize).toBe(FW_MAX)
  })
})

describe.each(LISTS)('fieldwire %s pages at the caller size', (_name, kind, list) => {
  it('N = 2L+1 rows at limit L: pages 1-3 serve every id once, in order, hasMore exact', async () => {
    const L = 120
    fakeFieldwire(kind, 2 * L + 1)
    const adapter = new FieldwireAdapter()
    const served: string[] = []
    const more: Array<boolean | undefined> = []
    for (let page = 1; page <= 3; page++) {
      const params = withPageSink({ page, limit: L })
      const rows = await list(adapter, C1, 'p1', params)
      served.push(...rows.map((r) => r.id))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(served).toEqual(ids(kind, 'api-token-1', 'p1', 0, 2 * L + 1))
    expect(more).toEqual([true, true, false])
  })

  it('API path: parseListQuery + listPage walks the whole collection once', async () => {
    fakeFieldwire(kind, 230)
    const adapter = new FieldwireAdapter()
    const served: string[] = []
    for (let page = 1; page < 20; page++) {
      const params = parseListQuery({ limit: '25', page: String(page) }, adapter)
      const env = listPage(await list(adapter, C1, 'p1', params), params, 'fieldwire')
      served.push(...env.data.map((r) => r.id))
      if (env.meta.hasMore !== true) break
    }
    expect(served).toEqual(ids(kind, 'api-token-1', 'p1', 0, 230))
  })

  it('two connections interleaved within the TTL each walk their own rows', async () => {
    const L = 120
    fakeFieldwire(kind, 2 * L + 1)
    const adapter = new FieldwireAdapter()
    const a1 = await list(adapter, C1, 'p1', withPageSink({ page: 1, limit: L }))
    const b2 = await list(adapter, C2, 'p1', withPageSink({ page: 2, limit: L }))
    const a2 = await list(adapter, C1, 'p1', withPageSink({ page: 2, limit: L }))
    expect(a1.map((r) => r.id)).toEqual(ids(kind, 'api-token-1', 'p1', 0, L))
    expect(b2.map((r) => r.id)).toEqual(ids(kind, 'api-token-2', 'p1', L, L))
    expect(a2.map((r) => r.id)).toEqual(ids(kind, 'api-token-1', 'p1', L, L))
  })

  it.runIf(kind !== 'projects')('two parents interleaved each walk their own rows', async () => {
    const L = 120
    fakeFieldwire(kind, 2 * L + 1)
    const adapter = new FieldwireAdapter()
    const a1 = await list(adapter, C1, 'p1', withPageSink({ page: 1, limit: L }))
    const b2 = await list(adapter, C1, 'p2', withPageSink({ page: 2, limit: L }))
    const a2 = await list(adapter, C1, 'p1', withPageSink({ page: 2, limit: L }))
    expect(a1.map((r) => r.id)).toEqual(ids(kind, 'api-token-1', 'p1', 0, L))
    expect(b2.map((r) => r.id)).toEqual(ids(kind, 'api-token-1', 'p2', L, L))
    expect(a2.map((r) => r.id)).toEqual(ids(kind, 'api-token-1', 'p1', L, L))
  })
})

const CURSOR_LISTS = LISTS.filter(([, kind]) => kind !== 'users')

describe.each(CURSOR_LISTS)('fieldwire %s sends the documented paging inputs', (_n, kind, list) => {
  it('page 1 sends Fieldwire-Per-Page = limit; page 2 carries last_synced_at from X-Last-Synced-At', async () => {
    const { requests } = fakeFieldwire(kind, 250)
    const adapter = new FieldwireAdapter()
    await list(adapter, C1, 'p1', withPageSink({ page: 1, limit: 100 }))
    await list(adapter, C1, 'p1', withPageSink({ page: 2, limit: 100 }))
    expect(requests).toHaveLength(2)
    expect(requests[0]!.headers['Fieldwire-Per-Page']).toBe('100')
    expect(requests[0]!.params['last_synced_at']).toBeUndefined()
    expect(requests[1]!.headers['Fieldwire-Per-Page']).toBe('100')
    expect(requests[1]!.params['last_synced_at']).toBe(
      stamp(99, 'api-token-1', parentOf(kind, 'p1')),
    )
  })

  it('changing the limit between pages never reuses a cursor stored at another size', async () => {
    fakeFieldwire(kind, 300)
    const adapter = new FieldwireAdapter()
    const p1 = await list(adapter, C1, 'p1', withPageSink({ page: 1, limit: 25 }))
    const p2 = await list(adapter, C1, 'p1', withPageSink({ page: 2, limit: 100 }))
    expect(p1.map((r) => r.id)).toEqual(ids(kind, 'api-token-1', 'p1', 0, 25))
    expect(p2.map((r) => r.id)).toEqual(ids(kind, 'api-token-1', 'p1', 100, 100))
  })

  it('an explicit cursor param is sent as last_synced_at and names the upstream page directly', async () => {
    const { requests } = fakeFieldwire(kind, 40)
    const adapter = new FieldwireAdapter()
    const cursor = stamp(9, 'api-token-1', parentOf(kind, 'p1'))
    const params = withPageSink({ page: 1, limit: 5 })
    params['cursor'] = cursor
    const rows = await list(adapter, C1, 'p1', params)
    expect(requests).toHaveLength(1)
    expect(requests[0]!.params['last_synced_at']).toBe(cursor)
    expect(requests[0]!.headers['Fieldwire-Per-Page']).toBe('5')
    expect(rows.map((r) => r.id)).toEqual(ids(kind, 'api-token-1', 'p1', 10, 5))
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
  })

  it('a limit above the documented maximum is clamped to 1000 and reported as the page size', async () => {
    const { requests } = fakeFieldwire(kind, 1500)
    const adapter = new FieldwireAdapter()
    const params = withPageSink({ page: 1, limit: 5000 })
    const rows = await list(adapter, C1, 'p1', params)
    expect(requests[0]!.headers['Fieldwire-Per-Page']).toBe('1000')
    expect(rows.map((r) => r.id)).toEqual(ids(kind, 'api-token-1', 'p1', 0, 1000))
    expect(readUpstreamPage(params)).toMatchObject({ hasMore: true, pageSize: 1000 })
    // Through the router the declared maximum caps the limit before the adapter sees it.
    const routed = parseListQuery({ limit: '5000' }, adapter)
    expect(routed.limit).toBeLessThanOrEqual(FW_MAX)
  })
})

describe('fieldwire listUsers pages the whole list locally', () => {
  it('sends no undocumented paging input and slices the full response', async () => {
    const { requests } = fakeFieldwire('users', 7)
    const adapter = new FieldwireAdapter()
    const params = withPageSink({ page: 2, limit: 3 })
    const rows = await adapter.listUsers(C1, 'p1', params)
    expect(rows.map((r) => r.id)).toEqual(ids('users', 'api-token-1', 'p1', 3, 3))
    expect(readUpstreamPage(params)).toMatchObject({
      totalCount: 7,
      hasMore: true,
      pagedLocally: true,
    })
    expect(requests[0]!.headers['Fieldwire-Per-Page']).toBeUndefined()
    expect(requests[0]!.params['last_synced_at']).toBeUndefined()
  })
})
