/**
 * Meisterplan pages its paginated endpoints with `pageSize` + `pageAfter`
 * ("In order to access the next page, an opaque cursor is provided in the
 * response to your `GET` request, which can be passed as a query parameter
 * `pageAfter` on a subsequent request."), the cursor arriving at
 * `_pagination.after.cursor` (https://api.us.meisterplan.com/swagger.json,
 * rendered at https://api.us.meisterplan.com/docs/api.html).
 *
 * `pageSize` maxima are per endpoint: 500 on /scenarios/{id}/projects,
 * /resources and /scenarios/{id}/projects/{id}/taskManagementLink/tasks
 * (operationId GetAllTasks), 100 on /scenarios/{id}/projects/{id}/comments.
 *
 * `GET /roles` ("Returns a list of all available roles") and `GET /scenarios`
 * take no paging parameter and return a `List` with no `_pagination`, so the
 * adapter pages them locally.
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
import { MeisterplanAdapter } from '../../../../../../src/verticals/projects/adapters/meisterplan/index'

vi.mock('axios')

const C1: Credentials = { accessToken: 'api-token-1', extra: { region: 'us' } }
const C2: Credentials = { accessToken: 'api-token-2', extra: { region: 'us' } }

interface Req {
  token: string
  path: string
  params: Record<string, unknown>
}

type Kind = 'projects' | 'resources' | 'comments' | 'tasks' | 'roles' | 'scenarios'

/** Documented `pageSize` maximum per paginated endpoint. */
const MAX: Record<'projects' | 'resources' | 'comments' | 'tasks', number> = {
  projects: 500,
  resources: 500,
  comments: 100,
  tasks: 500,
}

const PATTERNS: Record<Kind, RegExp> = {
  projects: /^\/scenarios\/([^/]+)\/projects$/,
  resources: /^\/resources$/,
  comments: /^\/scenarios\/PlanOfRecord\/projects\/([^/]+)\/comments$/,
  tasks: /^\/scenarios\/PlanOfRecord\/projects\/([^/]+)\/taskManagementLink\/tasks$/,
  roles: /^\/roles$/,
  scenarios: /^\/scenarios$/,
}

function idOf(kind: Kind, token: string, parent: string, n: number): string {
  return `${kind}-${token}-${parent}-${String(n).padStart(4, '0')}`
}

function row(kind: Kind, token: string, parent: string, n: number): Record<string, unknown> {
  const id = idOf(kind, token, parent, n)
  switch (kind) {
    case 'projects':
      return { id, name: id }
    case 'resources':
      return { id, firstName: id, lastName: 'X' }
    case 'comments':
      return { id, content: id }
    case 'tasks':
      return { id, key: id, name: id, status: 'OPEN', type: 'TASK' }
    case 'roles':
    case 'scenarios':
      return { id, name: id }
  }
}

/**
 * One Meisterplan endpoint holding `total` rows per (token, parent).
 * Paginated endpoints honour only `pageSize` (default 100, documented max)
 * and `pageAfter`; the cursor is the opaque position encoded per token and
 * parent, so a cursor borrowed from another connection or parent is rejected.
 * /roles and /scenarios honour nothing and return every row.
 * `alwaysCursor` models a vendor that keeps sending a cursor on the last page
 * and alongside an empty page: the spec names the empty list as the end ("If
 * no more resources are available in your system, the request will return an
 * empty list.") without promising that the cursor is dropped.
 */
function fakeMeisterplan(
  kind: Kind,
  total: number,
  requests: Req[] = [],
  opts: { alwaysCursor?: boolean } = {},
) {
  vi.mocked(axios.create).mockImplementation(((config?: { headers?: Record<string, unknown> }) => {
    const token = String(config?.headers?.['Authorization'] ?? '')
    const get = vi.fn(async (path: string, cfg?: { params?: Record<string, unknown> }) => {
      const params = { ...(cfg?.params ?? {}) }
      requests.push({ token, path, params })
      const m = path.match(PATTERNS[kind])
      if (!m) throw new Error(`unexpected path ${path}`)
      const parent = m[1] ?? 'all'
      const all = Array.from({ length: total }, (_, i) => row(kind, token, parent, i))
      if (kind === 'roles' || kind === 'scenarios') return { data: { items: all } }
      const sizeRaw = params['pageSize']
      const size = sizeRaw === undefined ? 100 : Number(sizeRaw)
      if (!Number.isInteger(size) || size < 1 || size > MAX[kind])
        throw new Error(`pageSize ${String(sizeRaw)} out of range`)
      const after = params['pageAfter']
      let start = 0
      if (after !== undefined) {
        const [t, p, pos] = Buffer.from(String(after), 'base64').toString().split('|')
        if (t !== token || p !== parent) throw new Error('cursor from another collection')
        start = Number(pos)
      }
      const page = all.slice(start, start + size)
      const end = start + size
      return {
        data: {
          items: page,
          _pagination:
            end < all.length || opts.alwaysCursor
              ? { after: { cursor: Buffer.from(`${token}|${parent}|${end}`).toString('base64') } }
              : {},
        },
      }
    })
    return { get }
  }) as unknown as typeof axios.create)
  return { requests }
}

type Lister = (
  a: MeisterplanAdapter,
  c: Credentials,
  parent: string,
  p: QueryParams,
) => Promise<{ id: string }[]>

const LISTS: Array<[string, Kind, Lister]> = [
  [
    'listProjects',
    'projects',
    (a, c, parent, p) => {
      p['workspace_id'] = parent
      return a.listProjects(c, p)
    },
  ],
  ['listUsers', 'resources', (a, c, _parent, p) => a.listUsers(c, 'ws', p)],
  ['listComments', 'comments', (a, c, parent, p) => a.listComments(c, parent, p)],
  ['listTasks', 'tasks', (a, c, parent, p) => a.listTasks(c, parent, p)],
  ['listTags', 'roles', (a, c, _parent, p) => a.listTags(c, 'ws', p)],
  ['listWorkspaces', 'scenarios', (a, c, _parent, p) => a.listWorkspaces(c, p)],
]

/** Calls one lister (listProjects scopes by setting `workspace_id` on the params). */
function run(list: Lister, a: MeisterplanAdapter, c: Credentials, parent: string, p: QueryParams) {
  return list(a, c, parent, p)
}

function ids(kind: Kind, token: string, parent: string, from: number, n: number): string[] {
  const par = kind === 'resources' || kind === 'roles' || kind === 'scenarios' ? 'all' : parent
  return Array.from({ length: n }, (_, i) => idOf(kind, token, par, from + i))
}

beforeEach(() => _resetCursorPager())
afterEach(() => vi.clearAllMocks())

describe.each(LISTS)('meisterplan %s pages at the caller size', (_name, kind, list) => {
  it('N = 2L+1 rows at limit L: pages 1-3 serve every id once, in order, hasMore exact', async () => {
    const L = kind === 'comments' ? 40 : 120
    fakeMeisterplan(kind, 2 * L + 1)
    const adapter = new MeisterplanAdapter()
    const served: string[] = []
    const more: Array<boolean | undefined> = []
    for (let page = 1; page <= 3; page++) {
      const params = withPageSink({ page, limit: L })
      const rows = await run(list, adapter, C1, 'p1', params)
      served.push(...rows.map((r) => r.id))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(served).toEqual(ids(kind, 'api-token-1', 'p1', 0, 2 * L + 1))
    expect(more).toEqual([true, true, false])
  })

  it('API path: parseListQuery + listPage walks the whole collection once', async () => {
    fakeMeisterplan(kind, 230)
    const adapter = new MeisterplanAdapter()
    const served: string[] = []
    for (let page = 1; page < 20; page++) {
      const params = parseListQuery({ limit: '25', page: String(page) })
      const env = listPage(await run(list, adapter, C1, 'p1', params), params, 'meisterplan')
      served.push(...env.data.map((r) => r.id))
      if (env.meta.hasMore !== true) break
    }
    expect(served).toEqual(ids(kind, 'api-token-1', 'p1', 0, 230))
  })

  it('two connections interleaved within the TTL each walk their own rows', async () => {
    const L = 50
    fakeMeisterplan(kind, 2 * L + 1)
    const adapter = new MeisterplanAdapter()
    const a1 = await run(list, adapter, C1, 'p1', withPageSink({ page: 1, limit: L }))
    const b2 = await run(list, adapter, C2, 'p1', withPageSink({ page: 2, limit: L }))
    const a2 = await run(list, adapter, C1, 'p1', withPageSink({ page: 2, limit: L }))
    expect(a1.map((r) => r.id)).toEqual(ids(kind, 'api-token-1', 'p1', 0, L))
    expect(b2.map((r) => r.id)).toEqual(ids(kind, 'api-token-2', 'p1', L, L))
    expect(a2.map((r) => r.id)).toEqual(ids(kind, 'api-token-1', 'p1', L, L))
  })

  it.runIf(kind === 'projects' || kind === 'comments' || kind === 'tasks')(
    'two parents interleaved each walk their own rows',
    async () => {
      const L = 50
      fakeMeisterplan(kind, 2 * L + 1)
      const adapter = new MeisterplanAdapter()
      const a1 = await run(list, adapter, C1, 'p1', withPageSink({ page: 1, limit: L }))
      const b2 = await run(list, adapter, C1, 'p2', withPageSink({ page: 2, limit: L }))
      const a2 = await run(list, adapter, C1, 'p1', withPageSink({ page: 2, limit: L }))
      expect(a1.map((r) => r.id)).toEqual(ids(kind, 'api-token-1', 'p1', 0, L))
      expect(b2.map((r) => r.id)).toEqual(ids(kind, 'api-token-1', 'p2', L, L))
      expect(a2.map((r) => r.id)).toEqual(ids(kind, 'api-token-1', 'p1', L, L))
    },
  )
})

const CURSOR_LISTS = LISTS.filter(([, kind]) => kind !== 'roles' && kind !== 'scenarios') as Array<
  [string, 'projects' | 'resources' | 'comments' | 'tasks', Lister]
>

describe.each(CURSOR_LISTS)(
  'meisterplan %s sends the documented paging inputs',
  (_n, kind, list) => {
    it('page 1 sends pageSize = limit; page 2 carries pageAfter from _pagination.after.cursor', async () => {
      const { requests } = fakeMeisterplan(kind, 250)
      const adapter = new MeisterplanAdapter()
      await run(list, adapter, C1, 'p1', withPageSink({ page: 1, limit: 60 }))
      await run(list, adapter, C1, 'p1', withPageSink({ page: 2, limit: 60 }))
      expect(requests).toHaveLength(2)
      expect(requests[0]!.params['pageSize']).toBe(60)
      expect(requests[0]!.params['pageAfter']).toBeUndefined()
      expect(requests[1]!.params['pageSize']).toBe(60)
      const parent = kind === 'resources' ? 'all' : 'p1'
      expect(requests[1]!.params['pageAfter']).toBe(
        Buffer.from(`api-token-1|${parent}|60`).toString('base64'),
      )
    })

    it('changing the limit between pages never reuses a cursor stored at another size', async () => {
      fakeMeisterplan(kind, 300)
      const adapter = new MeisterplanAdapter()
      const p1 = await run(list, adapter, C1, 'p1', withPageSink({ page: 1, limit: 25 }))
      const p2 = await run(list, adapter, C1, 'p1', withPageSink({ page: 2, limit: 50 }))
      expect(p1.map((r) => r.id)).toEqual(ids(kind, 'api-token-1', 'p1', 0, 25))
      expect(p2.map((r) => r.id)).toEqual(ids(kind, 'api-token-1', 'p1', 50, 50))
    })

    it('a limit above the documented maximum is clamped and reported as the page size', async () => {
      const max = MAX[kind]
      const { requests } = fakeMeisterplan(kind, max + 50)
      const adapter = new MeisterplanAdapter()
      const params = withPageSink({ page: 1, limit: 5000 })
      const rows = await run(list, adapter, C1, 'p1', params)
      expect(requests[0]!.params['pageSize']).toBe(max)
      expect(rows.map((r) => r.id)).toEqual(ids(kind, 'api-token-1', 'p1', 0, max))
      expect(readUpstreamPage(params)).toMatchObject({ hasMore: true, pageSize: max })
    })

    it('an explicit cursor param is sent as pageAfter and names the upstream page directly', async () => {
      const { requests } = fakeMeisterplan(kind, 40)
      const adapter = new MeisterplanAdapter()
      const parent = kind === 'resources' ? 'all' : 'p1'
      const cursor = Buffer.from(`api-token-1|${parent}|10`).toString('base64')
      const params = withPageSink({ page: 1, limit: 5 })
      params['cursor'] = cursor
      const rows = await run(list, adapter, C1, 'p1', params)
      expect(requests).toHaveLength(1)
      expect(requests[0]!.params['pageAfter']).toBe(cursor)
      expect(rows.map((r) => r.id)).toEqual(ids(kind, 'api-token-1', 'p1', 10, 5))
      expect(readUpstreamPage(params)?.hasMore).toBe(true)
    })

    it('an empty page is the end even when a cursor rides along with it', async () => {
      const L = kind === 'comments' ? 40 : 60
      fakeMeisterplan(kind, 2 * L, [], { alwaysCursor: true })
      const adapter = new MeisterplanAdapter()
      const served: string[] = []
      const more: Array<boolean | undefined> = []
      for (let page = 1; page <= 3; page++) {
        const params = withPageSink({ page, limit: L })
        const rows = await run(list, adapter, C1, 'p1', params)
        served.push(...rows.map((r) => r.id))
        more.push(readUpstreamPage(params)?.hasMore)
      }
      expect(served).toEqual(ids(kind, 'api-token-1', 'p1', 0, 2 * L))
      // Pages 1-2 are full and carry a cursor; page 3 is empty and must end the walk.
      expect(more).toEqual([true, true, false])
    })

    it('a limit within the documented maximum reports no page size override', async () => {
      fakeMeisterplan(kind, MAX[kind] + 50)
      const adapter = new MeisterplanAdapter()
      const params = withPageSink({ page: 1, limit: MAX[kind] })
      await run(list, adapter, C1, 'p1', params)
      const up = readUpstreamPage(params)
      expect(up?.hasMore).toBe(true)
      expect(up?.pageSize).toBeUndefined()
    })

    it('an explicit cursor naming the last page reports hasMore false', async () => {
      fakeMeisterplan(kind, 40)
      const adapter = new MeisterplanAdapter()
      const parent = kind === 'resources' ? 'all' : 'p1'
      const params = withPageSink({ page: 1, limit: 5 })
      params['cursor'] = Buffer.from(`api-token-1|${parent}|35`).toString('base64')
      const rows = await run(list, adapter, C1, 'p1', params)
      expect(rows.map((r) => r.id)).toEqual(ids(kind, 'api-token-1', 'p1', 35, 5))
      expect(readUpstreamPage(params)?.hasMore).toBe(false)
    })

    it('with no limit it sends the documented default pageSize of 100', async () => {
      const { requests } = fakeMeisterplan(kind, 30)
      const adapter = new MeisterplanAdapter()
      await run(list, adapter, C1, 'p1', withPageSink({ page: 1 }))
      expect(requests[0]!.params['pageSize']).toBe(100)
    })
  },
)

describe.each([
  ['listTags', 'roles'],
  ['listWorkspaces', 'scenarios'],
] as const)('meisterplan %s pages the whole list locally', (name, kind) => {
  it('sends no undocumented paging input and slices the full response', async () => {
    const { requests } = fakeMeisterplan(kind, 7)
    const adapter = new MeisterplanAdapter()
    const params = withPageSink({ page: 2, limit: 3 })
    const list = LISTS.find(([n]) => n === name)![2]
    const rows = await run(list, adapter, C1, 'p1', params)
    expect(rows.map((r) => r.id)).toEqual(ids(kind, 'api-token-1', 'p1', 3, 3))
    expect(readUpstreamPage(params)).toMatchObject({
      totalCount: 7,
      hasMore: true,
      pagedLocally: true,
    })
    expect(requests[0]!.params['pageSize']).toBeUndefined()
    expect(requests[0]!.params['pageAfter']).toBeUndefined()
  })
})

describe('meisterplan tasks read the task-management link', () => {
  it('getTask reads GET /scenarios/{sid}/projects/{pid}/taskManagementLink/tasks/{taskId}', async () => {
    const requests: Req[] = []
    vi.mocked(axios.create).mockImplementation(((config?: {
      headers?: Record<string, unknown>
    }) => {
      const token = String(config?.headers?.['Authorization'] ?? '')
      const get = vi.fn(async (path: string, cfg?: { params?: Record<string, unknown> }) => {
        requests.push({ token, path, params: { ...(cfg?.params ?? {}) } })
        if (path !== '/scenarios/s1/projects/p1/taskManagementLink/tasks/t1')
          throw new Error(`unexpected path ${path}`)
        return { data: { id: 't1', key: 'TSK001', name: 'Implement new feature', status: 'OPEN' } }
      })
      return { get }
    }) as unknown as typeof axios.create)
    const task = await new MeisterplanAdapter().getTask(C1, 's1/p1/t1')
    expect(requests.map((r) => r.path)).toEqual([
      '/scenarios/s1/projects/p1/taskManagementLink/tasks/t1',
    ])
    expect(task).toMatchObject({ id: 't1', projectId: 'p1', title: 'Implement new feature' })
  })

  it('listTasks never calls the undocumented /projects/{pid}/tasks path', async () => {
    const { requests } = fakeMeisterplan('tasks', 3)
    await new MeisterplanAdapter().listTasks(C1, 'p9', withPageSink({ page: 1, limit: 10 }))
    expect(requests.map((r) => r.path)).toEqual([
      '/scenarios/PlanOfRecord/projects/p9/taskManagementLink/tasks',
    ])
    expect(Object.keys(requests[0]!.params).sort()).toEqual(['pageSize'])
  })

  it('listTasks splits a "scenarioId/projectId" parent into the path and the bare projectId', async () => {
    const requests: Req[] = []
    vi.mocked(axios.create).mockImplementation(((config?: {
      headers?: Record<string, unknown>
    }) => {
      const token = String(config?.headers?.['Authorization'] ?? '')
      const get = vi.fn(async (path: string, cfg?: { params?: Record<string, unknown> }) => {
        requests.push({ token, path, params: { ...(cfg?.params ?? {}) } })
        if (path !== '/scenarios/s7/projects/p7/taskManagementLink/tasks')
          throw new Error(`unexpected path ${path}`)
        return {
          data: {
            items: [{ id: 't1', key: 'TSK001', name: 'Implement new feature', status: 'OPEN' }],
            _pagination: {},
          },
        }
      })
      return { get }
    }) as unknown as typeof axios.create)
    const tasks = await new MeisterplanAdapter().listTasks(
      C1,
      's7/p7',
      withPageSink({ page: 1, limit: 10 }),
    )
    expect(requests.map((r) => r.path)).toEqual([
      '/scenarios/s7/projects/p7/taskManagementLink/tasks',
    ])
    expect(tasks).toHaveLength(1)
    expect(tasks[0]).toMatchObject({ id: 't1', projectId: 'p7' })
    expect(tasks[0]!.metadata).toMatchObject({ scenarioId: 's7' })
  })
})
