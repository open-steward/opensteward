/**
 * Ruddr list endpoints use cursor pagination: `limit` ("Can be any number
 * from 1 to 100. Defaults to 10, if not provided.") and `startingAfter`
 * ("A cursor ID (`uuid`) used to request the next page of results"), with a
 * `{ results, hasMore }` envelope (OpenAPI parameters, e.g.
 * https://docs.ruddr.io/api-reference/projects/list-projects.md). The
 * documented walk is: "use the `id` of the last item in each response as the
 * `startingAfter` cursor for the next request. Continue until `hasMore` is
 * `false`." (https://docs.ruddr.io/guides/pagination)
 *
 * listProjects and listUsers used to send only `limit`, so caller page 2
 * repeated page 1. The fake honours ONLY `limit` and `startingAfter`.
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
import { RuddrAdapter } from '../../../../../../src/verticals/projects/adapters/ruddr/index'

vi.mock('axios')

const C1: Credentials = { accessToken: 'key-1', extra: {} }
const C2: Credentials = { accessToken: 'key-2', extra: {} }

/** Documented default and maximum of `limit`. */
const RUDDR_DEFAULT = 10
const RUDDR_MAX = 100

interface Req {
  token: string
  path: string
  params: Record<string, unknown>
}

type Kind = 'projects' | 'members'

function idOf(kind: Kind, token: string, n: number): string {
  return `${kind}-${token}-${String(n).padStart(4, '0')}`
}

function row(kind: Kind, token: string, n: number): Record<string, unknown> {
  const id = idOf(kind, token, n)
  return kind === 'projects'
    ? { id, name: id, statusId: 'in_progress', recordStatusId: 'active' }
    : { id, name: id, email: `${id}@example.com`, isActive: true }
}

/** One Ruddr collection of `total` rows per API key, honouring only `limit` and `startingAfter`. */
function fakeRuddr(kind: Kind, total: number, requests: Req[] = []) {
  vi.mocked(axios.create).mockImplementation(((config?: { headers?: Record<string, unknown> }) => {
    const token = String(config?.headers?.['Authorization'] ?? '').replace(/^Bearer /, '')
    const get = vi.fn(async (path: string, cfg?: { params?: Record<string, unknown> }) => {
      const params = { ...(cfg?.params ?? {}) }
      requests.push({ token, path, params })
      if (path !== `/${kind}`) throw new Error(`unexpected path ${path}`)
      const all = Array.from({ length: total }, (_, i) => row(kind, token, i))
      const limRaw = params['limit']
      const lim = limRaw === undefined ? RUDDR_DEFAULT : Number(limRaw)
      if (!Number.isInteger(lim) || lim < 1 || lim > RUDDR_MAX)
        throw new Error(`limit ${String(limRaw)} out of range`)
      const after = params['startingAfter']
      let start = 0
      if (after !== undefined) {
        const idx = all.findIndex((r) => r['id'] === after)
        if (idx < 0) throw new Error(`unknown cursor ${String(after)}`)
        start = idx + 1
      }
      const results = all.slice(start, start + lim)
      return { data: { results, hasMore: start + lim < all.length } }
    })
    return { get }
  }) as unknown as typeof axios.create)
  return { requests }
}

type Lister = (a: RuddrAdapter, c: Credentials, p: QueryParams) => Promise<{ id: string }[]>

const LISTS: Array<[string, Kind, Lister]> = [
  ['listProjects', 'projects', (a, c, p) => a.listProjects(c, p)],
  ['listUsers', 'members', (a, c, p) => a.listUsers(c, 'ws', p)],
]

function ids(kind: Kind, token: string, from: number, n: number): string[] {
  return Array.from({ length: n }, (_, i) => idOf(kind, token, from + i))
}

beforeEach(() => _resetCursorPager())
afterEach(() => vi.clearAllMocks())

describe.each(LISTS)('ruddr %s pages by startingAfter', (_name, kind, list) => {
  it('N = 2L+1 rows at limit L: pages 1-3 serve every id once, in order, hasMore exact', async () => {
    const L = 40
    fakeRuddr(kind, 2 * L + 1)
    const adapter = new RuddrAdapter()
    const served: string[] = []
    const more: Array<boolean | undefined> = []
    for (let page = 1; page <= 3; page++) {
      const params = withPageSink({ page, limit: L })
      const rows = await list(adapter, C1, params)
      served.push(...rows.map((r) => r.id))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(served).toEqual(ids(kind, 'key-1', 0, 2 * L + 1))
    expect(more).toEqual([true, true, false])
  })

  it('the page-2 request carries startingAfter = the last id of page 1', async () => {
    const L = 5
    const { requests } = fakeRuddr(kind, 2 * L + 1)
    const adapter = new RuddrAdapter()
    await list(adapter, C1, withPageSink({ page: 1, limit: L }))
    await list(adapter, C1, withPageSink({ page: 2, limit: L }))
    expect(requests[0]!.params['startingAfter']).toBeUndefined()
    expect(requests[1]!.params).toEqual({ limit: L, startingAfter: idOf(kind, 'key-1', L - 1) })
  })

  it('a limit above the documented maximum is clamped to 100 and the size reported', async () => {
    const { requests } = fakeRuddr(kind, 250)
    const adapter = new RuddrAdapter()
    const p1 = withPageSink({ page: 1, limit: 500 })
    const r1 = await list(adapter, C1, p1)
    expect(requests[0]!.params['limit']).toBe(RUDDR_MAX)
    expect(r1.map((r) => r.id)).toEqual(ids(kind, 'key-1', 0, RUDDR_MAX))
    expect(readUpstreamPage(p1)).toMatchObject({ hasMore: true, pageSize: RUDDR_MAX })
    const p3 = withPageSink({ page: 3, limit: 500 })
    const r3 = await list(adapter, C1, p3)
    expect(r3.map((r) => r.id)).toEqual(ids(kind, 'key-1', 200, 50))
    expect(readUpstreamPage(p3)?.hasMore).toBe(false)
  })

  it('API path: parseListQuery + listPage walks the whole collection once', async () => {
    fakeRuddr(kind, 57)
    const adapter = new RuddrAdapter()
    const served: string[] = []
    for (let page = 1; page < 20; page++) {
      const params = parseListQuery({ limit: '10', page: String(page) })
      const env = listPage(await list(adapter, C1, params), params, 'ruddr')
      served.push(...env.data.map((r) => r.id))
      if (env.meta.hasMore !== true) break
    }
    expect(served).toEqual(ids(kind, 'key-1', 0, 57))
  })

  it('two connections interleaved within the TTL each walk their own rows', async () => {
    const L = 5
    fakeRuddr(kind, 2 * L + 1)
    const adapter = new RuddrAdapter()
    const a1 = await list(adapter, C1, withPageSink({ page: 1, limit: L }))
    const b2 = await list(adapter, C2, withPageSink({ page: 2, limit: L }))
    const a2 = await list(adapter, C1, withPageSink({ page: 2, limit: L }))
    expect(a1.map((r) => r.id)).toEqual(ids(kind, 'key-1', 0, L))
    expect(b2.map((r) => r.id)).toEqual(ids(kind, 'key-2', L, L))
    expect(a2.map((r) => r.id)).toEqual(ids(kind, 'key-1', L, L))
  })

  it('a cursor saved at one limit is not reused at another limit', async () => {
    fakeRuddr(kind, 60)
    const adapter = new RuddrAdapter()
    await list(adapter, C1, withPageSink({ page: 1, limit: 10 }))
    const r2 = await list(adapter, C1, withPageSink({ page: 2, limit: 20 }))
    expect(r2.map((r) => r.id)).toEqual(ids(kind, 'key-1', 20, 20))
  })

  it('no caller limit sends the adapter default (100) and reports it', async () => {
    const { requests } = fakeRuddr(kind, 150)
    const adapter = new RuddrAdapter()
    const p1 = withPageSink({ page: 1 })
    const r1 = await list(adapter, C1, p1)
    expect(requests[0]!.params['limit']).toBe(100)
    expect(r1).toHaveLength(100)
    expect(readUpstreamPage(p1)).toMatchObject({ hasMore: true, pageSize: 100 })
  })

  it('an explicit params.cursor is sent as startingAfter and hasMore reported', async () => {
    const { requests } = fakeRuddr(kind, 12)
    const adapter = new RuddrAdapter()
    const p = withPageSink({ page: 1, limit: 5 })
    p['cursor'] = idOf(kind, 'key-1', 4)
    const rows = await list(adapter, C1, p)
    expect(requests[0]!.params).toEqual({ limit: 5, startingAfter: idOf(kind, 'key-1', 4) })
    expect(rows.map((r) => r.id)).toEqual(ids(kind, 'key-1', 5, 5))
    expect(readUpstreamPage(p)).toMatchObject({ hasMore: true, pageSize: 5 })
  })
})
