/**
 * Weeek paging, against the OpenAPI spec the developer portal ships
 * (https://developers.weeek.net/api, served from
 * https://developers.weeek.net/assets/weeek.yaml-Bhx55p8P.js):
 *
 *   - GET /tm/tasks documents `perPage` and `offset` query parameters and a
 *     `hasMore` boolean in the response. The adapter walks it with
 *     `pageByRows`, advancing `offset` by the rows each response actually
 *     held and stopping when `hasMore` is not true. No maximum for `perPage`
 *     is documented, so nothing here depends on one: an upstream that returns
 *     fewer rows than asked still serves every row once.
 *   - GET /tm/projects, GET /ws/members and GET /ws declare `parameters:[]`:
 *     they return the whole collection (GET /ws a single workspace), so the
 *     adapter pages them locally and sends no paging input.
 *
 * Every list used to send `perPage` and read an offset only from
 * `params.cursor`, so caller page 2 repeated page 1. The fake honours ONLY
 * the documented paging inputs.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import axios from 'axios'
import {
  withPageSink,
  readUpstreamPage,
  parseListQuery,
  listPage,
  _resetRowPager,
} from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import { WeeekAdapter } from '../../../../../../src/verticals/projects/adapters/weeek/index'

vi.mock('axios')

const C1: Credentials = { accessToken: 'tok-1' }
const C2: Credentials = { accessToken: 'tok-2' }

interface Req {
  token: string
  path: string
  params: Record<string, unknown>
}

type Kind = 'tasks' | 'projects' | 'members' | 'workspace'

/** Numeric ids, far apart per token and per project, ordered by row index. */
function idNum(token: string, parent: string, n: number): number {
  return (token === 'tok-2' ? 100_000 : 0) + (parent === '2' ? 200_000 : 0) + n + 1
}

/**
 * A Weeek API holding `total` rows of `kind` per (token, project). GET
 * /tm/tasks honours only `perPage` and `offset` (and the `projectId` filter)
 * and answers `hasMore`; `serverCap`, when set, returns at most that many rows
 * whatever `perPage` asked for. The other endpoints honour no query at all.
 */
function fakeWeeek(
  kind: Kind,
  total: number,
  opts: { serverCap?: number; hasMore?: 'exact' | 'omit' | 'always' } = {},
) {
  const requests: Req[] = []
  vi.mocked(axios.create).mockImplementation(((config?: { headers?: Record<string, unknown> }) => {
    const token = String(config?.headers?.['Authorization'] ?? '').replace(/^Bearer /, '')
    const get = vi.fn(async (path: string, cfg?: { params?: Record<string, unknown> }) => {
      const params = { ...(cfg?.params ?? {}) }
      requests.push({ token, path, params })
      if (path === '/ws') {
        return { data: { success: true, workspace: { id: idNum(token, 'all', 0), title: 'ws' } } }
      }
      if (kind === 'members' && path === '/ws/members') {
        const members = Array.from({ length: total }, (_, i) => ({
          id: String(idNum(token, 'all', i)),
          email: `u${i}@example.com`,
          firstName: `U${i}`,
        }))
        return { data: { success: true, members } }
      }
      if (kind === 'projects' && path === '/tm/projects') {
        const projects = Array.from({ length: total }, (_, i) => ({
          id: idNum(token, 'all', i),
          title: `project ${i}`,
        }))
        return { data: { success: true, projects } }
      }
      if (kind === 'tasks' && path === '/tm/tasks') {
        const parent = String(params['projectId'])
        const all = Array.from({ length: total }, (_, i) => ({
          id: idNum(token, parent, i),
          title: `task ${i}`,
          projectId: Number(parent),
        }))
        const perRaw = params['perPage']
        let per = perRaw === undefined ? 50 : Number(perRaw)
        if (!Number.isInteger(per) || per < 1) throw new Error(`perPage ${String(perRaw)} invalid`)
        if (opts.serverCap !== undefined) per = Math.min(per, opts.serverCap)
        const offRaw = params['offset']
        const off = offRaw === undefined ? 0 : Number(offRaw)
        if (!Number.isInteger(off) || off < 0) throw new Error(`offset ${String(offRaw)} invalid`)
        const tasks = all.slice(off, off + per)
        const mode = opts.hasMore ?? 'exact'
        if (mode === 'omit') return { data: { success: true, tasks } }
        const hasMore = mode === 'always' ? true : off + tasks.length < all.length
        return { data: { success: true, tasks, hasMore } }
      }
      throw new Error(`unexpected path ${path}`)
    })
    return { get }
  }) as unknown as typeof axios.create)
  return { requests }
}

type Lister = (
  a: WeeekAdapter,
  c: Credentials,
  parent: string,
  p: QueryParams,
) => Promise<{ id: string }[]>

const listTasks: Lister = (a, c, parent, p) => a.listTasks(c, parent, p)

const LISTS: Array<[string, Kind, Lister]> = [
  ['listTasks', 'tasks', listTasks],
  ['listProjects', 'projects', (a, c, _p, p) => a.listProjects(c, p)],
  ['listUsers', 'members', (a, c, _p, p) => a.listUsers(c, 'ws', p)],
]

function ids(token: string, parent: string, from: number, n: number): string[] {
  return Array.from({ length: n }, (_, i) => String(idNum(token, parent, from + i)))
}

function parentOf(kind: Kind, parent: string): string {
  return kind === 'tasks' ? parent : 'all'
}

beforeEach(() => _resetRowPager())
afterEach(() => vi.clearAllMocks())

describe.each(LISTS)('weeek %s pages at the caller size', (_name, kind, list) => {
  it('N = 2L+1 rows at limit L: pages 1-3 serve every id once, in order, hasMore exact', async () => {
    const L = 40
    fakeWeeek(kind, 2 * L + 1)
    const adapter = new WeeekAdapter()
    const served: string[] = []
    const more: Array<boolean | undefined> = []
    for (let page = 1; page <= 3; page++) {
      const params = withPageSink({ page, limit: L })
      const rows = await list(adapter, C1, '1', params)
      served.push(...rows.map((r) => r.id))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(served).toEqual(ids('tok-1', parentOf(kind, '1'), 0, 2 * L + 1))
    expect(more).toEqual([true, true, false])
  })

  it('API path: parseListQuery + listPage walks the whole collection once', async () => {
    fakeWeeek(kind, 230)
    const adapter = new WeeekAdapter()
    const served: string[] = []
    for (let page = 1; page < 20; page++) {
      const params = parseListQuery({ limit: '25', page: String(page) })
      const env = listPage(await list(adapter, C1, '1', params), params, 'weeek')
      served.push(...env.data.map((r) => r.id))
      if (env.meta.hasMore !== true) break
    }
    expect(served).toEqual(ids('tok-1', parentOf(kind, '1'), 0, 230))
  })

  it('two connections interleaved each walk their own rows', async () => {
    const L = 40
    fakeWeeek(kind, 2 * L + 1)
    const adapter = new WeeekAdapter()
    const a1 = await list(adapter, C1, '1', withPageSink({ page: 1, limit: L }))
    const b2 = await list(adapter, C2, '1', withPageSink({ page: 2, limit: L }))
    const a2 = await list(adapter, C1, '1', withPageSink({ page: 2, limit: L }))
    expect(a1.map((r) => r.id)).toEqual(ids('tok-1', parentOf(kind, '1'), 0, L))
    expect(b2.map((r) => r.id)).toEqual(ids('tok-2', parentOf(kind, '1'), L, L))
    expect(a2.map((r) => r.id)).toEqual(ids('tok-1', parentOf(kind, '1'), L, L))
  })
})

describe('weeek listTasks walks perPage + offset', () => {
  it('page 2 is fetched with the documented offset = L and perPage = L', async () => {
    const L = 40
    const { requests } = fakeWeeek('tasks', 2 * L + 1)
    const adapter = new WeeekAdapter()
    const params = withPageSink({ page: 2, limit: L })
    const rows = await adapter.listTasks(C1, '1', params)
    expect(rows.map((r) => r.id)).toEqual(ids('tok-1', '1', L, L))
    const atL = requests.filter((r) => r.params['offset'] === L)
    expect(atL).toHaveLength(1)
    expect(atL[0]!.params['perPage']).toBe(L)
    for (const r of requests) {
      expect(r.params['cursor']).toBeUndefined()
      expect(r.params['projectId']).toBe('1')
    }
    expect(readUpstreamPage(params)).toMatchObject({ hasMore: true, pagedLocally: true })
  })

  it('a sequential walk costs one request per upstream page', async () => {
    const L = 40
    const { requests } = fakeWeeek('tasks', 2 * L + 1)
    const adapter = new WeeekAdapter()
    for (let page = 1; page <= 3; page++)
      await adapter.listTasks(C1, '1', withPageSink({ page, limit: L }))
    expect(requests.map((r) => r.params['offset'])).toEqual([0, L, 2 * L])
  })

  it('a limit above the upstream batch size is served in full from several requests of at most 100', async () => {
    const L = 250
    const { requests } = fakeWeeek('tasks', 2 * L + 1)
    const adapter = new WeeekAdapter()
    const p1 = withPageSink({ page: 1, limit: L })
    const r1 = await adapter.listTasks(C1, '1', p1)
    const p3 = withPageSink({ page: 3, limit: L })
    const r3 = await adapter.listTasks(C1, '1', p3)
    expect(r1.map((r) => r.id)).toEqual(ids('tok-1', '1', 0, L))
    expect(r3.map((r) => r.id)).toEqual(ids('tok-1', '1', 2 * L, 1))
    expect(readUpstreamPage(p1)?.hasMore).toBe(true)
    expect(readUpstreamPage(p3)?.hasMore).toBe(false)
    for (const r of requests) expect(Number(r.params['perPage'])).toBeLessThanOrEqual(100)
  })

  it('an upstream that returns fewer rows than perPage still serves every row once', async () => {
    const L = 40
    fakeWeeek('tasks', 2 * L + 1, { serverCap: 15 })
    const adapter = new WeeekAdapter()
    const served: string[] = []
    const more: Array<boolean | undefined> = []
    for (let page = 1; page <= 3; page++) {
      const params = withPageSink({ page, limit: L })
      served.push(...(await adapter.listTasks(C1, '1', params)).map((r) => r.id))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(served).toEqual(ids('tok-1', '1', 0, 2 * L + 1))
    expect(more).toEqual([true, true, false])
  })

  it('a response without hasMore ends the walk', async () => {
    const L = 40
    const { requests } = fakeWeeek('tasks', 2 * L + 1, { hasMore: 'omit' })
    const adapter = new WeeekAdapter()
    const p1 = withPageSink({ page: 1, limit: L })
    const r1 = await adapter.listTasks(C1, '1', p1)
    expect(r1.map((r) => r.id)).toEqual(ids('tok-1', '1', 0, L))
    expect(readUpstreamPage(p1)?.hasMore).toBe(false)
    expect(requests).toHaveLength(1)
  })

  it('an empty page that still claims hasMore ends the walk', async () => {
    const L = 40
    const { requests } = fakeWeeek('tasks', 2 * L + 1, { hasMore: 'always' })
    const adapter = new WeeekAdapter()
    const params = withPageSink({ page: 3, limit: L })
    const rows = await adapter.listTasks(C1, '1', params)
    expect(rows.map((r) => r.id)).toEqual(ids('tok-1', '1', 2 * L, 1))
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
    expect(requests.map((r) => r.params['offset'])).toEqual([0, L, 2 * L, 2 * L + 1])
  })

  it('no limit pages at the default size of 50, the same size perPage sends', async () => {
    const { requests } = fakeWeeek('tasks', 120)
    const adapter = new WeeekAdapter()
    const params = withPageSink({ page: 2 })
    const rows = await adapter.listTasks(C1, '1', params)
    expect(rows.map((r) => r.id)).toEqual(ids('tok-1', '1', 50, 50))
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
    for (const r of requests) expect(r.params['perPage']).toBe(50)
  })

  it('two projects interleaved each walk their own rows', async () => {
    const L = 40
    fakeWeeek('tasks', 2 * L + 1)
    const adapter = new WeeekAdapter()
    const a1 = await adapter.listTasks(C1, '1', withPageSink({ page: 1, limit: L }))
    const b2 = await adapter.listTasks(C1, '2', withPageSink({ page: 2, limit: L }))
    const a2 = await adapter.listTasks(C1, '1', withPageSink({ page: 2, limit: L }))
    expect(a1.map((r) => r.id)).toEqual(ids('tok-1', '1', 0, L))
    expect(b2.map((r) => r.id)).toEqual(ids('tok-1', '2', L, L))
    expect(a2.map((r) => r.id)).toEqual(ids('tok-1', '1', L, L))
  })
})

describe('weeek whole-collection endpoints page locally', () => {
  it.each([
    ['listProjects', 'projects', '/tm/projects'],
    ['listUsers', 'members', '/ws/members'],
  ] as const)('%s sends no undocumented paging input', async (name, kind, path) => {
    const { requests } = fakeWeeek(kind, 7)
    const adapter = new WeeekAdapter()
    const params = withPageSink({ page: 2, limit: 3 })
    const lister = LISTS.find(([n]) => n === name)![2]
    const rows = await lister(adapter, C1, '1', params)
    expect(rows.map((r) => r.id)).toEqual(ids('tok-1', 'all', 3, 3))
    expect(readUpstreamPage(params)).toMatchObject({
      totalCount: 7,
      hasMore: true,
      pagedLocally: true,
    })
    const call = requests.find((r) => r.path === path)!
    expect(call.params['perPage']).toBeUndefined()
    expect(call.params['offset']).toBeUndefined()
  })

  it('listWorkspaces serves its single workspace on page 1 only', async () => {
    fakeWeeek('workspace', 0)
    const adapter = new WeeekAdapter()
    const p1 = withPageSink({ page: 1, limit: 10 })
    const r1 = await adapter.listWorkspaces(C1, p1)
    const p2 = withPageSink({ page: 2, limit: 10 })
    const r2 = await adapter.listWorkspaces(C1, p2)
    expect(r1.map((r) => r.id)).toEqual(ids('tok-1', 'all', 0, 1))
    expect(r2).toEqual([])
    expect(readUpstreamPage(p1)).toMatchObject({
      totalCount: 1,
      hasMore: false,
      pagedLocally: true,
    })
    expect(readUpstreamPage(p2)).toMatchObject({ hasMore: false })
  })
})
