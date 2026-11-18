import { describe, it, expect, vi, afterEach } from 'vitest'
import { openDb } from '@opensteward/shared'
import { AdminStore } from '../../src/core/db/admin-store'
import { HealthPoller } from '../../src/core/workers/health-poller'

describe('HealthPoller', () => {
  let store: AdminStore

  afterEach(async () => {
    await store?.close()
  })

  async function openStore() {
    const handle = await openDb({ sqlitePath: ':memory:' })
    store = await AdminStore.create(handle)
    return store
  }

  function mockAggregator(healthResult: any[], connectionsResult: any[] = []) {
    return {
      healthCheck: vi.fn().mockResolvedValue(healthResult),
      allConnections: vi.fn().mockResolvedValue(connectionsResult),
    } as any
  }

  it('creates notification when a vertical is down', async () => {
    const s = await openStore()
    const agg = mockAggregator([
      { name: 'accounting', status: 'down', adapterCount: 0, error: 'ECONNREFUSED' },
    ])
    const poller = new HealthPoller(agg, s)
    await poller.poll()

    const notifs = await s.listUnacknowledged()
    expect(notifs).toHaveLength(1)
    expect(notifs[0].type).toBe('vertical_down')
    expect(notifs[0].message).toContain('accounting')
  })

  it('creates notification for expired connections, deduped across polls', async () => {
    const s = await openStore()
    const agg = mockAggregator(
      [{ name: 'accounting', status: 'up', adapterCount: 1 }],
      [{ id: 'c-1', platform: 'fortnox', label: 'My Fortnox', status: 'expired', vertical: 'accounting' }],
    )
    const poller = new HealthPoller(agg, s)
    await poller.poll()
    await poller.poll() // repeat polls must not pile up duplicate rows

    const notifs = await s.listUnacknowledged()
    expect(notifs).toHaveLength(1)
    expect(notifs[0].type).toBe('credential_expired')
    expect(notifs[0].platform).toBe('fortnox')
  })

  it('creates notification for expiring_soon connections', async () => {
    const s = await openStore()
    const agg = mockAggregator(
      [{ name: 'logistics', status: 'up', adapterCount: 1 }],
      [{ id: 'c-2', platform: 'dhl', label: null, status: 'expiring_soon', vertical: 'logistics' }],
    )
    const poller = new HealthPoller(agg, s)
    await poller.poll()
    await poller.poll() // deduped across polls

    const notifs = await s.listUnacknowledged()
    expect(notifs).toHaveLength(1)
    expect(notifs[0].type).toBe('credential_expiring')
    expect(notifs[0].message).toContain('c-2') // falls back to id when label is null
  })

  it('raises ONE platform_credentials_invalid notification per platform, deduped across polls', async () => {
    const s = await openStore()
    // Two connections of the same platform both blocked by the bad client secret.
    const agg = mockAggregator(
      [{ name: 'accounting', status: 'up', adapterCount: 1 }],
      [
        { id: 'c-1', platform: 'fortnox', label: 'Acme', status: 'platform_error', vertical: 'accounting' },
        { id: 'c-2', platform: 'fortnox', label: 'Beta', status: 'platform_error', vertical: 'accounting' },
      ],
    )
    const poller = new HealthPoller(agg, s)
    await poller.poll()
    await poller.poll() // second tick must not duplicate

    const notifs = (await s.listUnacknowledged()).filter((n) => n.type === 'platform_credentials_invalid')
    expect(notifs).toHaveLength(1)
    expect(notifs[0].platform).toBe('fortnox')
    expect(notifs[0].connection_id ?? null).toBeNull() // platform-scoped, not per-connection
    expect(notifs[0].message).toContain('fortnox')
  })

  it('does not create notifications for healthy verticals and active connections', async () => {
    const s = await openStore()
    const agg = mockAggregator(
      [{ name: 'accounting', status: 'up', adapterCount: 5 }],
      [{ id: 'c-1', platform: 'fortnox', label: 'OK', status: 'active', vertical: 'accounting' }],
    )
    const poller = new HealthPoller(agg, s)
    await poller.poll()

    expect(await s.listUnacknowledged()).toHaveLength(0)
  })

  it('does not re-raise credential_expired for an expired connection the dashboard cleared (matching fingerprint)', async () => {
    const s = await openStore()
    const agg = mockAggregator(
      [{ name: 'accounting', status: 'up', adapterCount: 1 }],
      [
        {
          id: 'c-1',
          platform: 'fortnox',
          label: 'Acme',
          status: 'expired',
          vertical: 'accounting',
          expiresAt: '2026-09-01T00:00:00.000Z',
          createdAt: '2026-08-01T00:00:00.000Z',
        },
        {
          id: 'c-2',
          platform: 'fortnox',
          label: 'Beta',
          status: 'expired',
          vertical: 'accounting',
          expiresAt: null,
          createdAt: 1756684800000, // 2025-09-01T00:00:00.000Z as epoch ms
        },
      ],
    )
    // c-1 cleared with the current fingerprint (expiresAt); c-2 cleared with a
    // stale fingerprint, so it must re-surface.
    await s.dismissDashboardTasks(
      [
        { key: 'conn:expired:c-1', fingerprint: '2026-09-01T00:00:00.000Z' },
        { key: 'conn:expired:c-2', fingerprint: '2024-01-01T00:00:00.000Z' },
      ],
      'user-1',
    )
    const poller = new HealthPoller(agg, s)
    await poller.poll()

    const notifs = await s.listUnacknowledged()
    expect(notifs.map((n) => n.connection_id)).toEqual(['c-2'])
  })

  it('normalises an epoch-ms createdAt to ISO before comparing with the dismissal fingerprint', async () => {
    const s = await openStore()
    const agg = mockAggregator(
      [{ name: 'accounting', status: 'up', adapterCount: 1 }],
      [
        {
          id: 'c-2',
          platform: 'fortnox',
          label: 'Beta',
          status: 'expired',
          vertical: 'accounting',
          expiresAt: null,
          createdAt: 1756684800000,
          updatedAt: 1756684800000,
        },
      ],
    )
    await s.dismissDashboardTasks(
      [{ key: 'conn:expired:c-2', fingerprint: '2025-09-01T00:00:00.000Z' }],
      'user-1',
    )
    const poller = new HealthPoller(agg, s)
    await poller.poll()
    expect(await s.listUnacknowledged()).toHaveLength(0)
  })

  it('a cleared expired connection without a token expiry stays cleared when it is renamed (updatedAt is not the fingerprint)', async () => {
    const s = await openStore()
    const conn = {
      id: 'c-2',
      platform: 'fortnox',
      label: 'Beta',
      status: 'expired',
      vertical: 'accounting',
      expiresAt: null,
      createdAt: '2025-09-01T00:00:00.000Z',
      updatedAt: '2025-09-01T00:00:00.000Z',
    }
    await s.dismissDashboardTasks(
      [{ key: 'conn:expired:c-2', fingerprint: '2025-09-01T00:00:00.000Z' }],
      'user-1',
    )
    // A PATCH of the label rewrites updated_at; nothing about the health changed.
    const renamed = { ...conn, label: 'Beta (renamed)', updatedAt: '2026-09-05T12:00:00.000Z' }
    const poller = new HealthPoller(
      mockAggregator([{ name: 'accounting', status: 'up', adapterCount: 1 }], [renamed]),
      s,
    )
    await poller.poll()
    expect(await s.listUnacknowledged()).toHaveLength(0)
  })

  it('does not re-raise platform_credentials_invalid when the platform task was cleared at its newest token expiry', async () => {
    const s = await openStore()
    const agg = mockAggregator(
      [{ name: 'accounting', status: 'up', adapterCount: 1 }],
      [
        {
          id: 'c-1',
          platform: 'fortnox',
          label: 'Acme',
          status: 'platform_error',
          vertical: 'accounting',
          lastRefreshAt: 1756684800000,
          expiresAt: '2026-01-01T00:00:00.000Z',
          createdAt: '2025-01-01T00:00:00.000Z',
        },
        {
          id: 'c-2',
          platform: 'fortnox',
          label: 'Beta',
          status: 'platform_error',
          vertical: 'accounting',
          lastRefreshAt: 1756771200000,
          expiresAt: 1767312000000, // 2026-01-02T00:00:00.000Z, newest → the fingerprint
          createdAt: '2025-01-01T00:00:00.000Z',
        },
        {
          id: 'c-3',
          platform: 'xero',
          label: 'Other',
          status: 'platform_error',
          vertical: 'accounting',
          lastRefreshAt: null,
          expiresAt: null,
          createdAt: '2026-02-01T00:00:00.000Z', // no expiry → createdAt
        },
      ],
    )
    await s.dismissDashboardTasks(
      [
        { key: 'platform:creds:accounting/fortnox', fingerprint: '2026-01-02T00:00:00.000Z' },
        // Stale: xero's affected set changed since it was cleared.
        { key: 'platform:creds:accounting/xero', fingerprint: '2025-01-01T00:00:00.000Z' },
      ],
      'user-1',
    )
    const poller = new HealthPoller(agg, s)
    await poller.poll()

    const notifs = (await s.listUnacknowledged()).filter(
      (n) => n.type === 'platform_credentials_invalid',
    )
    expect(notifs.map((n) => n.platform)).toEqual(['xero'])
  })

  it('a cleared platform task stays cleared while the same bad secret is retried (lastRefreshAt moves every attempt)', async () => {
    const s = await openStore()
    const base = {
      id: 'c-1',
      platform: 'xero',
      label: 'Acme',
      status: 'platform_error',
      vertical: 'accounting',
      expiresAt: '2026-01-01T00:00:00.000Z',
      createdAt: '2025-01-01T00:00:00.000Z',
      lastRefreshAt: 1756684800000,
    }
    await s.dismissDashboardTasks(
      [{ key: 'platform:creds:accounting/xero', fingerprint: '2026-01-01T00:00:00.000Z' }],
      'user-1',
    )
    const health = [{ name: 'accounting', status: 'up', adapterCount: 1 }]
    await new HealthPoller(mockAggregator(health, [base]), s).poll()
    // A customer call, the keep-alive worker and the sync refresher each
    // retry the refresh and rewrite last_refresh_at; the secret is unchanged.
    await new HealthPoller(
      mockAggregator(health, [{ ...base, lastRefreshAt: 1756771200000 }]),
      s,
    ).poll()
    await new HealthPoller(
      mockAggregator(health, [{ ...base, lastRefreshAt: 1756857600000 }]),
      s,
    ).poll()
    expect(await s.listUnacknowledged()).toHaveLength(0)

    // A refresh that succeeded (new token expiry) and was then rejected again
    // is a new incident: it re-surfaces.
    await new HealthPoller(
      mockAggregator(health, [{ ...base, expiresAt: '2026-03-01T00:00:00.000Z' }]),
      s,
    ).poll()
    expect((await s.listUnacknowledged()).map((n) => n.type)).toEqual([
      'platform_credentials_invalid',
    ])
  })

  it('a dismissal does not suppress the credential_expiring notification', async () => {
    const s = await openStore()
    const agg = mockAggregator(
      [{ name: 'logistics', status: 'up', adapterCount: 1 }],
      [
        {
          id: 'c-2',
          platform: 'dhl',
          label: null,
          status: 'expiring_soon',
          vertical: 'logistics',
          expiresAt: '2026-09-01T00:00:00.000Z',
        },
      ],
    )
    await s.dismissDashboardTasks(
      [{ key: 'conn:expired:c-2', fingerprint: '2026-09-01T00:00:00.000Z' }],
      'user-1',
    )
    const poller = new HealthPoller(agg, s)
    await poller.poll()
    expect((await s.listUnacknowledged()).map((n) => n.type)).toEqual(['credential_expiring'])
  })

  async function ageDismissal(s: AdminStore, key: string, fp: string, at: number) {
    await s
      .getHandle()
      .kysely.updateTable('settings')
      .set({ value: JSON.stringify({ fp, by: 'user-1', at }) })
      .where('key', '=', `dashboard.dismissed:${key}`)
      .execute()
  }

  it('prunes dismissals older than 90 days whose condition is no longer live, on every poll', async () => {
    const s = await openStore()
    await s.dismissDashboardTasks(
      [
        { key: 'conn:expired:old', fingerprint: 'x' },
        { key: 'conn:expired:fresh', fingerprint: 'y' },
      ],
      'user-1',
    )
    const ninetyOneDaysAgo = Date.now() - 91 * 24 * 60 * 60 * 1000
    await ageDismissal(s, 'conn:expired:old', 'x', ninetyOneDaysAgo)

    const poller = new HealthPoller(
      mockAggregator([{ name: 'accounting', status: 'up', adapterCount: 1 }], []),
      s,
    )
    await poller.poll()
    expect((await s.listDashboardDismissals()).map((r) => r.key)).toEqual(['conn:expired:fresh'])
  })

  it('a clear on a condition that is still live outlives the 90-day prune, and the notification stays settled', async () => {
    const s = await openStore()
    const ninetyOneDaysAgo = Date.now() - 91 * 24 * 60 * 60 * 1000
    await s.dismissDashboardTasks(
      [
        { key: 'conn:expired:c-1', fingerprint: '2026-01-01T00:00:00.000Z' },
        { key: 'platform:creds:accounting/xero', fingerprint: '2026-02-01T00:00:00.000Z' },
        { key: 'conn:expired:gone', fingerprint: 'z' },
      ],
      'user-1',
    )
    await ageDismissal(s, 'conn:expired:c-1', '2026-01-01T00:00:00.000Z', ninetyOneDaysAgo)
    await ageDismissal(
      s,
      'platform:creds:accounting/xero',
      '2026-02-01T00:00:00.000Z',
      ninetyOneDaysAgo,
    )
    await ageDismissal(s, 'conn:expired:gone', 'z', ninetyOneDaysAgo)

    const agg = mockAggregator(
      [{ name: 'accounting', status: 'up', adapterCount: 1 }],
      [
        {
          id: 'c-1',
          platform: 'fortnox',
          label: 'Churned customer',
          status: 'expired',
          vertical: 'accounting',
          expiresAt: '2026-01-01T00:00:00.000Z',
          createdAt: '2025-01-01T00:00:00.000Z',
        },
        {
          id: 'c-2',
          platform: 'xero',
          label: 'Acme',
          status: 'platform_error',
          vertical: 'accounting',
          expiresAt: '2026-02-01T00:00:00.000Z',
          createdAt: '2025-01-01T00:00:00.000Z',
        },
      ],
    )
    await new HealthPoller(agg, s).poll()
    expect((await s.listDashboardDismissals()).map((r) => r.key).sort()).toEqual([
      'conn:expired:c-1',
      'platform:creds:accounting/xero',
    ])
    expect(await s.listUnacknowledged()).toHaveLength(0)
  })

  it('does not prune while integration-server is unreachable (liveness unknown), and catches up on the next healthy poll', async () => {
    const s = await openStore()
    await s.dismissDashboardTasks([{ key: 'conn:expired:old', fingerprint: 'x' }], 'user-1')
    await ageDismissal(s, 'conn:expired:old', 'x', 0)
    const down = {
      healthCheck: vi.fn().mockResolvedValue([
        { name: 'accounting', status: 'down', adapterCount: 0, error: 'ECONNREFUSED' },
      ]),
      allConnections: vi.fn().mockResolvedValue([]),
    } as any
    await new HealthPoller(down, s).poll()
    expect((await s.listDashboardDismissals()).map((r) => r.key)).toEqual(['conn:expired:old'])

    await new HealthPoller(
      mockAggregator([{ name: 'accounting', status: 'up', adapterCount: 1 }], []),
      s,
    ).poll()
    expect(await s.listDashboardDismissals()).toEqual([])
  })

  it('does not throw on aggregator errors', async () => {
    const s = await openStore()
    const agg = {
      healthCheck: vi.fn().mockRejectedValue(new Error('network error')),
      allConnections: vi.fn().mockRejectedValue(new Error('network error')),
    } as any
    const poller = new HealthPoller(agg, s)
    // Should not throw
    await expect(poller.poll()).resolves.toBeUndefined()
  })

  it('start and stop manage the interval', async () => {
    const s = await openStore()
    const agg = mockAggregator([])
    const poller = new HealthPoller(agg, s, 60_000)
    poller.start()
    // Starting again should be a no-op
    poller.start()
    poller.stop()
    // Stopping again should be safe
    poller.stop()
  })
})
