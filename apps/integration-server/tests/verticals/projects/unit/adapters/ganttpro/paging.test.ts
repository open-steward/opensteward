/**
 * GanttPRO list paging: every list endpoint returns the whole collection, so
 * each is paged locally.
 *
 * GanttPRO's API reference (https://developer.ganttpro.com/, whose content is
 * served as JSON from https://developer.ganttpro.com/api/api-docs/public/document)
 * documents no paging parameter on any list endpoint, and each returns a bare
 * array (GET /team a single object):
 *
 *   GET /projects  — "Returns all active projects of the team."  (no query params)
 *   GET /users     — "Returns all members of the team."          (no query params)
 *   GET /tasks     — "Returns the tasks of a project. Any of the listed query
 *                    fields can be used as filters, and select limits which
 *                    fields are returned for each task."          (filters only)
 *   GET /comments  — "Returns the comments of the task given by the taskId
 *                    query parameter."                            (taskId only)
 *   GET /team      — "Returns the team the API key belongs to: its name, owner
 *                    and general information."
 *
 * Before the fix every page returned the same rows, so page 2 repeated page 1.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import {
  listPage,
  parseListQuery,
  readUpstreamPage,
  withPageSink,
  type QueryParams,
} from '@opensteward/shared'
import { GanttproAdapter } from '../../../../../../src/verticals/projects/adapters/ganttpro/index'

const CREDS = { accessToken: 'gp_test' }
const L = 2
const N = 2 * L + 1
const PROJECT_ID = '77'
const TASK_ID = '88'

/** Query parameters each endpoint documents; anything else is refused. */
const DOCUMENTED: Record<string, string[]> = {
  '/projects': [],
  '/users': [],
  '/team': [],
  '/tasks': ['projectId'],
  '/comments': ['taskId'],
}

function fakeGanttpro() {
  const get = vi.fn(async (p: string, cfg?: { params?: Record<string, unknown> }) => {
    const params = cfg?.params ?? {}
    const allowed = DOCUMENTED[p]
    if (!allowed) throw new Error(`unexpected path ${p}`)
    const bad = Object.keys(params).filter((k) => !allowed.includes(k))
    if (bad.length > 0)
      throw new Error(`undocumented query parameter(s) on ${p}: ${bad.join(', ')}`)
    const ids = Array.from({ length: N }, (_, i) => i + 1)
    switch (p) {
      case '/projects':
        return { data: ids.map((i) => ({ projectId: i, name: `P${i}` })) }
      case '/users':
        return { data: ids.map((i) => ({ id: i, teamId: 5, email: `u${i}@x.test` })) }
      case '/tasks':
        return {
          data: ids.map((i) => ({ id: i, projectId: Number(params.projectId), name: `T${i}` })),
        }
      case '/comments':
        return {
          data: ids.map((i) => ({ id: i, taskId: Number(params.taskId), content: `c${i}` })),
        }
      case '/team':
        return { data: { id: 5, ownerId: 1, name: 'Acme' } }
    }
    throw new Error('unreachable')
  })
  vi.spyOn(axios, 'create').mockReturnValue({ get, post: vi.fn() } as never)
  return { get }
}

const adapter = () => new GanttproAdapter()

type Lister = (params: QueryParams) => Promise<Array<{ id: string }>>
const LISTS: Record<string, { run: Lister; total: number }> = {
  listProjects: { run: (p) => adapter().listProjects(CREDS, p), total: N },
  listTasks: { run: (p) => adapter().listTasks(CREDS, PROJECT_ID, p), total: N },
  listComments: { run: (p) => adapter().listComments(CREDS, TASK_ID, p), total: N },
  listUsers: { run: (p) => adapter().listUsers(CREDS, '5', p), total: N },
  listWorkspaces: { run: (p) => adapter().listWorkspaces(CREDS, p), total: 1 },
}

afterEach(() => vi.restoreAllMocks())

describe.each(Object.entries(LISTS))('ganttpro %s paging', (name, { run, total }) => {
  const all = total === 1 ? ['5'] : Array.from({ length: total }, (_, i) => String(i + 1))

  it('walking pages 1..3 returns every id once, in order, with exact hasMore', async () => {
    fakeGanttpro()
    const seen: string[] = []
    for (let k = 1; k <= 3; k++) {
      const params = withPageSink({ page: k, limit: L })
      const rows = await run(params)
      seen.push(...rows.map((r) => r.id))
      expect(rows).toHaveLength(Math.max(0, Math.min(L, total - (k - 1) * L)))
      expect(readUpstreamPage(params)).toMatchObject({
        hasMore: k * L < total,
        totalCount: total,
        pagedLocally: true,
      })
    }
    expect(seen).toEqual(all)
  })

  it('page 2 sends only the documented parameters', async () => {
    const { get } = fakeGanttpro()
    await run(withPageSink({ page: 2, limit: L }))
    const [, cfg] = get.mock.calls[0] as [string, { params?: Record<string, unknown> }?]
    const keys = Object.keys(cfg?.params ?? {})
    expect(keys.every((k) => ['projectId', 'taskId'].includes(k))).toBe(true)
  })

  it('a limit above the collection returns it all and reports the end', async () => {
    fakeGanttpro()
    const params = withPageSink({ page: 1, limit: 500 })
    expect((await run(params)).map((r) => r.id)).toEqual(all)
    expect(readUpstreamPage(params)).toMatchObject({ hasMore: false, totalCount: total })
  })

  it(`API path: parseListQuery + listPage (${name})`, async () => {
    fakeGanttpro()
    const p2 = withPageSink(parseListQuery({ page: '2', limit: String(L) }))
    const env = listPage(await run(p2), p2, 'ganttpro')
    expect(env.data.map((r) => r.id)).toEqual(all.slice(L, 2 * L))
    expect(env.meta).toMatchObject({ page: 2, hasMore: 2 * L < total, totalCount: total })
  })
})
