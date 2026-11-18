/**
 * Process Street lists are "returned 20 at a time" and page by the opaque `_`
 * cursor of the `links[]` entry named "next" ("Keep following `next.href`
 * until the `next` link is absent — that's the end."), with no page-size
 * parameter (https://public-api.process.st/api/v1.1/docs/openapi.json).
 * The adapter cuts the caller's exact page out of those 20-row pages with
 * pageByRows. listTasks flattens the tasks of every run of a workflow, so
 * its upstream pages are uneven (a run's last page, runs with no tasks).
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
import { ProcessStreetAdapter } from '../../../../../../src/verticals/projects/adapters/process-street/index'
import { TaskSchema } from '../../../../../../src/verticals/projects/schema/task'
import { ProjectSchema } from '../../../../../../src/verticals/projects/schema/project'
import { UserSchema } from '../../../../../../src/verticals/projects/schema/user'
import { PS_PAGE, fakeProcessStreet, runId, taskRawId, userId, wfId, type FakeWorld } from './fake'

vi.mock('axios')

const C1: Credentials = { accessToken: 'k1' }
const C2: Credentials = { accessToken: 'k2' }
const WF = 'wf-parent'

/**
 * Task counts per run of WF: uneven, with empty runs, a run longer than one
 * upstream page (45 → 20/20/5), and more than 20 runs so the runs list itself
 * pages. Total 263, odd, so N = 2L + 1 with L = 131.
 */
const RUN_COUNTS = [7, 0, 45, 3, 20, 0, 1, 12, 9, 30, 2, 0, 5, 8, 21, 4, 6, 0, 11, 19, 13, 1, 26]
const TASK_TOTAL = RUN_COUNTS.reduce((a, b) => a + b, 0)

function taskIds(token: string): string[] {
  const out: string[] = []
  RUN_COUNTS.forEach((n, r) => {
    const run = runId(token, WF, r)
    for (let t = 0; t < n; t++) out.push(`${run}:${taskRawId(r, t)}`)
  })
  return out
}

type Kind = 'projects' | 'users' | 'tasks'
type Lister = (a: ProcessStreetAdapter, c: Credentials, p: QueryParams) => Promise<{ id: string }[]>

const LISTS: Array<[Kind, Lister, (token: string) => string[]]> = [
  [
    'projects',
    (a, c, p) => a.listProjects(c, p),
    (tok) => Array.from({ length: 81 }, (_, i) => wfId(tok, i)),
  ],
  [
    'users',
    (a, c, p) => a.listUsers(c, 'ignored', p),
    (tok) => Array.from({ length: 81 }, (_, i) => userId(tok, i)),
  ],
  ['tasks', (a, c, p) => a.listTasks(c, WF, p), taskIds],
]

function world(): FakeWorld {
  return { workflows: 81, users: 81, runs: { [WF]: RUN_COUNTS } }
}

beforeEach(() => _resetCursorPager())
afterEach(() => vi.clearAllMocks())

describe.each(LISTS)('process-street %s pages at the caller size', (kind, list, all) => {
  it('N = 2L+1 rows at limit L: pages 1-3 serve every id once, in order, hasMore exact', async () => {
    fakeProcessStreet(world())
    const expected = all('k1')
    expect(expected.length % 2).toBe(1)
    const L = (expected.length - 1) / 2
    const a = new ProcessStreetAdapter()
    const served: string[] = []
    const more: Array<boolean | undefined> = []
    for (let page = 1; page <= 3; page++) {
      const params = withPageSink({ page, limit: L })
      const rows = await list(a, C1, params)
      served.push(...rows.map((r) => r.id))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(served).toEqual(expected)
    expect(new Set(served).size).toBe(served.length)
    expect(more).toEqual([true, true, false])
  })

  it('API path: parseListQuery + listPage at limit 7 walks the whole collection once', async () => {
    fakeProcessStreet(world())
    const a = new ProcessStreetAdapter()
    const served: string[] = []
    for (let page = 1; page < 200; page++) {
      const params = parseListQuery({ limit: '7', page: String(page) }, {})
      const env = listPage(await list(a, C1, params), params, 'process-street')
      served.push(...env.data.map((r) => r.id))
      if (env.meta.hasMore !== true) break
    }
    expect(served).toEqual(all('k1'))
  })

  it('a direct jump to page 3 serves the same rows as a sequential walk', async () => {
    fakeProcessStreet(world())
    const rows = await list(new ProcessStreetAdapter(), C1, withPageSink({ page: 3, limit: 10 }))
    expect(rows.map((r) => r.id)).toEqual(all('k1').slice(20, 30))
  })

  it('two connections interleaved each walk their own rows', async () => {
    fakeProcessStreet(world())
    const a = new ProcessStreetAdapter()
    const a1 = await list(a, C1, withPageSink({ page: 1, limit: 30 }))
    const b2 = await list(a, C2, withPageSink({ page: 2, limit: 30 }))
    const a2 = await list(a, C1, withPageSink({ page: 2, limit: 30 }))
    expect(a1.map((r) => r.id)).toEqual(all('k1').slice(0, 30))
    expect(b2.map((r) => r.id)).toEqual(all('k2').slice(30, 60))
    expect(a2.map((r) => r.id)).toEqual(all('k1').slice(30, 60))
  })

  it('every row parses against the canonical schema', async () => {
    fakeProcessStreet(world())
    const rows = await list(new ProcessStreetAdapter(), C1, withPageSink({ page: 1, limit: 50 }))
    const schema = kind === 'projects' ? ProjectSchema : kind === 'users' ? UserSchema : TaskSchema
    for (const r of rows) expect(() => schema.parse(r)).not.toThrow()
  })
})

describe('process-street request shape', () => {
  it('listProjects: page 1 sends no `_`; page 2 sends the `_` of the next link and nothing else', async () => {
    const { requests } = fakeProcessStreet(world())
    const a = new ProcessStreetAdapter()
    await a.listProjects(C1, withPageSink({ page: 1, limit: PS_PAGE }))
    await a.listProjects(C1, withPageSink({ page: 2, limit: PS_PAGE }))
    const wf = requests.filter((r) => r.path === '/workflows')
    expect(wf[0]!.params).toEqual({})
    expect(wf.some((r) => r.params['_'] === 'k1|wf|20')).toBe(true)
    for (const r of wf) expect(Object.keys(r.params).every((k) => k === '_')).toBe(true)
  })

  it('listProjects marks rows active ("Returns a list of active workflows.")', async () => {
    fakeProcessStreet(world())
    const rows = await new ProcessStreetAdapter().listProjects(
      C1,
      withPageSink({ page: 1, limit: 5 }),
    )
    expect(rows.map((r) => r.status)).toEqual(Array(5).fill('active'))
  })

  it('listUsers reads GET /users, never /members', async () => {
    const { requests } = fakeProcessStreet(world())
    await new ProcessStreetAdapter().listUsers(C1, 'ws', withPageSink({ page: 1, limit: 5 }))
    expect(requests.map((r) => r.path)).toEqual(['/users'])
  })

  it("listTasks lists the runs of the workflow, then each run's tasks", async () => {
    const { requests } = fakeProcessStreet(world())
    await new ProcessStreetAdapter().listTasks(C1, WF, withPageSink({ page: 1, limit: 3 }))
    // Exactly workflowId: no `status`, which would drop runs ("Omit this filter
    // to include all non-deleted runs.").
    expect(requests[0]).toEqual({
      token: 'k1',
      path: '/workflow-runs/list',
      params: { workflowId: WF },
    })
    expect(requests[1]).toMatchObject({
      path: `/workflow-runs/${runId('k1', WF, 0)}/tasks`,
      params: {},
    })
  })

  it('listTasks follows the runs list past its first 20 runs', async () => {
    const { requests } = fakeProcessStreet(world())
    await new ProcessStreetAdapter().listTasks(C1, WF, withPageSink({ page: 1, limit: TASK_TOTAL }))
    const runPages = requests.filter((r) => r.path === '/workflow-runs/list')
    expect(runPages.map((r) => r.params['_'])).toEqual([undefined, `k1|runs|${WF}|20`])
  })

  it('every runs request carries only workflowId and `_`', async () => {
    const { requests } = fakeProcessStreet(world())
    await new ProcessStreetAdapter().listTasks(C1, WF, withPageSink({ page: 1, limit: TASK_TOTAL }))
    const runPages = requests.filter((r) => r.path === '/workflow-runs/list')
    expect(runPages.map((r) => r.params)).toEqual([
      { workflowId: WF },
      { workflowId: WF, _: `k1|runs|${WF}|20` },
    ])
  })

  it('two workflows interleaved on one connection each walk their own tasks', async () => {
    const WF2 = 'wf-other'
    const counts2 = [25, 3, 40]
    fakeProcessStreet({ ...world(), runs: { [WF]: RUN_COUNTS, [WF2]: counts2 } })
    const all2: string[] = []
    counts2.forEach((n, r) => {
      const run = runId('k1', WF2, r)
      for (let t = 0; t < n; t++) all2.push(`${run}:${taskRawId(r, t)}`)
    })
    const a = new ProcessStreetAdapter()
    const a1 = await a.listTasks(C1, WF, withPageSink({ page: 1, limit: 30 }))
    const b2 = await a.listTasks(C1, WF2, withPageSink({ page: 2, limit: 30 }))
    const a2 = await a.listTasks(C1, WF, withPageSink({ page: 2, limit: 30 }))
    expect(a1.map((r) => r.id)).toEqual(taskIds('k1').slice(0, 30))
    expect(b2.map((r) => r.id)).toEqual(all2.slice(30, 60))
    expect(b2.every((r) => r.projectId === WF2)).toBe(true)
    expect(a2.map((r) => r.id)).toEqual(taskIds('k1').slice(30, 60))
  })

  it('projects and users interleaved on one connection keep separate cursors', async () => {
    fakeProcessStreet(world())
    const a = new ProcessStreetAdapter()
    const projects = Array.from({ length: 81 }, (_, i) => wfId('k1', i))
    const users = Array.from({ length: 81 }, (_, i) => userId('k1', i))
    const p2 = await a.listProjects(C1, withPageSink({ page: 2, limit: 30 }))
    const u2 = await a.listUsers(C1, 'ws', withPageSink({ page: 2, limit: 30 }))
    const p3 = await a.listProjects(C1, withPageSink({ page: 3, limit: 30 }))
    expect(p2.map((r) => r.id)).toEqual(projects.slice(30, 60))
    expect(u2.map((r) => r.id)).toEqual(users.slice(30, 60))
    expect(p3.map((r) => r.id)).toEqual(projects.slice(60, 81))
  })

  it('an empty page of runs that carries a next link continues to the next page of runs', async () => {
    const base = 'https://public-api.process.st/api/v1.1'
    vi.mocked(axios.create).mockImplementation((() => ({
      get: vi.fn(async (path: string, cfg?: { params?: Record<string, unknown> }) => {
        const params = cfg?.params ?? {}
        if (path === '/workflow-runs/list' && params['_'] === undefined)
          return {
            data: {
              data: [],
              links: [
                {
                  name: 'next',
                  href: `${base}/workflow-runs/list?workflowId=${WF}&_=r2`,
                  type: 'Api',
                },
              ],
            },
          }
        if (path === '/workflow-runs/list' && params['_'] === 'r2')
          return { data: { data: [{ id: 'run-b', workflowId: WF }], links: [] } }
        if (path === '/workflow-runs/run-b/tasks')
          return {
            data: {
              tasks: [
                {
                  id: 'tb',
                  name: 'B',
                  workflowRunId: 'run-b',
                  status: 'NotCompleted',
                  updatedDate: '2024-09-15T14:32:00.000Z',
                  hidden: false,
                  stopped: false,
                  taskType: 'Standard',
                },
              ],
              links: [],
            },
          }
        throw new Error(`unexpected GET ${path}`)
      }),
    })) as unknown as typeof axios.create)
    const params = withPageSink({ page: 1, limit: 10 })
    const rows = await new ProcessStreetAdapter().listTasks(C1, WF, params)
    expect(rows.map((r) => r.id)).toEqual(['run-b:tb'])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('a workflow with no runs is an empty, complete list', async () => {
    fakeProcessStreet(world())
    const params = withPageSink({ page: 1, limit: 10 })
    const rows = await new ProcessStreetAdapter().listTasks(C1, 'wf-none', params)
    expect(rows).toEqual([])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('an upstream page reads exactly 20 rows whatever the limit', async () => {
    fakeProcessStreet(world())
    const rows = await new ProcessStreetAdapter().listProjects(
      C1,
      withPageSink({ page: 1, limit: 500 }),
    )
    expect(rows).toHaveLength(81)
  })

  it('a next link without `_` throws instead of ending the list', async () => {
    vi.mocked(axios.create).mockImplementation((() => ({
      get: vi.fn(async () => ({
        data: {
          workflows: [
            {
              id: 'w',
              name: 'W',
              audit: {
                createdDate: '2024-09-15T14:32:00.000Z',
                updatedDate: '2024-09-15T14:32:00.000Z',
              },
            },
          ],
          links: [
            { name: 'next', href: 'https://public-api.process.st/api/v1.1/workflows', type: 'Api' },
          ],
        },
      })),
    })) as unknown as typeof axios.create)
    await expect(
      new ProcessStreetAdapter().listProjects(C1, withPageSink({ page: 1, limit: 5 })),
    ).rejects.toThrow(/no "_" cursor/)
  })
})
