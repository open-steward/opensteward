/**
 * Toggl Plan list paging: every list endpoint returns the whole collection as
 * a bare JSON array, so each is paged locally.
 *
 * Toggl Plan API v5 (https://developers.plan.toggl.com/api-v5.html) documents
 * no paging parameter on any list endpoint. "Fetch list of projects",
 * "Fetch list of groups" and "Fetch list of members" take only the
 * `workspace` path parameter; "Fetch list of tasks" takes
 * `GET /1/tasks/timeline?since=&until=&users=&project=&tasks=&group=&tags=`
 * (filters only). Each responds `Response 200 Content-Type: application/json [ ... ]`.
 *
 * Before the fix each list method ignored `page`, so page 2 repeated page 1.
 * Now `pageLocally` slices by `page`/`limit` and reports the total, so
 * `hasMore` is exact.
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
import { TogglPlanAdapter } from '../../../../../../src/verticals/projects/adapters/toggl-plan/index'

const WS = '77'
const CREDS = { accessToken: 'toggl-plan-token', extra: { workspaceId: WS } }

const L = 3
const N = 2 * L + 1

/** Documented query params per path; anything else (a paging key) is refused. */
const DOCUMENTED: Record<string, string[]> = {
  [`/${WS}/projects`]: [],
  [`/${WS}/tasks/timeline`]: [
    'since',
    'until',
    'users',
    'project',
    'tasks',
    'group',
    'tags',
    'filter',
  ],
  [`/${WS}/groups`]: [],
  [`/${WS}/members`]: [],
}

function rows(n: number) {
  return Array.from({ length: n }, (_, i) => i + 1)
}

function fakeTogglPlan(n = N) {
  const get = vi.fn(async (path: string, config?: { params?: Record<string, unknown> }) => {
    const allowed = DOCUMENTED[path]
    if (!allowed) throw new Error(`unexpected path ${path}`)
    for (const k of Object.keys(config?.params ?? {})) {
      if (!allowed.includes(k)) throw new Error(`undocumented param ${k} on ${path}`)
    }
    const ids = rows(n)
    switch (path) {
      case `/${WS}/projects`:
        return { data: ids.map((i) => ({ id: i, name: `P${i}`, archived: false })) }
      case `/${WS}/tasks/timeline`:
        return { data: ids.map((i) => ({ id: i, name: `T${i}`, status: 'open' })) }
      case `/${WS}/groups`:
        return { data: ids.map((i) => ({ id: i, name: `G${i}`, memberships: [] })) }
      case `/${WS}/members`:
        return {
          data: ids.map((i) => ({ id: i, name: `U${i}`, email: `u${i}@x.test`, active: true })),
        }
    }
    throw new Error('unreachable')
  })
  vi.spyOn(axios, 'create').mockReturnValue({ get } as never)
  return { get }
}

const adapter = () => new TogglPlanAdapter()

type Lister = (params: QueryParams) => Promise<{ id: string }[]>
const LISTS: Record<string, Lister> = {
  listProjects: (p) => adapter().listProjects(CREDS, p),
  listTasks: (p) => adapter().listTasks(CREDS, '5', p),
  listWorkspaces: (p) => adapter().listWorkspaces(CREDS, p),
  listUsers: (p) => adapter().listUsers(CREDS, WS, p),
}

const PATH: Record<string, string> = {
  listProjects: `/${WS}/projects`,
  listTasks: `/${WS}/tasks/timeline`,
  listWorkspaces: `/${WS}/groups`,
  listUsers: `/${WS}/members`,
}

afterEach(() => vi.restoreAllMocks())

describe.each(Object.entries(LISTS))('toggl-plan %s paging', (name, list) => {
  it('requests only its documented endpoint', async () => {
    const { get } = fakeTogglPlan()
    await list(withPageSink({ page: 2, limit: L }))
    expect(get).toHaveBeenCalled()
    for (const [path] of get.mock.calls) expect(path).toBe(PATH[name])
  })

  it('walks pages 1..3 at limit L and yields every row once, in order, with exact hasMore', async () => {
    fakeTogglPlan()
    const seen: string[] = []
    const expectedHasMore = [true, true, false]
    for (let k = 1; k <= 3; k++) {
      const params = withPageSink({ page: k, limit: L })
      const got = (await list(params)).map((r) => r.id)
      expect(got.length).toBe(k < 3 ? L : 1)
      seen.push(...got)
      expect(readUpstreamPage(params)).toMatchObject({
        hasMore: expectedHasMore[k - 1],
        totalCount: N,
        pagedLocally: true,
      })
    }
    expect(seen).toEqual(rows(N).map(String))
  })

  it('page 2 sends no paging parameter upstream (none is documented) and differs from page 1', async () => {
    const { get } = fakeTogglPlan()
    const p1 = (await list(withPageSink({ page: 1, limit: L }))).map((r) => r.id)
    const p2 = (await list(withPageSink({ page: 2, limit: L }))).map((r) => r.id)
    expect(p2).not.toEqual(p1)
    for (const [, config] of get.mock.calls) {
      const keys = Object.keys((config as { params?: object } | undefined)?.params ?? {})
      expect(keys).not.toContain('page')
      expect(keys).not.toContain('limit')
      expect(keys).not.toContain('offset')
    }
  })

  it('a limit above the collection size returns everything and reports the end', async () => {
    fakeTogglPlan()
    const params = withPageSink({ page: 1, limit: 500 })
    expect((await list(params)).length).toBe(N)
    expect(readUpstreamPage(params)).toMatchObject({ hasMore: false, totalCount: N })
  })

  it('a limit above the router maximum is clamped and still pages locally', async () => {
    fakeTogglPlan()
    const params = parseListQuery({ page: '1', limit: '1000000' })
    expect(params.limit).toBeLessThan(1000000)
    expect((await list(params)).length).toBe(N)
    expect(readUpstreamPage(params)).toMatchObject({ hasMore: false, totalCount: N })
  })

  it('API path: parseListQuery + listPage report exact meta', async () => {
    fakeTogglPlan()
    const p2 = withPageSink(parseListQuery({ page: '2', limit: String(L) }))
    const env2 = listPage(await list(p2), p2, 'toggl-plan')
    expect(env2.data.map((r) => r.id)).toEqual(['4', '5', '6'])
    expect(env2.meta).toMatchObject({ page: 2, hasMore: true, totalCount: N })

    const p3 = withPageSink(parseListQuery({ page: '3', limit: String(L) }))
    const env3 = listPage(await list(p3), p3, 'toggl-plan')
    expect(env3.data.map((r) => r.id)).toEqual(['7'])
    expect(env3.meta).toMatchObject({ page: 3, hasMore: false, totalCount: N })
  })
})

describe('toggl-plan listTasks keeps the documented project filter on every page', () => {
  it('sends project=<id> on page 2', async () => {
    const { get } = fakeTogglPlan()
    await adapter().listTasks(CREDS, '5', withPageSink({ page: 2, limit: L }))
    expect(get.mock.calls.length).toBeGreaterThan(0)
    for (const [, config] of get.mock.calls) expect(config?.params?.project).toBe('5')
  })
})
