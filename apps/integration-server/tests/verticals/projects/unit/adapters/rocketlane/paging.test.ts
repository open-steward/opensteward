/**
 * Rocketlane pages its list endpoints with `pageSize` and `pageToken`; the
 * response's `pagination.nextPageToken` starts the next page and
 * `pagination.hasMore` says whether one exists. The page size "defaults to
 * 100 if left blank or if the specified pageSize is more than 100"
 * (https://developer.rocketlane.com/docs/pagination).
 *
 * listProjects, listTasks and listUsers used to read only `params.cursor`, so
 * caller page 2 repeated page 1. The fake honours ONLY the documented paging
 * inputs. listComments filters its rows and is covered in comments.test.ts.
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
import { RocketlaneAdapter } from '../../../../../../src/verticals/projects/adapters/rocketlane/index'

vi.mock('axios')

const C1: Credentials = { accessToken: 'key-1', extra: {} }
const C2: Credentials = { accessToken: 'key-2', extra: {} }

/** Documented default and maximum of `pageSize`. */
const RL_DEFAULT = 100
const RL_MAX = 100

type Kind = 'projects' | 'tasks' | 'users'

interface Req {
  key: string
  path: string
  params: Record<string, unknown>
}

function idOf(kind: Kind, key: string, parent: string, n: number): string {
  return `${kind}-${key}-${parent}-${String(n).padStart(4, '0')}`
}

function row(kind: Kind, key: string, parent: string, n: number): Record<string, unknown> {
  const id = idOf(kind, key, parent, n)
  switch (kind) {
    case 'projects':
      return { projectId: id, projectName: id }
    case 'tasks':
      return { taskId: id, taskName: id, projectId: parent }
    case 'users':
      return { userId: id, firstName: id, lastName: 'X', email: `${id}@example.com` }
  }
}

/**
 * One Rocketlane endpoint holding `total` rows per (api key, project filter).
 * Tokens are opaque and bound to the key, path and filter that minted them, so
 * a token replayed under another connection or filter is rejected.
 */
function fakeRocketlane(
  kind: Kind,
  total: number,
  requests: Req[] = [],
  opts: { tokenOnLastPage?: boolean } = {},
) {
  let minted = 0
  const tokens = new Map<string, { scope: string; offset: number }>()
  vi.mocked(axios.create).mockImplementation(((config?: { headers?: Record<string, unknown> }) => {
    const key = String(config?.headers?.['api-key'] ?? '')
    const get = vi.fn(async (path: string, cfg?: { params?: Record<string, unknown> }) => {
      const params = { ...(cfg?.params ?? {}) }
      requests.push({ key, path, params })
      if (path !== `/${kind}`) throw new Error(`unexpected path ${path}`)
      const parent = kind === 'tasks' ? String(params['projectId.eq']) : 'all'
      const scope = `${key}|${path}|${parent}`
      const raw = params['pageSize']
      let per = raw === undefined ? RL_DEFAULT : Number(raw)
      if (!Number.isInteger(per) || per < 0) throw new Error(`pageSize ${String(raw)} invalid`)
      if (per === 0 || per > RL_MAX) per = RL_DEFAULT
      let offset = 0
      const tok = params['pageToken']
      if (tok !== undefined) {
        const t = tokens.get(String(tok))
        if (!t || t.scope !== scope) throw new Error(`pageToken ${String(tok)} not valid here`)
        offset = t.offset
      }
      const all = Array.from({ length: total }, (_, i) => row(kind, key, parent, i))
      const data = all.slice(offset, offset + per)
      const hasMore = offset + per < total
      const pagination: Record<string, unknown> = {
        pageSize: per,
        hasMore,
        totalRecordCount: total,
      }
      if (hasMore || opts.tokenOnLastPage) {
        const t = `tok-${++minted}`
        tokens.set(t, { scope, offset: offset + per })
        pagination['nextPageToken'] = t
      }
      return { data: { data, pagination } }
    })
    return { get } as unknown as ReturnType<typeof axios.create>
  }) as unknown as typeof axios.create)
  return { requests }
}

function list(
  adapter: RocketlaneAdapter,
  kind: Kind,
  creds: Credentials,
  parent: string,
  params: QueryParams,
): Promise<Array<{ id: string }>> {
  switch (kind) {
    case 'projects':
      return adapter.listProjects(creds, params)
    case 'tasks':
      return adapter.listTasks(creds, parent, params)
    case 'users':
      return adapter.listUsers(creds, 'ws', params)
  }
}

function ids(kind: Kind, key: string, parent: string, from: number, count: number): string[] {
  const p = kind === 'tasks' ? parent : 'all'
  return Array.from({ length: count }, (_, i) => idOf(kind, key, p, from + i))
}

beforeEach(() => {
  _resetCursorPager()
  vi.clearAllMocks()
})
afterEach(() => _resetCursorPager())

describe.each<Kind>(['projects', 'tasks', 'users'])('rocketlane %s paging', (kind) => {
  it('pages 1..3 of 2L+1 rows return every id once, in order, with exact hasMore', async () => {
    const L = 7
    fakeRocketlane(kind, 2 * L + 1)
    const adapter = new RocketlaneAdapter()
    const served: string[] = []
    const more: unknown[] = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      const rows = await list(adapter, kind, C1, 'p1', params)
      served.push(...rows.map((r) => r.id))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(served).toEqual(ids(kind, 'key-1', 'p1', 0, 2 * L + 1))
    expect(more).toEqual([true, true, false])
  })

  it('the page-2 request carries pageToken from page 1 and the caller size', async () => {
    const { requests } = fakeRocketlane(kind, 20)
    const adapter = new RocketlaneAdapter()
    await list(adapter, kind, C1, 'p1', withPageSink({ page: 1, limit: 5 }))
    await list(adapter, kind, C1, 'p1', withPageSink({ page: 2, limit: 5 }))
    expect(requests).toHaveLength(2)
    expect(requests[0]!.params['pageToken']).toBeUndefined()
    expect(requests[1]!.params['pageToken']).toBe('tok-1')
    expect(requests[1]!.params['pageSize']).toBe(5)
  })

  it('a cold jump to page 3 walks the token chain', async () => {
    fakeRocketlane(kind, 20)
    const adapter = new RocketlaneAdapter()
    const rows = await list(adapter, kind, C1, 'p1', withPageSink({ page: 3, limit: 5 }))
    expect(rows.map((r) => r.id)).toEqual(ids(kind, 'key-1', 'p1', 10, 5))
  })

  it('a limit above the documented maximum of 100 is clamped and reported', async () => {
    const { requests } = fakeRocketlane(kind, 250)
    const adapter = new RocketlaneAdapter()
    const params = withPageSink({ page: 2, limit: 500 })
    const rows = await list(adapter, kind, C1, 'p1', params)
    expect(requests.every((r) => r.params['pageSize'] === RL_MAX)).toBe(true)
    expect(rows.map((r) => r.id)).toEqual(ids(kind, 'key-1', 'p1', 100, 100))
    expect(readUpstreamPage(params)).toMatchObject({ hasMore: true, pageSize: RL_MAX })
  })

  it('API path: parseListQuery + listPage walks the whole collection once', async () => {
    fakeRocketlane(kind, 61)
    const adapter = new RocketlaneAdapter()
    const served: string[] = []
    for (let page = 1; page < 20; page++) {
      // Rocketlane declares no maxPageSize; each list clamps to 100 itself.
      const params = parseListQuery({ limit: '25', page: String(page) })
      const env = listPage(await list(adapter, kind, C1, 'p1', params), params, 'rocketlane')
      served.push(...env.data.map((r) => r.id))
      if (env.meta.hasMore !== true) break
    }
    expect(served).toEqual(ids(kind, 'key-1', 'p1', 0, 61))
  })

  it('an exact-multiple total ends on the reported hasMore, not a full page', async () => {
    const L = 5
    fakeRocketlane(kind, 2 * L)
    const adapter = new RocketlaneAdapter()
    const more: unknown[] = []
    for (const page of [1, 2]) {
      const params = withPageSink({ page, limit: L })
      const rows = await list(adapter, kind, C1, 'p1', params)
      expect(rows).toHaveLength(L)
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(more).toEqual([true, false])
  })

  it('a nextPageToken alongside hasMore false is not followed', async () => {
    const L = 5
    fakeRocketlane(kind, 2 * L + 1, [], { tokenOnLastPage: true })
    const adapter = new RocketlaneAdapter()
    const params = withPageSink({ page: 3, limit: L })
    const rows = await list(adapter, kind, C1, 'p1', params)
    expect(rows.map((r) => r.id)).toEqual(ids(kind, 'key-1', 'p1', 2 * L, 1))
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('a walk at one limit does not reuse tokens minted at another', async () => {
    fakeRocketlane(kind, 40)
    const adapter = new RocketlaneAdapter()
    await list(adapter, kind, C1, 'p1', withPageSink({ page: 1, limit: 5 }))
    const rows = await list(adapter, kind, C1, 'p1', withPageSink({ page: 2, limit: 10 }))
    expect(rows.map((r) => r.id)).toEqual(ids(kind, 'key-1', 'p1', 10, 10))
  })

  it('an explicit cursor names the upstream page directly', async () => {
    const { requests } = fakeRocketlane(kind, 12)
    const adapter = new RocketlaneAdapter()
    await list(adapter, kind, C1, 'p1', withPageSink({ page: 1, limit: 5 }))
    const params = withPageSink({ limit: 5, cursor: 'tok-1' } as QueryParams)
    const rows = await list(adapter, kind, C1, 'p1', params)
    expect(requests[1]!.params['pageToken']).toBe('tok-1')
    expect(rows.map((r) => r.id)).toEqual(ids(kind, 'key-1', 'p1', 5, 5))
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
  })

  it('two connections interleaved within the TTL each walk their own rows', async () => {
    const L = 6
    fakeRocketlane(kind, 2 * L + 1)
    const adapter = new RocketlaneAdapter()
    const a1 = await list(adapter, kind, C1, 'p1', withPageSink({ page: 1, limit: L }))
    const b2 = await list(adapter, kind, C2, 'p1', withPageSink({ page: 2, limit: L }))
    const a2 = await list(adapter, kind, C1, 'p1', withPageSink({ page: 2, limit: L }))
    expect(a1.map((r) => r.id)).toEqual(ids(kind, 'key-1', 'p1', 0, L))
    expect(b2.map((r) => r.id)).toEqual(ids(kind, 'key-2', 'p1', L, L))
    expect(a2.map((r) => r.id)).toEqual(ids(kind, 'key-1', 'p1', L, L))
  })
})

describe('rocketlane listTasks keys its walk per project', () => {
  it('two projects interleaved each walk their own rows', async () => {
    const L = 6
    fakeRocketlane('tasks', 2 * L + 1)
    const adapter = new RocketlaneAdapter()
    const a1 = await adapter.listTasks(C1, 'p1', withPageSink({ page: 1, limit: L }))
    const b2 = await adapter.listTasks(C1, 'p2', withPageSink({ page: 2, limit: L }))
    const a2 = await adapter.listTasks(C1, 'p1', withPageSink({ page: 2, limit: L }))
    expect(a1.map((r) => r.id)).toEqual(ids('tasks', 'key-1', 'p1', 0, L))
    expect(b2.map((r) => r.id)).toEqual(ids('tasks', 'key-1', 'p2', L, L))
    expect(a2.map((r) => r.id)).toEqual(ids('tasks', 'key-1', 'p1', L, L))
  })
})
