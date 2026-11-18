/**
 * The dashboard's "Needs attention" panel, rule by rule.
 *
 * `deriveDashboardTasks` is pure: it is handed what the dashboard already
 * loads (connections) plus two best-effort sync-job reads and the deployment's
 * clears, and answers with the rows to show. Every rule below is a sentence
 * an operator would otherwise learn the hard way — a zombie row for a
 * connection that was re-authorised weeks ago, a Retry button on a sync that
 * is guaranteed to fail, a clear that silently outlives the condition it was
 * made for, or an outage reading as "nothing to do".
 */
import { describe, expect, it } from 'vitest'
import {
  KIND_MIN_ROLE,
  TASK_ROW_CAP,
  UNDO_WINDOW_MS,
  dashboardTaskFingerprint,
  deriveDashboardTasks,
  type DashboardDismissalRecord,
  type DashboardTask,
} from '../../src/core/routes/dashboard-tasks'
import type {
  SyncJobRecord,
  TaggedConnection,
  VerticalStatus,
} from '../../src/core/proxy/admin-api-client'

const NOW = Date.parse('2026-09-05T12:00:00.000Z')
const HOUR = 60 * 60 * 1000

function connection(over: Partial<TaggedConnection> & { id: string }): TaggedConnection {
  return {
    platform: 'fortnox',
    vertical: 'accounting',
    tenantId: 'default',
    label: null,
    status: 'valid',
    expiresAt: null,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    lastRefreshAt: null,
    lastRefreshStatus: null,
    ...over,
  }
}

function job(over: Partial<SyncJobRecord> & { id: string; connectionId: string }): SyncJobRecord {
  return {
    vertical: 'accounting',
    platform: 'fortnox',
    tenantId: 'default',
    status: 'failed',
    progress: null,
    error: 'HTTP 500 from upstream',
    callbackUrl: null,
    createdAt: '2026-09-05T10:00:00.000Z',
    startedAt: '2026-09-05T10:00:01.000Z',
    completedAt: '2026-09-05T10:00:05.000Z',
    ...over,
  }
}

function dismissal(
  over: Partial<DashboardDismissalRecord> & { key: string },
): DashboardDismissalRecord {
  // `createdAt` is an ISO string on the wire: admin-api's preSerialization
  // hook rewrites every `createdAt` to ISO 8601, whatever the store held.
  return { fingerprint: '', by: 'u1', createdAt: new Date(NOW - HOUR).toISOString(), ...over }
}

type Input = Parameters<typeof deriveDashboardTasks>[0]
function derive(over: Partial<Input> = {}) {
  return deriveDashboardTasks({
    connections: [],
    failedJobs: [],
    recentJobs: [],
    dismissals: [],
    role: 'admin',
    now: NOW,
    ...over,
  })
}

const keys = (tasks: DashboardTask[]) => tasks.map((t) => t.key)

const ACCOUNTING_DOWN: VerticalStatus = {
  name: 'accounting',
  status: 'down',
  adapterCount: 0,
  error: 'connect ECONNREFUSED',
}
const CRM_UP: VerticalStatus = { name: 'crm', status: 'up', adapterCount: 2 }

describe('vertical_down', () => {
  it('is one row per vertical that is not up, keyed by the vertical and titled by its label', () => {
    const { tasks } = derive({ verticals: [CRM_UP, ACCOUNTING_DOWN] })
    expect(keys(tasks)).toEqual(['vertical:down:accounting'])
    expect(tasks[0]).toMatchObject({
      kind: 'vertical_down',
      status: 'down',
      vertical: 'accounting',
      title: 'Accounting',
      connectionId: null,
      tenantId: null,
      job: null,
      canRetry: false,
    })
    expect(tasks[0]!.sentence).toContain('Accounting')
  })

  it('titles a vertical this admin has no label for by its name', () => {
    const { tasks } = derive({ verticals: [{ ...ACCOUNTING_DOWN, name: 'hr' }] })
    expect(tasks[0]!.title).toBe('hr')
  })

  it('cannot be cleared by any role, and a clear stored for its key changes nothing', () => {
    // Non-dismissable: a vertical that is down is not a to-do an operator can
    // decide to stop seeing, and admin-api refuses the key anyway.
    for (const role of ['viewer', 'operator', 'admin'] as const) {
      const out = derive({
        verticals: [ACCOUNTING_DOWN],
        role,
        dismissals: [dismissal({ key: 'vertical:down:accounting', fingerprint: '' })],
      })
      expect(keys(out.tasks), role).toEqual(['vertical:down:accounting'])
      expect(out.tasks[0]!.canClear, role).toBe(false)
      expect(out.recentlyCleared, role).toEqual([])
    }
  })

  it('lets only an admin act: the fix is under /settings/system, which is admin-only', () => {
    expect(derive({ verticals: [ACCOUNTING_DOWN], role: 'viewer' }).tasks[0]!.canAct).toBe(false)
    expect(derive({ verticals: [ACCOUNTING_DOWN], role: 'operator' }).tasks[0]!.canAct).toBe(false)
    expect(derive({ verticals: [ACCOUNTING_DOWN], role: 'admin' }).tasks[0]!.canAct).toBe(true)
  })

  it('comes first and is never hidden behind the cap', () => {
    // "and 1 more — see the full list" pointing at expired connections would
    // hide the one row that explains why nothing else on the page can be
    // trusted.
    const connections = Array.from({ length: TASK_ROW_CAP + 1 }, (_, i) =>
      connection({ id: `e-${i}`, status: 'expired' }),
    )
    const out = derive({ connections, verticals: [ACCOUNTING_DOWN] })
    expect(out.tasks[0]!.key).toBe('vertical:down:accounting')
    expect(out.tasks).toHaveLength(TASK_ROW_CAP + 1)
    expect(out.hidden).toBe(1)
  })

  it('is absent when every vertical is up, and when the caller passed none', () => {
    expect(derive({ verticals: [CRM_UP] }).tasks).toEqual([])
    expect(derive().tasks).toEqual([])
  })

  it('names the health error in its sentence: the one diagnostic the page has', () => {
    // For every role — the vertical cards below already print it for all.
    for (const role of ['admin', 'operator', 'viewer'] as const) {
      expect(derive({ verticals: [ACCOUNTING_DOWN], role }).tasks[0]!.sentence, role).toContain(
        '(connect ECONNREFUSED)',
      )
    }
    expect(
      derive({ verticals: [{ ...ACCOUNTING_DOWN, error: undefined }] }).tasks[0]!.sentence,
    ).not.toContain('()')
  })

  describe('when every vertical is down', () => {
    // admin-api's aggregator makes one /health call and marks every vertical
    // down together, so this — not one vertical on its own — is the shape a
    // real outage takes. Nine identical rows would bury the page.
    const ALL_DOWN = [
      ACCOUNTING_DOWN,
      { ...ACCOUNTING_DOWN, name: 'crm' },
      { ...ACCOUNTING_DOWN, name: 'payments' },
    ]

    it('collapses to one row for the integration server, still not clearable', () => {
      const out = derive({ verticals: ALL_DOWN })
      expect(keys(out.tasks)).toEqual(['vertical:down:all'])
      expect(out.tasks[0]).toMatchObject({
        kind: 'vertical_down',
        status: 'down',
        title: 'Integration server',
        canClear: false,
        canRetry: false,
      })
      expect(out.tasks[0]!.sentence).not.toContain('Accounting')
      expect(out.allVerticalsDown).toBe(true)
      expect(out.unavailableVerticals).toEqual(['accounting', 'crm', 'payments'])
    })

    it('still names the shared error', () => {
      expect(derive({ verticals: ALL_DOWN }).tasks[0]!.sentence).toContain('(connect ECONNREFUSED)')
    })

    it('keeps per-vertical rows for a partial outage, and for a deployment with one vertical', () => {
      const partial = derive({
        verticals: [ACCOUNTING_DOWN, { ...ACCOUNTING_DOWN, name: 'crm' }, CRM_UP],
      })
      expect(keys(partial.tasks)).toEqual(['vertical:down:accounting', 'vertical:down:crm'])
      expect(partial.allVerticalsDown).toBe(false)
      const single = derive({ verticals: [ACCOUNTING_DOWN] })
      expect(keys(single.tasks)).toEqual(['vertical:down:accounting'])
      expect(single.allVerticalsDown).toBe(false)
      expect(derive().allVerticalsDown).toBe(false)
    })

    it('cannot be cleared by a stored clear on the collapsed key either', () => {
      const out = derive({
        verticals: ALL_DOWN,
        dismissals: [dismissal({ key: 'vertical:down:all', fingerprint: '' })],
      })
      expect(keys(out.tasks)).toEqual(['vertical:down:all'])
      expect(out.recentlyCleared).toEqual([])
    })
  })
})

describe('refresh_failing', () => {
  const FAILING = connection({
    id: 'c-warn',
    label: 'Warn Co',
    status: 'valid',
    expiresAt: '2026-09-06T00:00:00.000Z',
    lastRefreshAt: '2026-09-05T11:00:00Z',
    lastRefreshStatus: 'failed',
  })

  it('is a row for a connection that still works but whose last token refresh failed', () => {
    const { tasks } = derive({ connections: [FAILING] })
    expect(keys(tasks)).toEqual(['refresh:failing:c-warn'])
    expect(tasks[0]).toMatchObject({
      kind: 'refresh_failing',
      status: 'refresh_failed',
      title: 'Warn Co',
      connectionId: 'c-warn',
      tenantId: 'default',
      vertical: 'accounting',
      platform: 'fortnox',
      job: null,
      canRetry: false,
    })
  })

  it('names the expiry in its sentence: that is the deadline the warning is about', () => {
    expect(derive({ connections: [FAILING] }).tasks[0]!.sentence).toContain('2026-09-06')
    expect(derive({ connections: [{ ...FAILING, expiresAt: null }] }).tasks[0]!.sentence).toMatch(
      /refresh failed/i,
    )
  })

  it('fingerprints on the expiry (ISO 8601), so a clear holds through failed retries', () => {
    // The keep-alive worker retries every tick and rewrites `lastRefreshAt`
    // on each failure. A fingerprint on the attempt would make a clear last
    // one tick, and refuse to clear at all when a tick landed between the
    // page load and the click. The expiry moves only when a refresh
    // succeeds, i.e. when the condition itself resolves.
    const { tasks } = derive({ connections: [FAILING] })
    expect(tasks[0]!.fingerprint).toBe('2026-09-06T00:00:00.000Z')
    const cleared = dismissal({
      key: 'refresh:failing:c-warn',
      fingerprint: '2026-09-06T00:00:00.000Z',
    })
    expect(derive({ connections: [FAILING], dismissals: [cleared] }).tasks).toEqual([])
    const retried = { ...FAILING, lastRefreshAt: '2026-09-05T11:30:00.000Z' }
    expect(derive({ connections: [retried], dismissals: [cleared] }).tasks).toEqual([])
  })

  it('re-surfaces a clear once a refresh succeeded and a later one failed again', () => {
    const cleared = dismissal({
      key: 'refresh:failing:c-warn',
      fingerprint: '2026-09-06T00:00:00.000Z',
    })
    const recurred = { ...FAILING, expiresAt: '2026-09-08T00:00:00.000Z' }
    expect(derive({ connections: [recurred], dismissals: [cleared] }).tasks).toHaveLength(1)
  })

  it('falls back to createdAt for a connection with no expiry', () => {
    const { tasks } = derive({ connections: [{ ...FAILING, expiresAt: null }] })
    expect(tasks[0]!.fingerprint).toBe(dashboardTaskFingerprint(FAILING.createdAt))
  })

  it('covers an expiring_soon connection too: the refresh that would save it is the one failing', () => {
    const { tasks } = derive({ connections: [{ ...FAILING, status: 'expiring_soon' }] })
    expect(keys(tasks)).toEqual(['refresh:failing:c-warn'])
  })

  it('is not raised for an expired or platform_error connection, which has its own row', () => {
    expect(keys(derive({ connections: [{ ...FAILING, status: 'expired' }] }).tasks)).toEqual([
      'conn:expired:c-warn',
    ])
    expect(keys(derive({ connections: [{ ...FAILING, status: 'platform_error' }] }).tasks)).toEqual(
      ['platform:creds:accounting/fortnox'],
    )
  })

  it('is not raised when the last refresh succeeded, expired the token, or never ran', () => {
    for (const lastRefreshStatus of ['ok', 'expired', null] as const) {
      expect(derive({ connections: [{ ...FAILING, lastRefreshStatus }] }).tasks).toEqual([])
    }
  })

  it('does not fold a failed sync: the token still works, so Retry may succeed', () => {
    const failed = job({ id: 'j', connectionId: 'c-warn' })
    const { tasks } = derive({ connections: [FAILING], failedJobs: [failed], recentJobs: [failed] })
    expect(keys(tasks)).toEqual(['sync:failed:j', 'refresh:failing:c-warn'])
    expect(tasks[0]!.canRetry).toBe(true)
  })

  it('is operator-level to act on and to clear', () => {
    expect(derive({ connections: [FAILING], role: 'viewer' }).tasks[0]).toMatchObject({
      canAct: false,
      canClear: false,
    })
    expect(derive({ connections: [FAILING], role: 'operator' }).tasks[0]).toMatchObject({
      canAct: true,
      canClear: true,
    })
  })
})

describe('conn_expired', () => {
  const EXPIRED = connection({
    id: 'c-old',
    status: 'expired',
    label: 'Acme Books',
    expiresAt: '2026-09-01T00:00:00.000Z',
  })

  it('is one row per expired connection, keyed by its id', () => {
    const { tasks } = derive({ connections: [EXPIRED] })
    expect(keys(tasks)).toEqual(['conn:expired:c-old'])
    expect(tasks[0]).toMatchObject({
      kind: 'conn_expired',
      status: 'expired',
      title: 'Acme Books',
      connectionId: 'c-old',
      vertical: 'accounting',
      platform: 'fortnox',
      tenantId: 'default',
    })
  })

  it('carries the platform display name when the caller can resolve one, else the slug', () => {
    // The vertical cards under the panel show "Fortnox"; the row must not
    // say "fortnox" for the same platform, nor read "Clear: xero xero".
    const named = derive({
      connections: [EXPIRED],
      platformName: (vertical, platform) => (vertical === 'accounting' ? 'Fortnox' : platform),
    })
    expect(named.tasks[0]!.platformName).toBe('Fortnox')
    expect(derive({ connections: [EXPIRED] }).tasks[0]!.platformName).toBe('fortnox')
  })

  it('titles an unlabelled connection by its id, never a dash', () => {
    const { tasks } = derive({ connections: [{ ...EXPIRED, label: null }] })
    expect(tasks[0]!.title).toBe('c-old')
  })

  it('fingerprints on the expiry, normalised to ISO 8601, as admin-api documents', () => {
    // The health poller derives the same fingerprint; the two must agree or a
    // clear on one surface is invisible to the other.
    const { tasks } = derive({ connections: [{ ...EXPIRED, expiresAt: '2026-09-01T00:00:00Z' }] })
    expect(tasks[0]!.fingerprint).toBe('2026-09-01T00:00:00.000Z')
  })

  it('falls back to createdAt (immutable), not updatedAt (a rename rewrites it)', () => {
    const { tasks } = derive({
      connections: [
        {
          ...EXPIRED,
          expiresAt: null,
          createdAt: '2026-07-01T00:00:00.000Z',
          updatedAt: '2026-09-04T00:00:00.000Z',
        },
      ],
    })
    expect(tasks[0]!.fingerprint).toBe('2026-07-01T00:00:00.000Z')
  })

  it('is suppressed when a newer valid sibling exists for the same vertical/platform/tenant', () => {
    // Re-auth creates a NEW connection row; the old one never self-heals, so
    // without this every reconnect leaves a zombie task behind.
    const sibling = connection({ id: 'c-new', createdAt: '2026-09-04T00:00:00.000Z' })
    expect(derive({ connections: [EXPIRED, sibling] }).tasks).toEqual([])
  })

  it('is not suppressed by a sibling in another tenant, or on another platform', () => {
    const otherTenant = connection({
      id: 'c-t2',
      tenantId: 'acme',
      createdAt: '2026-09-04T00:00:00.000Z',
    })
    const otherPlatform = connection({
      id: 'c-x',
      platform: 'xero',
      createdAt: '2026-09-04T00:00:00.000Z',
    })
    expect(keys(derive({ connections: [EXPIRED, otherTenant, otherPlatform] }).tasks)).toEqual([
      'conn:expired:c-old',
    ])
  })

  it('is not suppressed by an older valid sibling', () => {
    // The expired one is the replacement here, so it is the one to act on.
    const older = connection({ id: 'c-older', createdAt: '2026-01-01T00:00:00.000Z' })
    expect(
      keys(
        derive({ connections: [{ ...EXPIRED, createdAt: '2026-08-01T00:00:00.000Z' }, older] })
          .tasks,
      ),
    ).toEqual(['conn:expired:c-old'])
  })

  it('is not suppressed by a newer sibling that is itself broken', () => {
    const broken = connection({
      id: 'c-bad',
      status: 'expired',
      createdAt: '2026-09-04T00:00:00.000Z',
    })
    expect(keys(derive({ connections: [EXPIRED, broken] }).tasks)).toEqual([
      'conn:expired:c-old',
      'conn:expired:c-bad',
    ])
  })

  it('is suppressed by a newer expiring_soon sibling, which is healthy and mid-refresh', () => {
    // The plan says "valid"; the module deliberately counts expiring_soon as
    // healthy too. Tightening it back to `status === 'valid'` would make an
    // expired row reappear for the minutes its replacement is being refreshed.
    const soon = connection({
      id: 'c-soon',
      status: 'expiring_soon',
      createdAt: '2026-09-04T00:00:00.000Z',
    })
    expect(derive({ connections: [EXPIRED, soon] }).tasks).toEqual([])
  })

  it('ignores expiring_soon: the keep-alive worker refreshes it within minutes', () => {
    const soon = connection({ id: 'c-soon', status: 'expiring_soon' })
    expect(derive({ connections: [soon] }).tasks).toEqual([])
  })
})

describe('platform_creds', () => {
  const A = connection({
    id: 'c-a',
    status: 'platform_error',
    expiresAt: '2026-09-02T00:00:00.000Z',
  })
  const B = connection({
    id: 'c-b',
    status: 'platform_error',
    expiresAt: '2026-09-03T00:00:00.000Z',
  })

  it('is one row per vertical/platform, however many connections it broke', () => {
    const { tasks } = derive({ connections: [A, B] })
    expect(keys(tasks)).toEqual(['platform:creds:accounting/fortnox'])
    expect(tasks[0]).toMatchObject({
      kind: 'platform_creds',
      status: 'platform_error',
      affected: 2,
    })
  })

  it('fingerprints on the newest expiry across the affected connections', () => {
    // Not lastRefreshAt: every retry of the same rejected secret rewrites
    // that, which would undo a clear within minutes.
    const { tasks } = derive({
      connections: [
        { ...A, lastRefreshAt: '2026-09-05T11:59:00.000Z' },
        { ...B, lastRefreshAt: '2026-09-05T11:58:00.000Z' },
      ],
    })
    expect(tasks[0]!.fingerprint).toBe('2026-09-03T00:00:00.000Z')
  })

  it('starts its sentence from the display name, and titles the row by it', () => {
    const { tasks } = derive({ connections: [A], platformName: () => 'Fortnox' })
    expect(tasks[0]!.platformName).toBe('Fortnox')
    expect(tasks[0]!.title).toBe('Fortnox')
    expect(tasks[0]!.sentence).toMatch(/^Fortnox rejected the OAuth client credentials/)
  })

  it('does not carry a connection id or tenant: the fix is on the platform, not a connection', () => {
    const { tasks } = derive({ connections: [A] })
    expect(tasks[0]!.connectionId).toBeNull()
    expect(tasks[0]!.tenantId).toBeNull()
  })
})

describe('sync_failed', () => {
  const OK = connection({ id: 'c-1', label: 'Acme Books' })
  const FAILED = job({ id: 'job-9', connectionId: 'c-1' })

  it('is the newest failed job per connection, keyed by job id with an empty fingerprint', () => {
    const older = job({ id: 'job-1', connectionId: 'c-1', createdAt: '2026-09-04T10:00:00.000Z' })
    const { tasks } = derive({
      connections: [OK],
      failedJobs: [older, FAILED],
      recentJobs: [FAILED, older],
    })
    expect(keys(tasks)).toEqual(['sync:failed:job-9'])
    expect(tasks[0]).toMatchObject({
      kind: 'sync_failed',
      status: 'failed',
      fingerprint: '',
      title: 'Acme Books',
      connectionId: 'c-1',
      job: { id: 'job-9', error: 'HTTP 500 from upstream' },
    })
  })

  it('ignores a job the admin cancelled', () => {
    const cancelled = job({ id: 'job-c', connectionId: 'c-1', error: 'cancelled by admin' })
    expect(
      derive({ connections: [OK], failedJobs: [cancelled], recentJobs: [cancelled] }).tasks,
    ).toEqual([])
  })

  it('is superseded by any later job for the connection, whatever its status', () => {
    const later = job({
      id: 'job-10',
      connectionId: 'c-1',
      status: 'running',
      createdAt: '2026-09-05T11:00:00.000Z',
    })
    expect(
      derive({ connections: [OK], failedJobs: [FAILED], recentJobs: [later, FAILED] }).tasks,
    ).toEqual([])
  })

  it('is not superseded by a later job for a different connection', () => {
    const elsewhere = job({
      id: 'job-11',
      connectionId: 'c-2',
      status: 'completed',
      createdAt: '2026-09-05T11:00:00.000Z',
    })
    expect(
      keys(
        derive({ connections: [OK], failedJobs: [FAILED], recentJobs: [elsewhere, FAILED] }).tasks,
      ),
    ).toEqual(['sync:failed:job-9'])
  })

  it('folds into the expired connection row, with Retry withheld', () => {
    // Same root cause: a sync on an expired connection cannot succeed.
    const expired = connection({
      id: 'c-1',
      status: 'expired',
      expiresAt: '2026-09-01T00:00:00.000Z',
    })
    const { tasks } = derive({ connections: [expired], failedJobs: [FAILED], recentJobs: [FAILED] })
    expect(keys(tasks)).toEqual(['conn:expired:c-1'])
    expect(tasks[0]!.job).toMatchObject({ id: 'job-9' })
    expect(tasks[0]!.sentence).toContain('sync')
  })

  it('folds into the platform_creds row as a count', () => {
    const broken = connection({ id: 'c-1', status: 'platform_error' })
    const { tasks } = derive({ connections: [broken], failedJobs: [FAILED], recentJobs: [FAILED] })
    expect(keys(tasks)).toEqual(['platform:creds:accounting/fortnox'])
    expect(tasks[0]!.failedSyncs).toBe(1)
  })

  it('still lists a failed job whose connection is not in the list', () => {
    // The job carries its own platform and vertical; hiding it would hide a
    // failure the operator can still open.
    const { tasks } = derive({ failedJobs: [FAILED], recentJobs: [FAILED] })
    expect(keys(tasks)).toEqual(['sync:failed:job-9'])
    expect(tasks[0]!.title).toBe('c-1')
  })
})

describe('clears', () => {
  const EXPIRED = connection({
    id: 'c-old',
    status: 'expired',
    expiresAt: '2026-09-01T00:00:00.000Z',
  })

  it('hides a task whose key and fingerprint both match a clear', () => {
    const cleared = dismissal({
      key: 'conn:expired:c-old',
      fingerprint: '2026-09-01T00:00:00.000Z',
    })
    const out = derive({ connections: [EXPIRED], dismissals: [cleared] })
    expect(out.tasks).toEqual([])
    expect(out.unavailable).toEqual([])
  })

  it('re-surfaces a task whose fingerprint moved since it was cleared', () => {
    // The connection expired again, later: a new condition, not the old one.
    const stale = dismissal({ key: 'conn:expired:c-old', fingerprint: '2026-08-01T00:00:00.000Z' })
    expect(keys(derive({ connections: [EXPIRED], dismissals: [stale] }).tasks)).toEqual([
      'conn:expired:c-old',
    ])
  })

  it('offers Undo for a clear made within the undo window, and not for an old one', () => {
    const justNow = dismissal({
      key: 'conn:expired:c-old',
      fingerprint: '2026-09-01T00:00:00.000Z',
      createdAt: new Date(NOW - 60_000).toISOString(),
    })
    const recent = derive({ connections: [EXPIRED], dismissals: [justNow] })
    expect(recent.recentlyCleared.map((c) => c.key)).toEqual(['conn:expired:c-old'])
    expect(recent.recentlyCleared[0]).toMatchObject({
      kind: 'conn_expired',
      title: 'c-old',
      platform: 'fortnox',
      platformName: 'fortnox',
      clearedAt: NOW - 60_000,
      canUndo: true,
      undoRole: 'operator',
    })

    const longAgo = { ...justNow, createdAt: new Date(NOW - UNDO_WINDOW_MS - 1).toISOString() }
    expect(derive({ connections: [EXPIRED], dismissals: [longAgo] }).recentlyCleared).toEqual([])
  })

  it('names the role a viewer would need to undo, per kind', () => {
    const platform = connection({ id: 'p', status: 'platform_error', platform: 'xero' })
    const cleared = dismissal({
      key: 'platform:creds:accounting/xero',
      fingerprint: '2026-08-01T00:00:00.000Z',
      createdAt: new Date(NOW - 60_000).toISOString(),
    })
    const out = derive({
      connections: [platform],
      dismissals: [cleared],
      role: 'operator',
      platformName: () => 'Xero',
    })
    expect(out.recentlyCleared[0]).toMatchObject({
      kind: 'platform_creds',
      platformName: 'Xero',
      canUndo: false,
      undoRole: 'admin',
    })
  })

  it('does not offer Undo for a clear on a condition that is no longer live', () => {
    // Nothing would come back: un-clearing it is a no-op that looks like one.
    const orphan = dismissal({
      key: 'conn:expired:c-gone',
      fingerprint: '',
      createdAt: new Date(NOW - 60_000).toISOString(),
    })
    expect(derive({ dismissals: [orphan] }).recentlyCleared).toEqual([])
  })

  it('shows every task and says so when the clears could not be read', () => {
    const out = derive({ connections: [EXPIRED], dismissals: null })
    expect(keys(out.tasks)).toEqual(['conn:expired:c-old'])
    expect(out.unavailable).toEqual(['dismissals'])
  })
})

describe('ordering and the cap', () => {
  it('orders platform_creds, then expired oldest-expiry first, then failed syncs newest first', () => {
    const connections = [
      connection({ id: 'e-late', status: 'expired', expiresAt: '2026-09-03T00:00:00.000Z' }),
      connection({ id: 'e-early', status: 'expired', expiresAt: '2026-08-20T00:00:00.000Z' }),
      connection({ id: 'p-1', status: 'platform_error', platform: 'xero' }),
      connection({ id: 'ok-1' }),
      connection({ id: 'ok-2' }),
      connection({
        id: 'r-late',
        lastRefreshStatus: 'failed',
        lastRefreshAt: '2026-09-05T00:00:00.000Z',
        expiresAt: '2026-09-09T00:00:00.000Z',
      }),
      connection({
        id: 'r-soon',
        lastRefreshStatus: 'failed',
        lastRefreshAt: '2026-09-05T00:00:00.000Z',
        expiresAt: '2026-09-07T00:00:00.000Z',
      }),
    ]
    const jobs = [
      job({ id: 'j-old', connectionId: 'ok-1', createdAt: '2026-09-04T00:00:00.000Z' }),
      job({ id: 'j-new', connectionId: 'ok-2', createdAt: '2026-09-05T00:00:00.000Z' }),
    ]
    const { tasks } = derive({
      connections,
      failedJobs: jobs,
      recentJobs: jobs,
      verticals: [CRM_UP, ACCOUNTING_DOWN],
    })
    expect(keys(tasks)).toEqual([
      'vertical:down:accounting',
      'platform:creds:accounting/xero',
      'conn:expired:e-early',
      'conn:expired:e-late',
      'sync:failed:j-new',
      'sync:failed:j-old',
      'refresh:failing:r-soon',
      'refresh:failing:r-late',
    ])
  })

  it(`shows at most ${TASK_ROW_CAP} rows and counts the rest`, () => {
    const connections = Array.from({ length: TASK_ROW_CAP + 3 }, (_, i) =>
      connection({
        id: `e-${i}`,
        status: 'expired',
        expiresAt: `2026-08-${String(10 + i).padStart(2, '0')}T00:00:00.000Z`,
      }),
    )
    const out = derive({ connections })
    expect(out.tasks).toHaveLength(TASK_ROW_CAP)
    expect(out.hidden).toBe(3)
    expect(out.hiddenHref).toBe('/connections?status=expired')
  })

  it('points the overflow at sync jobs when that is what fell off the end', () => {
    const connections = Array.from({ length: TASK_ROW_CAP }, (_, i) =>
      connection({ id: `e-${i}`, status: 'expired' }),
    )
    const ok = connection({ id: 'ok' })
    const failed = job({ id: 'j', connectionId: 'ok' })
    const out = derive({
      connections: [...connections, ok],
      failedJobs: [failed],
      recentJobs: [failed],
    })
    expect(out.hidden).toBe(1)
    expect(out.hiddenHref).toBe('/sync-jobs?status=failed')
  })

  it('points the overflow at the connection list when failing refreshes fell off the end', () => {
    const connections = Array.from({ length: TASK_ROW_CAP }, (_, i) =>
      connection({ id: `e-${i}`, status: 'expired' }),
    )
    const warn = connection({ id: 'w', lastRefreshStatus: 'failed', lastRefreshAt: NOW })
    const out = derive({ connections: [...connections, warn] })
    expect(out.hidden).toBe(1)
    expect(out.hiddenHref).toBe('/connections')
  })
})

describe('availability', () => {
  it('reports sync jobs unavailable when either read failed, and shows no sync rows', () => {
    const ok = connection({ id: 'c-1' })
    const failed = job({ id: 'j', connectionId: 'c-1' })
    // A null recent list means "no later job" cannot be checked — a stale
    // Retry is worse than a line saying the check did not run.
    expect(derive({ connections: [ok], failedJobs: [failed], recentJobs: null })).toMatchObject({
      tasks: [],
      unavailable: ['sync'],
    })
    expect(derive({ connections: [ok], failedJobs: null, recentJobs: [] }).unavailable).toEqual([
      'sync',
    ])
  })

  it('treats an empty sync-job list as nothing to do (passthrough deployments have none)', () => {
    expect(derive({ failedJobs: [], recentJobs: [] })).toMatchObject({ tasks: [], unavailable: [] })
  })

  it('lists both outages', () => {
    expect(derive({ failedJobs: null, recentJobs: null, dismissals: null }).unavailable).toEqual([
      'sync',
      'dismissals',
    ])
  })

  it('marks the connections of a vertical that is not up as unknown, never as none', () => {
    // admin-api's aggregator swallows a backend outage to `[]`, so the
    // connection list carries no signal of its own; the verticals list does.
    const out = derive({ verticals: [ACCOUNTING_DOWN, CRM_UP] })
    expect(out.unavailableVerticals).toEqual(['accounting'])
    expect(derive({ verticals: [CRM_UP] }).unavailableVerticals).toEqual([])
    expect(derive().unavailableVerticals).toEqual([])
  })
})

describe('role policy', () => {
  const rows = () => {
    const connections = [
      connection({ id: 'e', status: 'expired' }),
      connection({ id: 'p', status: 'platform_error', platform: 'xero' }),
      connection({ id: 'ok' }),
    ]
    const failed = job({ id: 'j', connectionId: 'ok' })
    return { connections, failedJobs: [failed], recentJobs: [failed] }
  }
  const byKind = (tasks: DashboardTask[]) => Object.fromEntries(tasks.map((t) => [t.kind, t]))

  it('is one table, read by every row', () => {
    expect(KIND_MIN_ROLE).toEqual({
      vertical_down: { act: 'admin', clear: null },
      platform_creds: { act: 'admin', clear: 'admin' },
      conn_expired: { act: 'operator', clear: 'operator' },
      refresh_failing: { act: 'operator', clear: 'operator' },
      sync_failed: { act: 'operator', clear: 'operator' },
    })
  })

  it('shows a viewer every row, read-only', () => {
    const { tasks } = derive({ ...rows(), role: 'viewer' })
    expect(tasks).toHaveLength(3)
    for (const t of tasks) expect(t).toMatchObject({ canAct: false, canClear: false })
  })

  it('lets an operator act on and clear connection and sync rows, but not platform credentials', () => {
    const t = byKind(derive({ ...rows(), role: 'operator' }).tasks)
    expect(t.conn_expired).toMatchObject({ canAct: true, canClear: true })
    expect(t.sync_failed).toMatchObject({ canAct: true, canClear: true })
    expect(t.platform_creds).toMatchObject({ canAct: false, canClear: false })
  })

  it('lets an admin do everything', () => {
    for (const t of derive({ ...rows(), role: 'admin' }).tasks) {
      expect(t).toMatchObject({ canAct: true, canClear: true })
    }
  })

  it('withholds Retry on a folded sync even from an admin', () => {
    const expired = connection({ id: 'c-1', status: 'expired' })
    const failed = job({ id: 'j', connectionId: 'c-1' })
    const { tasks } = derive({ connections: [expired], failedJobs: [failed], recentJobs: [failed] })
    expect(tasks[0]!.kind).toBe('conn_expired')
    expect(tasks[0]!.job).not.toBeNull()
    // The folded job is reachable (Open job), never retried from here.
    expect(tasks[0]!.canRetry).toBe(false)
  })
})

describe('dashboardTaskFingerprint', () => {
  it('matches admin-api: ISO 8601 for anything parseable, raw otherwise, empty for nothing', () => {
    expect(dashboardTaskFingerprint('2026-09-01T00:00:00Z')).toBe('2026-09-01T00:00:00.000Z')
    expect(dashboardTaskFingerprint(1_756_684_800_000)).toBe('2025-09-01T00:00:00.000Z')
    expect(dashboardTaskFingerprint('not a date')).toBe('not a date')
    expect(dashboardTaskFingerprint(null)).toBe('')
    expect(dashboardTaskFingerprint('')).toBe('')
  })
})
