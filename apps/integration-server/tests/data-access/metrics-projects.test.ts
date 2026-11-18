/**
 * Projects metrics against hand-computed values. SQLite always, Postgres when
 * TEST_DATABASE_URL is set. Only `projects` and `workspaces` are synced.
 *
 * "Now" is Wednesday 2026-03-18 12:00 UTC; the range is 2026-03-01 to 2026-03-15.
 * Every state metric is a snapshot and must ignore the range.
 *
 *  id  ws  status     owner  created     updated   end
 *  pr1 ws1 active     u1     2026-03-02  03-15     03-10   overdue
 *  pr2 ws1 active     u1     2026-03-02  01-20     04-01   stale, ends in exactly 14 days
 *  pr3 ws2 active     u2     2025-10-01  03-16     03-18   ends today
 *  pr4 ws2 on_hold    -      2025-01-10  01-01     02-01   overdue, no owner
 *  pr5 ws1 completed  u1     2026-03-05  03-05     02-01   finished: not overdue
 *  pr6 ws2 archived   u3     2026-02-10
 *  pr7 ws1 active     u1     2026-03-10  03-17     -
 *  pr8 ws1 active     -      2026-03-14  03-14     -       no owner
 *
 * Tenant-b's workspace has tenant-a's id and another name.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { RESOURCE_METRICS } from '../../src/data-access/metrics/catalog'
import {
  BACKENDS,
  SCOPE_B,
  kpi,
  nonZero,
  openHarness,
  points,
  rowsByLabel,
  type Harness,
  type Row,
} from './metrics-harness'

const RANGE = { from: '2026-03-01', to: '2026-03-15' }
const FAR_PAST = { from: '2024-01-01', to: '2024-01-31' }

const project = (
  id: string,
  workspaceId: string,
  status: string,
  extra: Record<string, unknown> = {},
): Row => ({ id, workspaceId, status, name: id, ...extra })

const PROJECTS: Row[] = [
  project('pr1', 'ws1', 'active', {
    ownerId: 'u1',
    createdAt: '2026-03-02T09:00:00Z',
    updatedAt: '2026-03-15T09:00:00Z',
    endDate: '2026-03-10T17:00:00Z',
  }),
  project('pr2', 'ws1', 'active', {
    ownerId: 'u1',
    createdAt: '2026-03-02T15:00:00Z',
    updatedAt: '2026-01-20T09:00:00Z',
    endDate: '2026-04-01T17:00:00Z',
  }),
  project('pr3', 'ws2', 'active', {
    ownerId: 'u2',
    createdAt: '2025-10-01T09:00:00Z',
    updatedAt: '2026-03-16T09:00:00Z',
    endDate: '2026-03-18T17:00:00Z',
  }),
  project('pr4', 'ws2', 'on_hold', {
    createdAt: '2025-01-10T09:00:00Z',
    updatedAt: '2026-01-01T09:00:00Z',
    endDate: '2026-02-01T17:00:00Z',
  }),
  project('pr5', 'ws1', 'completed', {
    ownerId: 'u1',
    createdAt: '2026-03-05T09:00:00Z',
    updatedAt: '2026-03-05T09:00:00Z',
    endDate: '2026-02-01T17:00:00Z',
  }),
  project('pr6', 'ws2', 'archived', { ownerId: 'u3', createdAt: '2026-02-10T09:00:00Z' }),
  project('pr7', 'ws1', 'active', {
    ownerId: 'u1',
    createdAt: '2026-03-10T09:00:00Z',
    updatedAt: '2026-03-17T09:00:00Z',
  }),
  project('pr8', 'ws1', 'active', {
    createdAt: '2026-03-14T09:00:00Z',
    updatedAt: '2026-03-14T09:00:00Z',
  }),
]

describe.each(BACKENDS)('projects metrics ($name)', (backend) => {
  let h: Harness

  beforeEach(async () => {
    h = await openHarness(backend)
    const a = await h.connect('asana', 'projects', 'tenant-a', 'Asana A')
    const b = await h.connect('asana', 'projects', 'tenant-b', 'Asana B')
    await h.put('projects', 'asana', a, 'workspaces', [
      { id: 'ws1', name: 'Engineering' },
      { id: 'ws2', name: 'Marketing' },
    ])
    await h.put('projects', 'asana', a, 'projects', PROJECTS)
    await h.put('projects', 'asana', b, 'workspaces', [
      { id: 'ws1', name: 'LEAKED-WS' },
    ])
    await h.put('projects', 'asana', b, 'projects', [
      project('pb1', 'ws1', 'active', { ownerId: 'ub', createdAt: '2026-03-04T09:00:00Z', endDate: '2026-01-01T00:00:00Z' }),
    ])
  })

  afterEach(async () => {
    await h.handle.close()
  })

  it('registers every projects id under its own vertical', () => {
    const own = RESOURCE_METRICS.filter((m) => m.vertical === 'projects')
    expect(own.length).toBeGreaterThanOrEqual(11)
    for (const m of own) expect(m.id.startsWith('projects.')).toBe(true)
  })

  describe('overview and workload', () => {
    it('counts projects by status now, whatever the range', async () => {
      const expected = { active: 5, on_hold: 1, completed: 1, archived: 1, unknown: 0 }
      expect(points(await h.run('projects.projects_by_status', RANGE))).toEqual(expected)
      const past = await h.run('projects.projects_by_status', FAR_PAST)
      expect(points(past)).toEqual(expected)
      expect(past.range).toEqual({ from: '2026-03-18', to: '2026-03-18' })
      expect((await h.run('projects.active_projects', FAR_PAST)).value).toBe(5)
    })

    it('counts projects created per day in the range', async () => {
      const r = await h.run('projects.projects_created_per_day', RANGE)
      expect(r.value).toBe(5)
      expect(nonZero(r)).toEqual({ '2026-03-02': 2, '2026-03-05': 1, '2026-03-10': 1, '2026-03-14': 1 })
    })

    it('groups open projects by workspace name from the in-scope connection', async () => {
      const r = await h.run('projects.projects_by_workspace', RANGE)
      // open = active + on_hold: ws1 pr1 pr2 pr7 pr8, ws2 pr3 pr4
      expect(points(r)).toEqual({ Engineering: 4, Marketing: 2 })
      expect(JSON.stringify(r)).not.toContain('LEAKED')
      expect(points(await h.run('projects.projects_by_workspace', RANGE, SCOPE_B))).toEqual({
        'LEAKED-WS': 1,
      })
    })

    it('groups open projects by owner id, missing owners apart', async () => {
      const r = await h.run('projects.projects_by_owner', RANGE)
      expect(points(r)).toEqual({ u1: 3, u2: 1, '(none)': 2 })
    })
  })

  describe('risk', () => {
    it('finds overdue projects: open with an end date before today', async () => {
      // pr1 (03-10) and pr4 (02-01). pr3 ends today, pr5 is completed.
      expect((await h.run('projects.projects_overdue', RANGE)).value).toBe(2)
      expect((await h.run('projects.projects_overdue', FAR_PAST)).value).toBe(2)
    })

    it('finds active projects ending within 14 days, today included', async () => {
      // pr2 ends 04-01, exactly 14 days out; pr3 ends today. pr7 and pr8 have no end date.
      expect((await h.run('projects.projects_ending_soon', RANGE)).value).toBe(2)
    })

    it('counts on-hold, ownerless and stale projects', async () => {
      expect((await h.run('projects.projects_on_hold', RANGE)).value).toBe(1)
      expect((await h.run('projects.projects_missing_owner', RANGE)).value).toBe(2) // pr4, pr8
      // active and unchanged since before 02-16: pr2 only (pr4 is on hold)
      expect((await h.run('projects.stale_projects', RANGE)).value).toBe(1)
    })

    it('buckets open projects by age with an injected now', async () => {
      const r = await h.run('projects.project_age_buckets', RANGE)
      // days since creation: pr1 16, pr2 16, pr7 8, pr8 4, pr3 168, pr4 432
      expect(r.series[0]!.points).toEqual([
        { x: '0–30 days', y: 4 },
        { x: '31–90 days', y: 0 },
        { x: '91–180 days', y: 1 },
        { x: '181–365 days', y: 0 },
        { x: '366+ days', y: 1 },
      ])
    })

    it('measures owner concentration, leaving projects with no owner out of the shares', async () => {
      const r = await h.run('projects.owner_concentration', RANGE)
      // u1 3, u2 1 of 4: 75 %, HHI (9 + 1) / 16
      expect(r.value).toBe(75)
      expect(kpi(r, 'hhi')).toBe(6250)
      expect(kpi(r, 'effective_n')).toBe(1.6)
      expect(kpi(r, 'unattributed')).toBe(2)
      expect(rowsByLabel(r)['u1']).toMatchObject({ rank: 1, value: 3, share: 75 })
    })
  })
})
