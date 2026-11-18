/**
 * WorkBoard v1 list and read methods against a fake that honours only the
 * documented inputs (https://apidocs.myworkboard.com/openapi.json):
 *
 *   - every response is `{ success, message, data: { totalCount, <resource> } }`;
 *   - GET /wb/apis/goal (no goal_id/team_id): `data.goal` is an array of users,
 *     each with `people_goals`; `limit` (default 15) and `offset`; `goal_status`
 *     "1" active, "2" closed, "1,2" both. The docs do not say whether `limit`
 *     counts users or goals, so the fake runs in both units;
 *   - GET /wb/apis/team: `limit` (default 15), `offset`, `data.totalCount`;
 *     with `team_id`, `data.team` is a single object with `team_members`;
 *   - GET /wb/apis/metric?goal_id=: `limit`/`offset` apply only with `team_id`,
 *     so the goal's metrics come back whole.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import axios from 'axios'
import { withPageSink, readUpstreamPage, _resetCursorPager } from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import { WorkboardAdapter } from '../../../../../../src/verticals/projects/adapters/workboard/index'
import { ProjectSchema } from '../../../../../../src/verticals/projects/schema/project'
import { TaskSchema } from '../../../../../../src/verticals/projects/schema/task'
import { WorkspaceSchema } from '../../../../../../src/verticals/projects/schema/workspace'
import { UserSchema } from '../../../../../../src/verticals/projects/schema/user'

vi.mock('axios')

const CREDS: Credentials = { accessToken: 'tok-1' }
const adapter = new WorkboardAdapter({
  clientId: 'id',
  clientSecret: 'secret',
  redirectUri: 'https://x/cb',
})

interface Req {
  path: string
  params: Record<string, unknown>
}

type Handler = (path: string, params: Record<string, unknown>) => unknown

function fake(handler: Handler): Req[] {
  const requests: Req[] = []
  vi.mocked(axios.create).mockImplementation((() => ({
    get: vi.fn(async (path: string, cfg?: { params?: Record<string, unknown> }) => {
      const params = { ...(cfg?.params ?? {}) }
      requests.push({ path, params })
      return { data: handler(path, params) }
    }),
  })) as unknown as typeof axios.create)
  return requests
}

function envelope(data: Record<string, unknown>): unknown {
  return { success: true, message: '', data }
}

/** Documented `limit`/`offset`: integers >= 0, `limit` default 15. */
function window(params: Record<string, unknown>): { limit: number; offset: number } {
  const limit = params['limit'] === undefined ? 15 : Number(params['limit'])
  const offset = params['offset'] === undefined ? 0 : Number(params['offset'])
  if (!Number.isInteger(limit) || limit < 0) throw new Error(`limit ${String(params['limit'])}`)
  if (!Number.isInteger(offset) || offset < 0) throw new Error(`offset ${String(params['offset'])}`)
  return { limit, offset }
}

beforeEach(() => {
  _resetCursorPager()
  vi.mocked(axios.create).mockReset()
})

async function walk<T extends { id: string }>(
  list: (p: QueryParams) => Promise<T[]>,
  limit: number,
  pages: number,
): Promise<{ ids: string[]; hasMore: Array<boolean | undefined>; rows: T[] }> {
  const ids: string[] = []
  const rows: T[] = []
  const hasMore: Array<boolean | undefined> = []
  for (let page = 1; page <= pages; page++) {
    const params = withPageSink({ page, limit })
    const got = await list(params)
    rows.push(...got)
    ids.push(...got.map((r) => r.id))
    hasMore.push(readUpstreamPage(params)?.hasMore)
  }
  return { ids, hasMore, rows }
}

// ── Projects (goals) ─────────────────────────────────────────────────────────

/** Goals per user: uneven, with empty users, 30 users over two upstream pages. */
const GOALS_PER_USER = Array.from({ length: 30 }, (_, i) => [0, 1, 2, 3][i % 4]!)
GOALS_PER_USER[27] = 1
const GOAL_TOTAL = GOALS_PER_USER.reduce((a, b) => a + b, 0)

/** Every goal, grouped by owner; goal ids are `g<user>-<n>`, statuses alternate 1/2. */
function goalOwners(statuses: string[]) {
  return GOALS_PER_USER.map((n, u) => ({
    user_id: String(u + 1),
    user_email: `u${u + 1}@example.com`,
    people_goals: Array.from({ length: n }, (_, k) => ({
      goal_id: `g${u + 1}-${k + 1}`,
      goal_name: `goal ${u + 1}-${k + 1}`,
      goal_owner: String(u + 1),
      goal_status: k % 2 === 0 ? '1' : '2',
      goal_team_id: '77',
    })).filter((g) => statuses.includes(g.goal_status)),
  }))
}

function goalHandler(unit: 'users' | 'goals'): Handler {
  return (path, params) => {
    if (path !== '/wb/apis/goal') throw new Error(`unexpected path ${path}`)
    // Documented default: without goal_status the fake serves active goals only.
    const statuses =
      params['goal_status'] === undefined ? ['1'] : String(params['goal_status']).split(',')
    const owners = goalOwners(statuses)
    const { limit, offset } = window(params)
    if (unit === 'users') {
      const page = owners.slice(offset, offset + limit)
      return envelope({ totalCount: owners.length, goal: page })
    }
    const flat = owners.flatMap((o) => o.people_goals.map((g) => ({ o, g })))
    const slice = flat.slice(offset, offset + limit)
    const grouped: Array<{ user_id: string; people_goals: unknown[] }> = []
    for (const { o, g } of slice) {
      const last = grouped[grouped.length - 1]
      if (last && last.user_id === o.user_id) last.people_goals.push(g)
      else grouped.push({ user_id: o.user_id, people_goals: [g] })
    }
    return envelope({ totalCount: flat.length, goal: grouped })
  }
}

describe('workboard listProjects (GET /wb/apis/goal)', () => {
  it('fixture: 2L+1 goals over uneven users', () => {
    expect(GOAL_TOTAL).toBe(41)
  })

  for (const unit of ['users', 'goals'] as const) {
    it(`walks every goal once with exact hasMore when limit counts ${unit}`, async () => {
      const requests = fake(goalHandler(unit))
      const L = 20
      const { ids, hasMore, rows } = await walk((p) => adapter.listProjects(CREDS, p), L, 3)
      const all = goalOwners(['1', '2']).flatMap((o) => o.people_goals.map((g) => g.goal_id))
      expect(ids).toEqual(all)
      expect(new Set(ids).size).toBe(GOAL_TOTAL)
      expect(hasMore).toEqual([true, true, false])
      for (const r of rows) ProjectSchema.parse(r)
      for (const r of requests) {
        expect(r.path).toBe('/wb/apis/goal')
        expect(Object.keys(r.params).sort()).toEqual(['goal_status', 'limit', 'offset'])
        expect(r.params['limit']).toBe(15)
        expect(r.params['goal_status']).toBe('1,2')
      }
    })
  }

  it('asks for closed goals too, with goal_status "1,2"', async () => {
    fake(goalHandler('users'))
    const rows = await adapter.listProjects(CREDS, withPageSink({ page: 1, limit: 100 }))
    expect(rows.map((r) => r.status)).toContain('completed')
    expect(rows).toHaveLength(GOAL_TOTAL)
  })

  it('reads the documented envelope: data.goal is an object holding the users', async () => {
    fake((_path, params) =>
      envelope({
        totalCount: 1,
        goal:
          window(params).offset === 0
            ? [
                {
                  user_id: '1',
                  people_goals: [
                    { goal_id: '5', goal_name: 'G', goal_status: '1', goal_team_id: '7' },
                  ],
                },
              ]
            : [],
      }),
    )
    const rows = await adapter.listProjects(CREDS, withPageSink({ page: 1, limit: 10 }))
    expect(rows.map((r) => [r.id, r.name, r.workspaceId])).toEqual([['5', 'G', '7']])
  })
})

describe('workboard getProject (GET /wb/apis/goal/{goal_id})', () => {
  it('reads the single goal object from data.goal', async () => {
    const requests = fake(() =>
      envelope({
        totalCount: 1,
        goal: { goal_id: '5', goal_name: 'G', goal_status: '2', goal_team_id: '7' },
      }),
    )
    const p = ProjectSchema.parse(await adapter.getProject(CREDS, '5'))
    expect(p).toMatchObject({ id: '5', name: 'G', status: 'completed', workspaceId: '7' })
    expect(requests).toEqual([{ path: '/wb/apis/goal/5', params: {} }])
  })

  it('encodes the id into the path', async () => {
    const requests = fake(() => envelope({ totalCount: 0 }))
    await expect(adapter.getProject(CREDS, 'a/b?c')).rejects.toMatchObject({ statusCode: 404 })
    expect(requests[0]?.path).toBe('/wb/apis/goal/a%2Fb%3Fc')
  })

  it('is a 404 when data.goal is absent', async () => {
    fake(() => envelope({ totalCount: 0 }))
    await expect(adapter.getProject(CREDS, '5')).rejects.toMatchObject({ statusCode: 404 })
  })
})

// ── Workspaces (teams) ───────────────────────────────────────────────────────

describe('workboard listWorkspaces (GET /wb/apis/team)', () => {
  const L = 3
  const N = 2 * L + 1
  const teams = Array.from({ length: N }, (_, i) => ({
    team_id: String(100 + i),
    team_name: `team ${i}`,
    team_state: '1',
  }))

  it('pages by offset/limit and ends on data.totalCount', async () => {
    const requests = fake((path, params) => {
      if (path !== '/wb/apis/team') throw new Error(`unexpected path ${path}`)
      if (params['team_id'] !== undefined) throw new Error('team_id not expected')
      const { limit, offset } = window(params)
      return envelope({ totalCount: teams.length, team: teams.slice(offset, offset + limit) })
    })
    const { ids, hasMore, rows } = await walk((p) => adapter.listWorkspaces(CREDS, p), L, 3)
    expect(ids).toEqual(teams.map((t) => t.team_id))
    expect(hasMore).toEqual([true, true, false])
    for (const r of rows) WorkspaceSchema.parse(r)
    expect(requests.map((r) => r.params)).toEqual([
      { limit: 3, offset: 0 },
      { limit: 3, offset: 3 },
      { limit: 3, offset: 6 },
    ])
  })

  it('reports hasMore false on a page that ends exactly at totalCount', async () => {
    fake((_path, params) => {
      const { limit, offset } = window(params)
      return envelope({ totalCount: 6, team: teams.slice(0, 6).slice(offset, offset + limit) })
    })
    const { hasMore } = await walk((p) => adapter.listWorkspaces(CREDS, p), L, 2)
    expect(hasMore).toEqual([true, false])
  })

  it('refuses a short page that stops before totalCount (a silent server cap)', async () => {
    // A server capping limit at 2 while 7 teams exist: serving this page would
    // make page 2 (offset 3) skip team 102.
    fake((_path, params) => {
      const { offset } = window(params)
      return envelope({ totalCount: teams.length, team: teams.slice(offset, offset + 2) })
    })
    await expect(
      adapter.listWorkspaces(CREDS, withPageSink({ page: 1, limit: L })),
    ).rejects.toMatchObject({ statusCode: 502 })
  })
})

// ── Tasks (metrics) ──────────────────────────────────────────────────────────

describe('workboard listTasks (GET /wb/apis/metric?goal_id=)', () => {
  const L = 2
  const N = 2 * L + 1
  const metrics = Array.from({ length: N }, (_, i) => ({
    metric_id: String(9000 + i),
    metric_goal_id: '1203',
    metric_name: `metric ${i}`,
    metric_status: '1',
  }))

  it('reads the goal whole (limit/offset are documented only with team_id) and pages locally', async () => {
    const requests = fake((path, params) => {
      if (path !== '/wb/apis/metric') throw new Error(`unexpected path ${path}`)
      if (params['goal_id'] !== '1203') return envelope({ totalCount: 0, metric: [] })
      return envelope({ totalCount: metrics.length, metric: metrics })
    })
    const { ids, hasMore, rows } = await walk((p) => adapter.listTasks(CREDS, '1203', p), L, 3)
    expect(ids).toEqual(metrics.map((m) => m.metric_id))
    expect(hasMore).toEqual([true, true, false])
    for (const r of rows) expect(TaskSchema.parse(r).projectId).toBe('1203')
    for (const r of requests)
      expect(r).toEqual({ path: '/wb/apis/metric', params: { goal_id: '1203' } })
  })
})

describe('workboard listTasks truncation guard', () => {
  it('refuses when data.totalCount exceeds the metrics that came back', async () => {
    const metrics = Array.from({ length: 15 }, (_, i) => ({
      metric_id: String(i + 1),
      metric_goal_id: '1203',
      metric_name: `m${i}`,
      metric_status: '1',
    }))
    fake(() => envelope({ totalCount: 16, metric: metrics }))
    await expect(
      adapter.listTasks(CREDS, '1203', withPageSink({ page: 1, limit: 100 })),
    ).rejects.toMatchObject({ statusCode: 502 })
  })
})

describe('workboard getTask (GET /wb/apis/metric/{metric_id})', () => {
  it('reads the single metric object from data.metric', async () => {
    const requests = fake(() =>
      envelope({
        totalCount: 1,
        metric: { metric_id: '9001', metric_goal_id: '1203', metric_name: 'M', metric_status: '2' },
      }),
    )
    const t = TaskSchema.parse(await adapter.getTask(CREDS, '9001'))
    expect(t).toMatchObject({ id: '9001', projectId: '1203', title: 'M', status: 'closed' })
    expect(requests).toEqual([{ path: '/wb/apis/metric/9001', params: {} }])
  })
})

// ── Users (team members) ─────────────────────────────────────────────────────

describe('workboard listUsers (GET /wb/apis/team?team_id=)', () => {
  const L = 2
  const N = 2 * L + 1
  const members = Array.from({ length: N }, (_, i) => ({
    id: String(500 + i),
    first_name: `First${i}`,
    last_name: `Last${i}`,
    email: `m${i}@example.com`,
    team_role: 'member',
  }))

  it("reads the single team's team_members and pages them locally", async () => {
    const requests = fake((path, params) => {
      if (path !== '/wb/apis/team') throw new Error(`unexpected path ${path}`)
      if (params['team_id'] === undefined)
        return envelope({ totalCount: 1, team: [{ team_id: '77' }] })
      return envelope({
        totalCount: 1,
        team: { team_id: String(params['team_id']), team_name: 'Eng', team_members: members },
      })
    })
    const { ids, hasMore, rows } = await walk((p) => adapter.listUsers(CREDS, '77', p), L, 3)
    expect(ids).toEqual(members.map((m) => m.id))
    expect(hasMore).toEqual([true, true, false])
    for (const r of rows) expect(UserSchema.parse(r).workspaceIds).toEqual(['77'])
    for (const r of requests)
      expect(r).toEqual({ path: '/wb/apis/team', params: { team_id: '77' } })
  })

  it('is a 404 when the team does not come back as a single object', async () => {
    fake(() => envelope({ totalCount: 0 }))
    await expect(
      adapter.listUsers(CREDS, '77', withPageSink({ page: 1, limit: 2 })),
    ).rejects.toMatchObject({ statusCode: 404 })
  })
})

describe('workboard getUser (GET /wb/apis/user/{user_id})', () => {
  it('reads the single user object from data.user', async () => {
    const requests = fake(() =>
      envelope({
        totalCount: 1,
        user: { user_id: '55', first_name: 'Ada', last_name: 'Lovelace', email: 'ada@example.com' },
      }),
    )
    const u = UserSchema.parse(await adapter.getUser(CREDS, '55'))
    expect(u).toMatchObject({ id: '55', name: 'Ada Lovelace', email: 'ada@example.com' })
    expect(requests).toEqual([{ path: '/wb/apis/user/55', params: {} }])
  })
})
