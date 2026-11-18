/**
 * listProjects and listWorkspaces against the documented v1.0 envelopes.
 * From https://developers.niftypm.com/docs/api/v1.0/1.0/nifty-v1-openapi.json:
 *
 *   GET /api/v1.0/projects — parameters `subteam_id` ("Subteam ID"),
 *   `archived`, `limit` ("No of records to fetch"), `offset` ("Record
 *   Offset"), `sort`; 200 → ProjectListResponse, `required: ["projects",
 *   "hasMore"]`, `hasMore`: "True if there are more record else false".
 *
 *   GET /api/v1.0/subteams — `"parameters": []`; 200 → GetSubTeamsResponse:
 *   `subteams` (array of SubteamResponse), `items` (boolean, "True if there
 *   are more record else false"), `hasMore` (boolean).
 *
 * Both methods used to read rows from `items`, so against the documented API
 * they returned no rows at all. The fakes below answer ONLY with the
 * documented envelopes and honour ONLY the documented parameters.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { withPageSink, readUpstreamPage } from '@opensteward/shared'
import type { Credentials } from '@opensteward/shared'
import { NiftyAdapter } from '../../../../../../src/verticals/projects/adapters/nifty/index'
import { ProjectSchema } from '../../../../../../src/verticals/projects/schema/project'
import { WorkspaceSchema } from '../../../../../../src/verticals/projects/schema/workspace'

vi.mock('axios')

const C1: Credentials = { accessToken: 'tok-1' }

/** Documented default of `limit`. */
const NIFTY_DEFAULT = 25

interface Req {
  token: string
  path: string
  params: Record<string, unknown>
}

const PROJECT_PARAMS = new Set(['subteam_id', 'archived', 'limit', 'offset', 'sort'])

/** Shape of the documented ProjectResponse example, with a varying id. */
function project(n: number, subteam: string): Record<string, unknown> {
  return {
    id: `P${String(n).padStart(5, '0')}`,
    nice_id: 'PROJ',
    name: `Website relaunch ${n}`,
    description: 'Marketing site rebuild for the Q4 launch.',
    initials: 'WR',
    logo: null,
    color: '#00A99B',
    secondary_color: '#0F172A',
    demo: false,
    archived: false,
    auto_milestones: false,
    default_tasks_view: 'kanban',
    access_type: 'team',
    owner: 'i5vtiganU9y25V',
    members: ['i5vtiganU9y25V', 'j7kwmqbxT2p9Lm'],
    general_discussion: 'Ds3vRk8Wq',
    subteam,
    progress: 42,
    joined: true,
    general_discussion_muted: false,
    enabled_modules: ['tasks', 'discussions', 'docs'],
    disabled_modules: ['time'],
    total_story_points: 34,
    completed_story_points: 13,
    removed: false,
  }
}

function subteam(n: number): Record<string, unknown> {
  return {
    id: `S${String(n).padStart(5, '0')}`,
    name: `Portfolio ${n}`,
    initials: 'PF',
    logo: '',
    color: '#00A99B',
    secondary_color: '#0F172A',
    is_general: n === 0,
    owner: 'i5vtiganU9y25V',
    members: ['i5vtiganU9y25V'],
  }
}

function num(raw: unknown, fallback: number): number {
  if (raw === undefined) return fallback
  const n = Number(raw)
  if (!Number.isInteger(n) || n < 0) throw new Error(`invalid paging value ${String(raw)}`)
  return n
}

interface FakeOpts {
  projects?: number
  subteams?: number
  /** hasMore on GET /subteams (documented as a boolean; defaults to false). */
  subteamsHasMore?: boolean
  /** items on GET /subteams (documented as a boolean more flag; defaults to false). */
  subteamsItems?: boolean
  /** Answer without the documented rows key, to check it is not read as empty. */
  omitRowsKey?: boolean
}

function fakeNifty(opts: FakeOpts, requests: Req[] = []) {
  vi.mocked(axios.create).mockImplementation(((config?: { headers?: Record<string, unknown> }) => {
    const token = String(config?.headers?.['Authorization'] ?? '').replace(/^Bearer /, '')
    const get = vi.fn(async (path: string, cfg?: { params?: Record<string, unknown> }) => {
      const params = { ...(cfg?.params ?? {}) }
      requests.push({ token, path, params })
      if (path === '/projects') {
        for (const k of Object.keys(params)) {
          if (!PROJECT_PARAMS.has(k)) throw new Error(`undocumented /projects param ${k}`)
        }
        const st = params['subteam_id'] === undefined ? 'St5hYc1Bn' : String(params['subteam_id'])
        const all = Array.from({ length: opts.projects ?? 0 }, (_, i) => project(i, st))
        const lim = num(params['limit'], NIFTY_DEFAULT)
        const off = num(params['offset'], 0)
        const page = all.slice(off, off + lim)
        // "hasMore is true whenever the page came back full".
        if (opts.omitRowsKey) return { data: { hasMore: false } }
        return { data: { projects: page, hasMore: page.length === lim } }
      }
      if (path === '/subteams') {
        if (Object.keys(params).length > 0) {
          throw new Error(
            `GET /subteams documents no parameters, got ${Object.keys(params).join(',')}`,
          )
        }
        const all = Array.from({ length: opts.subteams ?? 0 }, (_, i) => subteam(i))
        const hasMore = opts.subteamsHasMore ?? false
        const items = opts.subteamsItems ?? false
        if (opts.omitRowsKey) return { data: { items, hasMore } }
        return { data: { subteams: all, items, hasMore } }
      }
      throw new Error(`unexpected path ${path}`)
    })
    return { get }
  }) as unknown as typeof axios.create)
  return { requests }
}

function adapter(): NiftyAdapter {
  return new NiftyAdapter({ clientId: 'c', clientSecret: 's', redirectUri: 'https://x/cb' })
}

function pid(n: number): string {
  return `P${String(n).padStart(5, '0')}`
}

afterEach(() => vi.clearAllMocks())

describe('nifty listProjects reads the documented { projects, hasMore } envelope', () => {
  it('returns the rows under `projects`, each parsing as a canonical Project', async () => {
    fakeNifty({ projects: 3 })
    const rows = await adapter().listProjects(C1, withPageSink({ page: 1, limit: 10 }))
    expect(rows.map((r) => r.id)).toEqual([pid(0), pid(1), pid(2)])
    for (const r of rows) expect(() => ProjectSchema.parse(r)).not.toThrow()
    expect(rows[0]!.workspaceId).toBe('St5hYc1Bn')
  })

  it('N = 2L+1 rows at limit L: pages 1-3 serve every id once, in order, hasMore exact', async () => {
    const L = 40
    fakeNifty({ projects: 2 * L + 1 })
    const a = adapter()
    const served: string[] = []
    const more: Array<boolean | undefined> = []
    for (let page = 1; page <= 3; page++) {
      const params = withPageSink({ page, limit: L })
      const rows = await a.listProjects(C1, params)
      served.push(...rows.map((r) => r.id))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(served).toEqual(Array.from({ length: 2 * L + 1 }, (_, i) => pid(i)))
    expect(new Set(served).size).toBe(2 * L + 1)
    expect(more).toEqual([true, true, false])
  })

  it('page 2 is fetched with offset = L and limit = L, and nothing undocumented', async () => {
    const L = 40
    const { requests } = fakeNifty({ projects: 2 * L + 1 })
    await adapter().listProjects(C1, withPageSink({ page: 2, limit: L }))
    expect(requests).toHaveLength(1)
    expect(requests[0]!.path).toBe('/projects')
    expect(requests[0]!.params).toEqual({ limit: L, offset: L })
  })

  it('a limit above 100 is sent as 100 and reported as the page size', async () => {
    const { requests } = fakeNifty({ projects: 150 })
    const a = adapter()
    const p1 = withPageSink({ page: 1, limit: 250 })
    await a.listProjects(C1, p1)
    const p2 = withPageSink({ page: 2, limit: 250 })
    const r2 = await a.listProjects(C1, p2)
    expect(requests.map((r) => [r.params['limit'], r.params['offset']])).toEqual([
      [100, 0],
      [100, 100],
    ])
    expect(readUpstreamPage(p1)).toMatchObject({ hasMore: true, pageSize: 100 })
    expect(readUpstreamPage(p2)).toMatchObject({ hasMore: false, pageSize: 100 })
    expect(r2.map((r) => r.id)).toEqual(Array.from({ length: 50 }, (_, i) => pid(100 + i)))
  })

  it('a body without the documented `projects` array fails instead of reading as an empty, complete page', async () => {
    fakeNifty({ projects: 3, omitRowsKey: true })
    const params = withPageSink({ page: 1, limit: 10 })
    await expect(adapter().listProjects(C1, params)).rejects.toThrow(/projects/)
    expect(readUpstreamPage(params)).toBeUndefined()
  })

  it('a workspace_id filter is sent as the documented subteam_id', async () => {
    const { requests } = fakeNifty({ projects: 2 })
    const rows = await adapter().listProjects(
      C1,
      withPageSink({ page: 1, limit: 10, workspace_id: 'St9' }),
    )
    expect(requests[0]!.params).toEqual({ limit: 10, offset: 0, subteam_id: 'St9' })
    expect(rows.every((r) => r.workspaceId === 'St9')).toBe(true)
  })
})

describe('nifty listWorkspaces reads the documented { subteams, items, hasMore } envelope', () => {
  it('returns the rows under `subteams`, each parsing as a canonical Workspace', async () => {
    const { requests } = fakeNifty({ subteams: 2 })
    const rows = await adapter().listWorkspaces(C1, withPageSink({ page: 1, limit: 10 }))
    expect(rows.map((r) => r.id)).toEqual(['S00000', 'S00001'])
    for (const r of rows) expect(() => WorkspaceSchema.parse(r)).not.toThrow()
    expect(requests).toEqual([{ token: 'tok-1', path: '/subteams', params: {} }])
  })

  it('N = 2L+1 subteams at limit L: pages 1-3 serve every id once, hasMore exact, one unpaged request each', async () => {
    const L = 4
    const { requests } = fakeNifty({ subteams: 2 * L + 1 })
    const a = adapter()
    const served: string[] = []
    const more: Array<boolean | undefined> = []
    for (let page = 1; page <= 3; page++) {
      const params = withPageSink({ page, limit: L })
      const rows = await a.listWorkspaces(C1, params)
      served.push(...rows.map((r) => r.id))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(served).toEqual(
      Array.from({ length: 2 * L + 1 }, (_, i) => `S${String(i).padStart(5, '0')}`),
    )
    expect(more).toEqual([true, true, false])
    expect(requests.every((r) => Object.keys(r.params).length === 0)).toBe(true)
  })

  it('refuses to pretend completeness when Nifty reports more subteams it documents no way to fetch', async () => {
    fakeNifty({ subteams: 3, subteamsHasMore: true, subteamsItems: true })
    await expect(
      adapter().listWorkspaces(C1, withPageSink({ page: 1, limit: 10 })),
    ).rejects.toThrow(/hasMore/)
  })

  it('refuses when only `hasMore` is true', async () => {
    fakeNifty({ subteams: 3, subteamsHasMore: true, subteamsItems: false })
    await expect(
      adapter().listWorkspaces(C1, withPageSink({ page: 1, limit: 10 })),
    ).rejects.toThrow(/hasMore/)
  })

  it('refuses when only `items` (the documented more flag) is true', async () => {
    fakeNifty({ subteams: 3, subteamsHasMore: false, subteamsItems: true })
    await expect(
      adapter().listWorkspaces(C1, withPageSink({ page: 1, limit: 10 })),
    ).rejects.toThrow(/hasMore/)
  })

  it('a body without the documented `subteams` array fails instead of reading as an empty, complete collection', async () => {
    fakeNifty({ subteams: 3, omitRowsKey: true })
    const params = withPageSink({ page: 1, limit: 10 })
    await expect(adapter().listWorkspaces(C1, params)).rejects.toThrow(/subteams/)
    expect(readUpstreamPage(params)).toBeUndefined()
  })
})
