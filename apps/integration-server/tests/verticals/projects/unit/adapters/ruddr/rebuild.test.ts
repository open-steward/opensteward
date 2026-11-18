/**
 * Ruddr tasks, task tags and workspaces, rebuilt onto the documented API.
 *
 * - Tasks: "GET /tasks" with `StartingAfter`, `EndingBefore`, `Limit`,
 *   `modifiedAtAfter`, `modifiedAtOnAfter`, `modifiedAtBefore`,
 *   `modifiedAtOnBefore`, `projectId`, `code`, `name`, `nameContains`,
 *   `nameStartsWith`, `nameEndsWith`; "GET /tasks/{id}"
 *   (https://docs.ruddr.io/api-reference/tasks/list-tasks.md, get-a-task.md).
 * - Task tags: "GET /task-tags" (operationId list-task-tags) with
 *   `StartingAfter`, `EndingBefore`, `Limit`, `name`; "GET /task-tags/{id}"
 *   (https://docs.ruddr.io/openapi.json). Task tags, because POST /tasks
 *   `tagIds` is "A list of task tag IDs (`uuid`) to associate with this task."
 * - `limit`: "Can be any number from 1 to 100. Defaults to 10, if not provided."
 * - Workspaces: the published OpenAPI (https://docs.ruddr.io/openapi.json)
 *   has no workspace resource and no `GET /` path, so both workspace methods
 *   refuse before sending anything.
 *
 * The fake honours ONLY those documented parameters and paths.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import axios from 'axios'
import { withPageSink, readUpstreamPage, _resetCursorPager } from '@opensteward/shared'
import type { Credentials } from '@opensteward/shared'
import { RuddrAdapter } from '../../../../../../src/verticals/projects/adapters/ruddr/index'

vi.mock('axios')

const C1: Credentials = { accessToken: 'key-1', extra: {} }
const C2: Credentials = { accessToken: 'key-2', extra: {} }
const RUDDR_DEFAULT = 10
const RUDDR_MAX = 100

interface Req {
  token: string
  path: string
  params: Record<string, unknown>
}

const TASK_PARAMS = new Set([
  'startingAfter',
  'endingBefore',
  'limit',
  'modifiedAtAfter',
  'modifiedAtOnAfter',
  'modifiedAtBefore',
  'modifiedAtOnBefore',
  'projectId',
  'code',
  'name',
  'nameContains',
  'nameStartsWith',
  'nameEndsWith',
])
const TAG_PARAMS = new Set(['startingAfter', 'endingBefore', 'limit', 'name'])

function taskId(token: string, project: string, n: number): string {
  return `task-${token}-${project}-${String(n).padStart(4, '0')}`
}
function tagId(token: string, n: number): string {
  return `ttag-${token}-${String(n).padStart(4, '0')}`
}

function taskRow(token: string, project: string, n: number): Record<string, unknown> {
  // Every other task is modified on 2026-02-01, the rest on 2026-01-01.
  return {
    id: taskId(token, project, n),
    name: `Task ${n}`,
    statusId: 'in_progress',
    recordStatusId: 'active',
    createdAt: '2026-01-01T00:00:00.000Z',
    modifiedAt: n % 2 === 0 ? '2026-02-01T00:00:00.000Z' : '2026-01-01T00:00:00.000Z',
    project: { id: project, name: project },
  }
}

function tagRow(token: string, n: number): Record<string, unknown> {
  return {
    id: tagId(token, n),
    name: `Tag ${n}`,
    isActive: true,
    createdAt: '2025-03-10T14:22:45.183Z',
  }
}

function pageOf(all: Record<string, unknown>[], params: Record<string, unknown>) {
  const limRaw = params['limit']
  const lim = limRaw === undefined ? RUDDR_DEFAULT : Number(limRaw)
  if (!Number.isInteger(lim) || lim < 1 || lim > RUDDR_MAX)
    throw new Error(`limit ${String(limRaw)} out of range`)
  const after = params['startingAfter']
  let start = 0
  if (after !== undefined) {
    const idx = all.findIndex((r) => r['id'] === after)
    if (idx < 0) throw new Error(`Parameter 'startingAfter' is not a valid UUID.`)
    start = idx + 1
  }
  return { results: all.slice(start, start + lim), hasMore: start + lim < all.length }
}

/** `tasksPerProject` tasks in each of projects p1/p2 and `tags` task tags, per API key. */
function fakeRuddr(tasksPerProject: number, tags: number, requests: Req[] = []) {
  vi.mocked(axios.create).mockImplementation(((config?: { headers?: Record<string, unknown> }) => {
    const token = String(config?.headers?.['Authorization'] ?? '').replace(/^Bearer /, '')
    const tasks = ['p1', 'p2'].flatMap((p) =>
      Array.from({ length: tasksPerProject }, (_, i) => taskRow(token, p, i)),
    )
    const tagRows = Array.from({ length: tags }, (_, i) => tagRow(token, i))
    const get = vi.fn(async (path: string, cfg?: { params?: Record<string, unknown> }) => {
      const params = { ...(cfg?.params ?? {}) }
      requests.push({ token, path, params })
      if (path === '/tasks') {
        for (const k of Object.keys(params))
          if (!TASK_PARAMS.has(k)) throw new Error(`undocumented param ${k}`)
        let rows = tasks
        if (params['projectId'] !== undefined)
          rows = rows.filter((t) => (t['project'] as { id: string }).id === params['projectId'])
        if (params['modifiedAtOnAfter'] !== undefined) {
          const floor = Date.parse(String(params['modifiedAtOnAfter']))
          rows = rows.filter((t) => Date.parse(String(t['modifiedAt'])) >= floor)
        }
        return { data: pageOf(rows, params) }
      }
      if (path.startsWith('/tasks/')) {
        const hit = tasks.find((t) => t['id'] === path.slice('/tasks/'.length))
        if (!hit) throw Object.assign(new Error('not found'), { response: { status: 404 } })
        return { data: hit }
      }
      if (path === '/task-tags') {
        for (const k of Object.keys(params))
          if (!TAG_PARAMS.has(k)) throw new Error(`undocumented param ${k}`)
        return { data: pageOf(tagRows, params) }
      }
      throw new Error(`undocumented path ${path}`)
    })
    return { get }
  }) as unknown as typeof axios.create)
  return { requests }
}

function taskIds(token: string, project: string, from: number, n: number): string[] {
  return Array.from({ length: n }, (_, i) => taskId(token, project, from + i))
}

beforeEach(() => _resetCursorPager())
afterEach(() => vi.clearAllMocks())

describe('ruddr listTasks: GET /tasks?projectId= paged by startingAfter', () => {
  it('N = 2L+1 tasks at limit L: pages 1-3 serve every id once, hasMore exact', async () => {
    const L = 7
    fakeRuddr(2 * L + 1, 0)
    const adapter = new RuddrAdapter()
    const served: string[] = []
    const more: Array<boolean | undefined> = []
    for (let page = 1; page <= 3; page++) {
      const params = withPageSink({ page, limit: L })
      served.push(...(await adapter.listTasks(C1, 'p1', params)).map((t) => t.id))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(served).toEqual(taskIds('key-1', 'p1', 0, 2 * L + 1))
    expect(more).toEqual([true, true, false])
  })

  it('sends only the documented path and parameters, with projectId and startingAfter on page 2', async () => {
    const L = 5
    const { requests } = fakeRuddr(2 * L + 1, 0)
    const adapter = new RuddrAdapter()
    await adapter.listTasks(C1, 'p1', withPageSink({ page: 1, limit: L }))
    await adapter.listTasks(C1, 'p1', withPageSink({ page: 2, limit: L }))
    expect(requests.map((r) => r.path)).toEqual(['/tasks', '/tasks'])
    expect(requests[0]!.params).toEqual({ limit: L, projectId: 'p1' })
    expect(requests[1]!.params).toEqual({
      limit: L,
      projectId: 'p1',
      startingAfter: taskId('key-1', 'p1', L - 1),
    })
  })

  it('a limit above the documented maximum is clamped to 100 and the size reported', async () => {
    const { requests } = fakeRuddr(150, 0)
    const adapter = new RuddrAdapter()
    const p1 = withPageSink({ page: 1, limit: 500 })
    const rows = await adapter.listTasks(C1, 'p1', p1)
    expect(requests[0]!.params['limit']).toBe(RUDDR_MAX)
    expect(rows).toHaveLength(RUDDR_MAX)
    expect(readUpstreamPage(p1)).toMatchObject({ hasMore: true, pageSize: RUDDR_MAX })
  })

  it('two projects keep separate cursors', async () => {
    const L = 3
    fakeRuddr(2 * L + 1, 0)
    const adapter = new RuddrAdapter()
    await adapter.listTasks(C1, 'p1', withPageSink({ page: 1, limit: L }))
    const b2 = await adapter.listTasks(C1, 'p2', withPageSink({ page: 2, limit: L }))
    const a2 = await adapter.listTasks(C1, 'p1', withPageSink({ page: 2, limit: L }))
    expect(b2.map((t) => t.id)).toEqual(taskIds('key-1', 'p2', L, L))
    expect(a2.map((t) => t.id)).toEqual(taskIds('key-1', 'p1', L, L))
  })

  it('two connections interleaved each walk their own rows', async () => {
    const L = 3
    fakeRuddr(2 * L + 1, 0)
    const adapter = new RuddrAdapter()
    await adapter.listTasks(C1, 'p1', withPageSink({ page: 1, limit: L }))
    const b2 = await adapter.listTasks(C2, 'p1', withPageSink({ page: 2, limit: L }))
    expect(b2.map((t) => t.id)).toEqual(taskIds('key-2', 'p1', L, L))
  })

  it('updatedAfter is sent as the documented modifiedAtOnAfter and filters the walk', async () => {
    const { requests } = fakeRuddr(10, 0)
    const adapter = new RuddrAdapter()
    const params = withPageSink({
      page: 1,
      limit: 50,
      updatedAfter: new Date('2026-01-15T00:00:00.000Z'),
    })
    const rows = await adapter.listTasks(C1, 'p1', params)
    expect(requests[0]!.params).toEqual({
      limit: 50,
      projectId: 'p1',
      modifiedAtOnAfter: '2026-01-15T00:00:00.000Z',
    })
    expect(rows.map((t) => t.id)).toEqual([0, 2, 4, 6, 8].map((n) => taskId('key-1', 'p1', n)))
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('an explicit cursor still sends projectId and modifiedAtOnAfter', async () => {
    const { requests } = fakeRuddr(10, 0)
    const params = withPageSink({
      page: 1,
      limit: 2,
      cursor: taskId('key-1', 'p1', 0),
      updatedAfter: new Date('2026-01-15T00:00:00.000Z'),
    })
    const rows = await new RuddrAdapter().listTasks(C1, 'p1', params)
    expect(requests[0]!.params).toEqual({
      limit: 2,
      projectId: 'p1',
      modifiedAtOnAfter: '2026-01-15T00:00:00.000Z',
      startingAfter: taskId('key-1', 'p1', 0),
    })
    expect(rows.map((t) => t.id)).toEqual([2, 4].map((n) => taskId('key-1', 'p1', n)))
  })

  it('maps rows through the Task transform (projectId from the documented project.id)', async () => {
    fakeRuddr(1, 0)
    const rows = await new RuddrAdapter().listTasks(C1, 'p1', withPageSink({ page: 1, limit: 10 }))
    expect(rows[0]).toMatchObject({
      projectId: 'p1',
      updatedAt: '2026-02-01T00:00:00.000Z',
      platform: 'ruddr',
    })
  })
})

describe('ruddr getTask: GET /tasks/{id}', () => {
  it('reads a listed id back from /tasks/{id}', async () => {
    const { requests } = fakeRuddr(2, 0)
    const task = await new RuddrAdapter().getTask(C1, taskId('key-1', 'p1', 1))
    expect(requests.map((r) => r.path)).toEqual([`/tasks/${taskId('key-1', 'p1', 1)}`])
    expect(task.id).toBe(taskId('key-1', 'p1', 1))
  })
})

describe('ruddr listTags: GET /task-tags paged by startingAfter', () => {
  it('N = 2L+1 tags at limit L: pages 1-3 serve every id once, hasMore exact', async () => {
    const L = 4
    const { requests } = fakeRuddr(0, 2 * L + 1)
    const adapter = new RuddrAdapter()
    const served: string[] = []
    const more: Array<boolean | undefined> = []
    for (let page = 1; page <= 3; page++) {
      const params = withPageSink({ page, limit: L })
      const rows = await adapter.listTags(C1, 'ws-9', params)
      expect(rows.every((t) => t.workspaceId === 'ws-9')).toBe(true)
      served.push(...rows.map((t) => t.id))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(served).toEqual(Array.from({ length: 2 * L + 1 }, (_, i) => tagId('key-1', i)))
    expect(more).toEqual([true, true, false])
    expect(new Set(requests.map((r) => r.path))).toEqual(new Set(['/task-tags']))
    expect(requests[1]!.params).toEqual({ limit: L, startingAfter: tagId('key-1', L - 1) })
  })

  it('a limit above the documented maximum is clamped to 100 and the size reported', async () => {
    const { requests } = fakeRuddr(0, 120)
    const p1 = withPageSink({ page: 1, limit: 250 })
    await new RuddrAdapter().listTags(C1, 'ws-9', p1)
    expect(requests[0]!.params['limit']).toBe(RUDDR_MAX)
    expect(readUpstreamPage(p1)).toMatchObject({ hasMore: true, pageSize: RUDDR_MAX })
  })
})

describe('ruddr refusals send no request', () => {
  it('getTag refuses 501: Ruddr documents no workspace id for the canonical Tag.workspaceId', async () => {
    const { requests } = fakeRuddr(0, 3)
    await expect(new RuddrAdapter().getTag(C1, tagId('key-1', 0))).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
    })
    expect(requests).toHaveLength(0)
  })

  it('listWorkspaces refuses 501 NOT_SUPPORTED', async () => {
    const { requests } = fakeRuddr(0, 0)
    await expect(
      new RuddrAdapter().listWorkspaces(C1, withPageSink({ page: 1, limit: 10 })),
    ).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
    })
    expect(requests).toHaveLength(0)
  })

  it('getWorkspace refuses 501 NOT_SUPPORTED', async () => {
    const { requests } = fakeRuddr(0, 0)
    await expect(new RuddrAdapter().getWorkspace(C1, 'anything')).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
    })
    expect(requests).toHaveLength(0)
  })
})
