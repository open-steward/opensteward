/**
 * Nuclino pages GET /v0/teams, /v0/workspaces and /v0/items with `limit`
 * ("Number between 1 and 100 to limit the results", default 100) and `after`
 * ("Only return … that come after the given … ID (used for pagination usually
 * in combination with the limit parameter)"). The response is
 * `{ data: { object: "list", results } }` with no next token, so the next
 * page starts after the last id of a full page, and a short page is the end.
 * https://help.nuclino.com/b72e5fdd-teams
 * https://help.nuclino.com/702467a8-workspaces
 * https://help.nuclino.com/fa38d15f-items-and-collections
 *
 * Every list used to read only `params.cursor`, so caller page 2 repeated
 * page 1. The fake honours ONLY `limit` and `after` (and the documented
 * teamId / workspaceId filters).
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
import { NuclinoAdapter } from '../../../../../../src/verticals/projects/adapters/nuclino/index'

vi.mock('axios')

const C1: Credentials = { accessToken: 'key-1', extra: {} }
const C2: Credentials = { accessToken: 'key-2', extra: {} }

/** Documented default and maximum of `limit`. */
const NU_DEFAULT = 100
const NU_MAX = 100

type Kind = 'teams' | 'workspaces' | 'items'

interface Req {
  key: string
  path: string
  params: Record<string, unknown>
}

function idOf(kind: Kind, key: string, scope: string, n: number): string {
  return `${kind}-${key}-${scope}-${String(n).padStart(4, '0')}`
}

function row(kind: Kind, key: string, scope: string, n: number): Record<string, unknown> {
  const id = idOf(kind, key, scope, n)
  const base = { id, createdAt: '2024-01-01T00:00:00.000Z', createdUserId: 'u1' }
  switch (kind) {
    case 'teams':
      return { ...base, object: 'team', name: id, url: `https://app.nuclino.com/${id}` }
    case 'workspaces':
      return { ...base, object: 'workspace', name: id, teamId: 't1', fields: [], childIds: [] }
    case 'items':
      return {
        ...base,
        object: 'item',
        title: id,
        workspaceId: scope,
        url: `https://app.nuclino.com/t/b/${id}`,
        lastUpdatedAt: '2024-01-02T00:00:00.000Z',
        lastUpdatedUserId: 'u1',
      }
  }
}

/** Nuclino list endpoints holding `total` rows per (API key, workspace). */
function fakeNuclino(kinds: Kind | Kind[], total: number, requests: Req[] = []) {
  const served = Array.isArray(kinds) ? kinds : [kinds]
  vi.mocked(axios.create).mockImplementation(((config?: { headers?: Record<string, unknown> }) => {
    const key = String(config?.headers?.['Authorization'] ?? '')
    const get = vi.fn(async (path: string, cfg?: { params?: Record<string, unknown> }) => {
      const params = { ...(cfg?.params ?? {}) }
      requests.push({ key, path, params })
      const kind = served.find((k) => path === `/${k}`)
      if (kind === undefined) throw new Error(`unexpected path ${path}`)
      const scope = kind === 'items' ? String(params['workspaceId'] ?? '') : 'all'
      const all = Array.from({ length: total }, (_, i) => row(kind, key, scope, i))
      const limRaw = params['limit']
      const lim = limRaw === undefined ? NU_DEFAULT : Number(limRaw)
      if (!Number.isInteger(lim) || lim < 1 || lim > NU_MAX)
        throw new Error(`limit ${String(limRaw)} out of range`)
      const after = params['after']
      let start = 0
      if (after !== undefined) {
        const at = all.findIndex((r) => r['id'] === after)
        if (at < 0) throw new Error(`after ${String(after)} not in this collection`)
        start = at + 1
      }
      return {
        data: {
          status: 'success',
          data: { object: 'list', results: all.slice(start, start + lim) },
        },
      }
    })
    return { get }
  }) as unknown as typeof axios.create)
  return { requests }
}

type Lister = (
  a: NuclinoAdapter,
  c: Credentials,
  parent: string,
  p: QueryParams,
) => Promise<{ id: string }[]>

const LISTS: Array<[string, Kind, Lister]> = [
  ['listWorkspaces', 'teams', (a, c, _parent, p) => a.listWorkspaces(c, p)],
  ['listProjects', 'workspaces', (a, c, _parent, p) => a.listProjects(c, p)],
  ['listTasks', 'items', (a, c, parent, p) => a.listTasks(c, parent, p)],
]

function ids(kind: Kind, key: string, parent: string, from: number, n: number): string[] {
  const scope = kind === 'items' ? parent : 'all'
  return Array.from({ length: n }, (_, i) => idOf(kind, key, scope, from + i))
}

beforeEach(() => _resetCursorPager())
afterEach(() => vi.clearAllMocks())

describe('nuclino declares the documented page maximum', () => {
  it('capabilities.maxPageSize is 100', () => {
    expect(new NuclinoAdapter().capabilities.maxPageSize).toBe(NU_MAX)
  })
})

describe.each(LISTS)('nuclino %s pages at the caller size', (_name, kind, list) => {
  it('N = 2L+1 rows at limit L: pages 1-3 serve every id once, in order, hasMore exact', async () => {
    const L = 40
    fakeNuclino(kind, 2 * L + 1)
    const adapter = new NuclinoAdapter()
    const served: string[] = []
    const more: Array<boolean | undefined> = []
    for (let page = 1; page <= 3; page++) {
      const params = withPageSink({ page, limit: L })
      const rows = await list(adapter, C1, 'w1', params)
      served.push(...rows.map((r) => r.id))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(served).toEqual(ids(kind, 'key-1', 'w1', 0, 2 * L + 1))
    expect(more).toEqual([true, true, false])
  })

  it('page 1 sends limit only; page 2 carries after = the last id of page 1', async () => {
    const { requests } = fakeNuclino(kind, 25)
    const adapter = new NuclinoAdapter()
    await list(adapter, C1, 'w1', withPageSink({ page: 1, limit: 10 }))
    await list(adapter, C1, 'w1', withPageSink({ page: 2, limit: 10 }))
    expect(requests).toHaveLength(2)
    expect(requests[0]!.params['limit']).toBe(10)
    expect(requests[0]!.params['after']).toBeUndefined()
    expect(requests[1]!.params['limit']).toBe(10)
    expect(requests[1]!.params['after']).toBe(ids(kind, 'key-1', 'w1', 9, 1)[0])
  })

  it('a limit above the documented maximum is clamped to 100 and reported as the page size', async () => {
    const { requests } = fakeNuclino(kind, 150)
    const adapter = new NuclinoAdapter()
    const params = withPageSink({ page: 1, limit: 500 })
    const rows = await list(adapter, C1, 'w1', params)
    expect(requests[0]!.params['limit']).toBe(NU_MAX)
    expect(rows.map((r) => r.id)).toEqual(ids(kind, 'key-1', 'w1', 0, NU_MAX))
    expect(readUpstreamPage(params)).toMatchObject({ hasMore: true, pageSize: NU_MAX })
    const routed = parseListQuery({ limit: '500' }, adapter)
    expect(routed.limit).toBeLessThanOrEqual(NU_MAX)
  })

  it('API path: parseListQuery + listPage walks the whole collection once', async () => {
    fakeNuclino(kind, 230)
    const adapter = new NuclinoAdapter()
    const served: string[] = []
    for (let page = 1; page < 20; page++) {
      const params = parseListQuery({ limit: '25', page: String(page) }, adapter)
      const env = listPage(await list(adapter, C1, 'w1', params), params, 'nuclino')
      served.push(...env.data.map((r) => r.id))
      if (env.meta.hasMore !== true) break
    }
    expect(served).toEqual(ids(kind, 'key-1', 'w1', 0, 230))
  })

  it('two connections interleaved within the TTL each walk their own rows', async () => {
    const L = 10
    fakeNuclino(kind, 2 * L + 1)
    const adapter = new NuclinoAdapter()
    const a1 = await list(adapter, C1, 'w1', withPageSink({ page: 1, limit: L }))
    const b2 = await list(adapter, C2, 'w1', withPageSink({ page: 2, limit: L }))
    const a2 = await list(adapter, C1, 'w1', withPageSink({ page: 2, limit: L }))
    expect(a1.map((r) => r.id)).toEqual(ids(kind, 'key-1', 'w1', 0, L))
    expect(b2.map((r) => r.id)).toEqual(ids(kind, 'key-2', 'w1', L, L))
    expect(a2.map((r) => r.id)).toEqual(ids(kind, 'key-1', 'w1', L, L))
  })

  it('an explicit cursor param is sent as after and names the upstream page directly', async () => {
    const { requests } = fakeNuclino(kind, 40)
    const adapter = new NuclinoAdapter()
    const params = withPageSink({ page: 1, limit: 5 })
    params['cursor'] = ids(kind, 'key-1', 'w1', 9, 1)[0]
    const rows = await list(adapter, C1, 'w1', params)
    expect(requests).toHaveLength(1)
    expect(requests[0]!.params['after']).toBe(params['cursor'])
    expect(rows.map((r) => r.id)).toEqual(ids(kind, 'key-1', 'w1', 10, 5))
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
  })

  it('an explicit cursor reaching a short page reports hasMore false', async () => {
    const { requests } = fakeNuclino(kind, 40)
    const adapter = new NuclinoAdapter()
    const params = withPageSink({ page: 1, limit: 5 })
    params['cursor'] = ids(kind, 'key-1', 'w1', 36, 1)[0]
    const rows = await list(adapter, C1, 'w1', params)
    expect(requests).toHaveLength(1)
    expect(rows.map((r) => r.id)).toEqual(ids(kind, 'key-1', 'w1', 37, 3))
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('the same connection walked at two limits keeps a walk per limit', async () => {
    fakeNuclino(kind, 60)
    const adapter = new NuclinoAdapter()
    const a1 = await list(adapter, C1, 'w1', withPageSink({ page: 1, limit: 10 }))
    const b2 = await list(adapter, C1, 'w1', withPageSink({ page: 2, limit: 20 }))
    expect(a1.map((r) => r.id)).toEqual(ids(kind, 'key-1', 'w1', 0, 10))
    expect(b2.map((r) => r.id)).toEqual(ids(kind, 'key-1', 'w1', 20, 20))
  })
})

describe('nuclino keys each walk by collection', () => {
  it('listWorkspaces page 1 then listProjects page 2 on one connection', async () => {
    const L = 10
    fakeNuclino(['teams', 'workspaces'], 2 * L + 1)
    const adapter = new NuclinoAdapter()
    const t1 = await adapter.listWorkspaces(C1, withPageSink({ page: 1, limit: L }))
    const w2 = await adapter.listProjects(C1, withPageSink({ page: 2, limit: L }))
    const t2 = await adapter.listWorkspaces(C1, withPageSink({ page: 2, limit: L }))
    expect(t1.map((r) => r.id)).toEqual(ids('teams', 'key-1', 'w1', 0, L))
    expect(w2.map((r) => r.id)).toEqual(ids('workspaces', 'key-1', 'w1', L, L))
    expect(t2.map((r) => r.id)).toEqual(ids('teams', 'key-1', 'w1', L, L))
  })
})

describe('nuclino listTasks keys its walk per workspace', () => {
  it('two workspaces interleaved each walk their own rows', async () => {
    const L = 10
    fakeNuclino('items', 2 * L + 1)
    const adapter = new NuclinoAdapter()
    const a1 = await adapter.listTasks(C1, 'w1', withPageSink({ page: 1, limit: L }))
    const b2 = await adapter.listTasks(C1, 'w2', withPageSink({ page: 2, limit: L }))
    const a2 = await adapter.listTasks(C1, 'w1', withPageSink({ page: 2, limit: L }))
    expect(a1.map((r) => r.id)).toEqual(ids('items', 'key-1', 'w1', 0, L))
    expect(b2.map((r) => r.id)).toEqual(ids('items', 'key-1', 'w2', L, L))
    expect(a2.map((r) => r.id)).toEqual(ids('items', 'key-1', 'w1', L, L))
  })
})
