/**
 * Planfix pages every list endpoint by a JSON body of `offset` + `pageSize`
 * (https://help.planfix.com/restapidocs/swagger.json). For POST /project/list,
 * /task/list, /task/{id}/comments/list and /user/list alike:
 *
 *   "offset":{"type":"integer","format":"int32","minimum":0,"default":0,"description":"Offset from beginning of list"},
 *   "pageSize":{"type":"integer","format":"int64","maximum":100,"minimum":1,"default":100,"description":"Size of requested list"}
 *
 * The responses are `{ result, <collection>: [...] }` with no total and no
 * next link, so a full page is the only next signal and a short page is the
 * end. The adapter sends `offset = (page - 1) × size` with the caller's limit
 * clamped to 100, and reports that size when it clamps.
 *
 * Every list used to send `pageSize` and read an offset only from
 * `params.cursor`, so caller page 2 repeated page 1. The fake honours ONLY
 * the documented paging inputs.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { withPageSink, readUpstreamPage, parseListQuery, listPage } from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import { PlanfixAdapter } from '../../../../../../src/verticals/projects/adapters/planfix/index'

vi.mock('axios')

const C1: Credentials = { accessToken: 'tok-1', extra: { account: 'acme' } }
const C2: Credentials = { accessToken: 'tok-2', extra: { account: 'acme' } }

/** Documented default and maximum of `pageSize`. */
const PLANFIX_MAX = 100

interface Req {
  token: string
  path: string
  body: Record<string, unknown>
}

type Kind = 'projects' | 'tasks' | 'comments' | 'users'

/** Numeric ids, far apart per token and per parent, ordered by row index. */
function idNum(token: string, parent: string, n: number): number {
  return (token === 'tok-2' ? 100_000 : 0) + (parent === '2' ? 200_000 : 0) + n + 1
}

function row(kind: Kind, token: string, parent: string, n: number): Record<string, unknown> {
  const id = idNum(token, parent, n)
  switch (kind) {
    case 'projects':
      return { id, name: `project ${id}` }
    case 'tasks':
      return { id, name: `task ${id}`, project: { id: Number(parent) } }
    case 'comments':
      return { id, description: `comment ${id}`, task: { id: Number(parent) } }
    case 'users':
      return { id, name: `user ${id}`, email: `u${id}@example.com` }
  }
}

/** The collection key and parent of a Planfix list request, or throws. */
function route(kind: Kind, path: string, body: Record<string, unknown>): string {
  switch (kind) {
    case 'projects':
      if (path !== '/project/list') throw new Error(`unexpected path ${path}`)
      return 'all'
    case 'users':
      if (path !== '/user/list') throw new Error(`unexpected path ${path}`)
      return 'all'
    case 'tasks': {
      if (path !== '/task/list') throw new Error(`unexpected path ${path}`)
      const filters = body['filters'] as Array<{ value?: unknown }> | undefined
      return String(filters?.[0]?.value ?? 'all')
    }
    case 'comments': {
      const m = path.match(/^\/task\/([^/]+)\/comments\/list$/)
      if (!m) throw new Error(`unexpected path ${path}`)
      return m[1]!
    }
  }
}

/**
 * One Planfix list endpoint holding `total` rows per (token, parent). It
 * honours only `offset` (default 0, minimum 0) and `pageSize` (default 100,
 * 1..100 — anything outside is rejected).
 */
function fakePlanfix(kind: Kind, total: number, requests: Req[] = []) {
  vi.mocked(axios.create).mockImplementation(((config?: { headers?: Record<string, unknown> }) => {
    const token = String(config?.headers?.['Authorization'] ?? '').replace(/^Bearer /, '')
    const post = vi.fn(async (path: string, rawBody?: Record<string, unknown>) => {
      const body = { ...(rawBody ?? {}) }
      requests.push({ token, path, body })
      const parent = route(kind, path, body)
      const all = Array.from({ length: total }, (_, i) => row(kind, token, parent, i))
      const sizeRaw = body['pageSize']
      const size = sizeRaw === undefined ? PLANFIX_MAX : Number(sizeRaw)
      if (!Number.isInteger(size) || size < 1 || size > PLANFIX_MAX) {
        throw new Error(`pageSize ${String(sizeRaw)} invalid`)
      }
      const offRaw = body['offset']
      const off = offRaw === undefined ? 0 : Number(offRaw)
      if (!Number.isInteger(off) || off < 0) throw new Error(`offset ${String(offRaw)} invalid`)
      return { data: { result: 'success', [kind]: all.slice(off, off + size) } }
    })
    return { post, get: vi.fn() }
  }) as unknown as typeof axios.create)
  return { requests }
}

type Lister = (
  a: PlanfixAdapter,
  c: Credentials,
  parent: string,
  p: QueryParams,
) => Promise<{ id: string }[]>

const LISTS: Array<[string, Kind, Lister]> = [
  ['listProjects', 'projects', (a, c, _parent, p) => a.listProjects(c, p)],
  ['listTasks', 'tasks', (a, c, parent, p) => a.listTasks(c, parent, p)],
  ['listComments', 'comments', (a, c, parent, p) => a.listComments(c, parent, p)],
  ['listUsers', 'users', (a, c, parent, p) => a.listUsers(c, parent, p)],
]

function parentOf(kind: Kind, parent: string): string {
  return kind === 'tasks' || kind === 'comments' ? parent : 'all'
}

function ids(kind: Kind, token: string, parent: string, from: number, n: number): string[] {
  const par = parentOf(kind, parent)
  return Array.from({ length: n }, (_, i) => String(idNum(token, par, from + i)))
}

afterEach(() => vi.clearAllMocks())

describe.each(LISTS)('planfix %s pages at the caller size', (_name, kind, list) => {
  it('N = 2L+1 rows at limit L: pages 1-3 serve every id once, in order, hasMore exact', async () => {
    const L = 40
    fakePlanfix(kind, 2 * L + 1)
    const adapter = new PlanfixAdapter()
    const served: string[] = []
    const more: Array<boolean | undefined> = []
    for (let page = 1; page <= 3; page++) {
      const params = withPageSink({ page, limit: L })
      const rows = await list(adapter, C1, '1', params)
      served.push(...rows.map((r) => r.id))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(served).toEqual(ids(kind, 'tok-1', '1', 0, 2 * L + 1))
    expect(more).toEqual([true, true, false])
  })

  it('N = 2L-1 rows at limit L: a last page short by one reports hasMore false', async () => {
    const L = 40
    fakePlanfix(kind, 2 * L - 1)
    const adapter = new PlanfixAdapter()
    const p1 = withPageSink({ page: 1, limit: L })
    const r1 = await list(adapter, C1, '1', p1)
    const p2 = withPageSink({ page: 2, limit: L })
    const r2 = await list(adapter, C1, '1', p2)
    expect(r1.map((r) => r.id)).toEqual(ids(kind, 'tok-1', '1', 0, L))
    expect(r2.map((r) => r.id)).toEqual(ids(kind, 'tok-1', '1', L, L - 1))
    expect(readUpstreamPage(p1)?.hasMore).toBe(true)
    expect(readUpstreamPage(p2)?.hasMore).toBe(false)
  })

  it('a direct call with no limit sends the documented default pageSize of 100', async () => {
    const { requests } = fakePlanfix(kind, 5)
    const adapter = new PlanfixAdapter()
    const params = withPageSink({ page: 1 })
    await list(adapter, C1, '1', params)
    expect(requests[0]!.body['pageSize']).toBe(PLANFIX_MAX)
    expect(requests[0]!.body['offset']).toBe(0)
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('page 2 is fetched with offset = L and pageSize = L', async () => {
    const L = 40
    const { requests } = fakePlanfix(kind, 2 * L + 1)
    const adapter = new PlanfixAdapter()
    await list(adapter, C1, '1', withPageSink({ page: 2, limit: L }))
    expect(requests).toHaveLength(1)
    expect(requests[0]!.body['offset']).toBe(L)
    expect(requests[0]!.body['pageSize']).toBe(L)
  })

  it('a limit above 100 is clamped to 100, reported, and strides by 100', async () => {
    const { requests } = fakePlanfix(kind, 250)
    const adapter = new PlanfixAdapter()
    const served: string[] = []
    for (let page = 1; page <= 3; page++) {
      const params = withPageSink({ page, limit: 500 })
      served.push(...(await list(adapter, C1, '1', params)).map((r) => r.id))
      expect(readUpstreamPage(params)?.pageSize).toBe(PLANFIX_MAX)
      expect(readUpstreamPage(params)?.hasMore).toBe(page < 3)
    }
    expect(requests.map((r) => r.body['pageSize'])).toEqual([100, 100, 100])
    expect(requests.map((r) => r.body['offset'])).toEqual([0, 100, 200])
    expect(served).toEqual(ids(kind, 'tok-1', '1', 0, 250))
  })

  it('an exact multiple ends on an empty page with hasMore false', async () => {
    const L = 40
    fakePlanfix(kind, 2 * L)
    const adapter = new PlanfixAdapter()
    const p3 = withPageSink({ page: 3, limit: L })
    expect(await list(adapter, C1, '1', p3)).toEqual([])
    expect(readUpstreamPage(p3)?.hasMore).toBe(false)
  })

  it('API path: parseListQuery + listPage walks the whole collection once', async () => {
    fakePlanfix(kind, 230)
    const adapter = new PlanfixAdapter()
    const served: string[] = []
    for (let page = 1; page < 20; page++) {
      const params = parseListQuery({ limit: '25', page: String(page) })
      const env = listPage(await list(adapter, C1, '1', params), params, 'planfix')
      served.push(...env.data.map((r) => r.id))
      if (env.meta.hasMore !== true) break
    }
    expect(served).toEqual(ids(kind, 'tok-1', '1', 0, 230))
  })

  it('two connections interleaved each walk their own rows', async () => {
    const L = 40
    fakePlanfix(kind, 2 * L + 1)
    const adapter = new PlanfixAdapter()
    const a1 = await list(adapter, C1, '1', withPageSink({ page: 1, limit: L }))
    const b2 = await list(adapter, C2, '1', withPageSink({ page: 2, limit: L }))
    const a2 = await list(adapter, C1, '1', withPageSink({ page: 2, limit: L }))
    expect(a1.map((r) => r.id)).toEqual(ids(kind, 'tok-1', '1', 0, L))
    expect(b2.map((r) => r.id)).toEqual(ids(kind, 'tok-2', '1', L, L))
    expect(a2.map((r) => r.id)).toEqual(ids(kind, 'tok-1', '1', L, L))
  })

  it.runIf(kind === 'tasks' || kind === 'comments')(
    'two parents interleaved each walk their own rows',
    async () => {
      const L = 40
      fakePlanfix(kind, 2 * L + 1)
      const adapter = new PlanfixAdapter()
      const a1 = await list(adapter, C1, '1', withPageSink({ page: 1, limit: L }))
      const b2 = await list(adapter, C1, '2', withPageSink({ page: 2, limit: L }))
      const a2 = await list(adapter, C1, '1', withPageSink({ page: 2, limit: L }))
      expect(a1.map((r) => r.id)).toEqual(ids(kind, 'tok-1', '1', 0, L))
      expect(b2.map((r) => r.id)).toEqual(ids(kind, 'tok-1', '2', L, L))
      expect(a2.map((r) => r.id)).toEqual(ids(kind, 'tok-1', '1', L, L))
    },
  )
})

describe('planfix capabilities', () => {
  it('declares the documented pageSize maximum of 100', () => {
    expect(new PlanfixAdapter().capabilities.maxPageSize).toBe(PLANFIX_MAX)
  })
})
