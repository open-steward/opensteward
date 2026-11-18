/**
 * Dashboard task dismissals — the admin-api half of "Clearing".
 *
 * Operators clear a row on the dashboard's "Needs attention" panel once; the
 * clear is deployment-wide, keyed by task key + fingerprint, and also
 * acknowledges the notification the health poller raised for the same
 * condition so one clear settles both surfaces. Viewers can read the list
 * (the panel is rendered for them too) but cannot write it.
 */
import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import jwt from '@fastify/jwt'
import { openDb } from '@opensteward/shared'
import { AdminStore } from '../../src/core/db/admin-store'
import { requireAuth, requireRole } from '../../src/core/auth/jwt-auth'
import { registerOpenApiBridge } from '../../src/core/openapi-setup'
import { isoifyTimestamps, enrichErrorBody } from '../../src/core/routes/_openapi'
import { createDashboardTasksRoutes } from '../../src/core/routes/dashboard-tasks'
import { createNotificationsRoutes } from '../../src/core/routes/notifications'

let app: FastifyInstance
let adminStore: AdminStore

beforeEach(async () => {
  const handle = await openDb({ sqlitePath: ':memory:' })
  adminStore = await AdminStore.create(handle)
  app = Fastify({ logger: false })
  await registerOpenApiBridge(app)
  app.addHook('preSerialization', async (request, reply, payload) =>
    isoifyTimestamps(enrichErrorBody(payload, reply.statusCode, String(request.id))),
  )
  await app.register(jwt, { secret: 'test-jwt-secret-that-is-long-enough' })
  app.decorate('authenticate', requireAuth)
  app.decorate('operatorOnly', requireRole('operator'))
  app.decorate('adminOnly', requireRole('admin'))
  await app.register(createDashboardTasksRoutes(adminStore))
  await app.register(createNotificationsRoutes(adminStore))
  await app.ready()
})

afterEach(async () => {
  await app?.close()
  await adminStore?.close()
})

function tokenFor(role: 'admin' | 'operator' | 'viewer', id = `u-${role}`) {
  return app.jwt.sign({ id, username: role, role })
}

function inject(
  method: 'GET' | 'POST' | 'DELETE',
  url: string,
  role: 'admin' | 'operator' | 'viewer' | null,
  payload?: unknown,
) {
  return app.inject({
    method,
    url,
    headers: role ? { authorization: `Bearer ${tokenFor(role)}` } : {},
    ...(payload !== undefined ? { payload } : {}),
  })
}

const DISMISSALS = '/api/dashboard-tasks/dismissals'

describe('GET /api/dashboard-tasks/dismissals', () => {
  it('requires a token', async () => {
    const res = await inject('GET', DISMISSALS, null)
    expect(res.statusCode).toBe(401)
  })

  it('lists dismissals for any role, with the timestamp as ISO', async () => {
    await adminStore.dismissDashboardTasks(
      [{ key: 'conn:expired:c-1', fingerprint: '2026-09-01T00:00:00.000Z' }],
      'u-operator',
    )
    const res = await inject('GET', DISMISSALS, 'viewer')
    expect(res.statusCode).toBe(200)
    const { data } = res.json()
    expect(data).toEqual([
      {
        key: 'conn:expired:c-1',
        fingerprint: '2026-09-01T00:00:00.000Z',
        by: 'u-operator',
        createdAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      },
    ])
  })
})

describe('POST /api/dashboard-tasks/dismissals', () => {
  it('a viewer is refused (403) and nothing is stored', async () => {
    const res = await inject('POST', DISMISSALS, 'viewer', {
      items: [{ key: 'conn:expired:c-1', fingerprint: 'x' }],
    })
    expect(res.statusCode).toBe(403)
    expect(await adminStore.listDashboardDismissals()).toEqual([])
  })

  it('an operator stores the items (204) and an audit row names the keys', async () => {
    const res = await inject('POST', DISMISSALS, 'operator', {
      items: [
        { key: 'conn:expired:c-1', fingerprint: '2026-09-01T00:00:00.000Z' },
        { key: 'sync:failed:job-7', fingerprint: '' },
      ],
    })
    expect(res.statusCode).toBe(204)
    const rows = await adminStore.listDashboardDismissals()
    expect(rows.map((r) => r.key).sort()).toEqual(['conn:expired:c-1', 'sync:failed:job-7'])
    expect(rows.every((r) => r.by === 'u-operator')).toBe(true)

    const audit = await adminStore.listAudit(10, 0, { action: 'dashboard_task.dismiss' })
    expect(audit).toHaveLength(1)
    expect(JSON.parse(audit[0]!.detail!)).toEqual({
      keys: ['conn:expired:c-1', 'sync:failed:job-7'],
      count: 2,
    })
  })

  it('an operator clears a refresh:failing key (204); a vertical:down key is refused (400), it is not clearable', async () => {
    const ok = await inject('POST', DISMISSALS, 'operator', {
      items: [{ key: 'refresh:failing:c-9', fingerprint: '2026-09-05T11:00:00.000Z' }],
    })
    expect(ok.statusCode).toBe(204)
    expect((await adminStore.listDashboardDismissals()).map((r) => r.key)).toEqual([
      'refresh:failing:c-9',
    ])
    const down = await inject('POST', DISMISSALS, 'admin', {
      items: [{ key: 'vertical:down:accounting', fingerprint: '' }],
    })
    expect(down.statusCode).toBe(400)
    expect(await adminStore.listDashboardDismissals()).toHaveLength(1)
  })

  it('platform:creds and wizard keys need the admin role: an operator is refused (403) and the whole batch is left unstored', async () => {
    for (const key of ['platform:creds:accounting/xero', 'wizard:credentials']) {
      const res = await inject('POST', DISMISSALS, 'operator', {
        items: [
          { key: 'conn:expired:c-1', fingerprint: 'x' },
          { key, fingerprint: '' },
        ],
      })
      expect(res.statusCode, key).toBe(403)
    }
    expect(await adminStore.listDashboardDismissals()).toEqual([])
    // The platform notification the operator could not clear is still up
    // for the admin who can fix the credentials.
    await adminStore.createNotification(
      'platform_credentials_invalid',
      'c',
      'accounting',
      undefined,
      'xero',
    )
    const res = await inject('POST', DISMISSALS, 'operator', {
      items: [{ key: 'platform:creds:accounting/xero', fingerprint: 'y' }],
    })
    expect(res.statusCode).toBe(403)
    expect(await adminStore.listUnacknowledged()).toHaveLength(1)
  })

  it('an admin clears platform:creds and wizard keys (204)', async () => {
    const res = await inject('POST', DISMISSALS, 'admin', {
      items: [
        { key: 'platform:creds:accounting/xero', fingerprint: 'y' },
        { key: 'wizard:credentials', fingerprint: '' },
      ],
    })
    expect(res.statusCode).toBe(204)
    expect((await adminStore.listDashboardDismissals()).map((r) => r.key).sort()).toEqual([
      'platform:creds:accounting/xero',
      'wizard:credentials',
    ])
  })

  it('acknowledges the matching unacknowledged notifications, and only those', async () => {
    await adminStore.createNotification('credential_expired', 'a', 'accounting', 'c-1', 'fortnox')
    await adminStore.createNotification('credential_expired', 'b', 'accounting', 'c-2', 'fortnox')
    await adminStore.createNotification(
      'platform_credentials_invalid',
      'c',
      'accounting',
      undefined,
      'xero',
    )
    await adminStore.createNotification(
      'platform_credentials_invalid',
      'd',
      'crm',
      undefined,
      'xero',
    )
    await adminStore.createNotification('credential_expiring', 'e', 'accounting', 'c-1', 'fortnox')

    // Admin: the batch includes a platform:creds key.
    const res = await inject('POST', DISMISSALS, 'admin', {
      items: [
        { key: 'conn:expired:c-1', fingerprint: 'x' },
        { key: 'platform:creds:accounting/xero', fingerprint: 'y' },
        { key: 'sync:failed:job-1', fingerprint: '' },
      ],
    })
    expect(res.statusCode).toBe(204)
    const left = (await adminStore.listUnacknowledged()).map((n) => n.message).sort()
    expect(left).toEqual(['b', 'd', 'e'])
  })

  it('rejects an unknown key prefix, an empty list and more than 50 items (400)', async () => {
    const bad = await inject('POST', DISMISSALS, 'operator', {
      items: [{ key: 'evil:thing', fingerprint: '' }],
    })
    expect(bad.statusCode).toBe(400)
    const empty = await inject('POST', DISMISSALS, 'operator', { items: [] })
    expect(empty.statusCode).toBe(400)
    const many = await inject('POST', DISMISSALS, 'operator', {
      items: Array.from({ length: 51 }, (_, i) => ({ key: `sync:failed:j${i}`, fingerprint: '' })),
    })
    expect(many.statusCode).toBe(400)
    expect(await adminStore.listDashboardDismissals()).toEqual([])
  })
})

describe('DELETE /api/dashboard-tasks/dismissals/:key', () => {
  it('a viewer is refused (403)', async () => {
    await adminStore.dismissDashboardTasks([{ key: 'conn:expired:c-1', fingerprint: 'x' }], 'u')
    const res = await inject('DELETE', `${DISMISSALS}/conn:expired:c-1`, 'viewer')
    expect(res.statusCode).toBe(403)
    expect(await adminStore.listDashboardDismissals()).toHaveLength(1)
  })

  it('removes the row (204), 404 when it is already gone, and a slash in the key survives URL-encoding', async () => {
    await adminStore.dismissDashboardTasks(
      [{ key: 'platform:creds:accounting/xero', fingerprint: 'y' }],
      'u',
    )
    // Only platform:creds keys carry a slash, and those are admin-only.
    const key = encodeURIComponent('platform:creds:accounting/xero')
    const res = await inject('DELETE', `${DISMISSALS}/${key}`, 'admin')
    expect(res.statusCode).toBe(204)
    expect(await adminStore.listDashboardDismissals()).toEqual([])
    const again = await inject('DELETE', `${DISMISSALS}/${key}`, 'admin')
    expect(again.statusCode).toBe(404)

    const audit = await adminStore.listAudit(10, 0, { action: 'dashboard_task.undismiss' })
    expect(audit).toHaveLength(1)
    expect(audit[0]!.target_id).toBe('platform:creds:accounting/xero')
  })

  it('an operator removes a conn:expired row (204)', async () => {
    await adminStore.dismissDashboardTasks([{ key: 'conn:expired:c-1', fingerprint: 'x' }], 'u')
    const res = await inject('DELETE', `${DISMISSALS}/conn:expired:c-1`, 'operator')
    expect(res.statusCode).toBe(204)
    expect(await adminStore.listDashboardDismissals()).toEqual([])
  })

  it('rejects a key outside the allowed shape (400)', async () => {
    const res = await inject('DELETE', `${DISMISSALS}/nope`, 'operator')
    expect(res.statusCode).toBe(400)
  })

  it('un-clearing a platform:creds or wizard key needs the admin role', async () => {
    await adminStore.dismissDashboardTasks(
      [
        { key: 'platform:creds:accounting/xero', fingerprint: 'y' },
        { key: 'wizard:credentials', fingerprint: '' },
      ],
      'u-admin',
    )
    for (const key of ['platform:creds:accounting/xero', 'wizard:credentials']) {
      const res = await inject('DELETE', `${DISMISSALS}/${encodeURIComponent(key)}`, 'operator')
      expect(res.statusCode, key).toBe(403)
    }
    expect(await adminStore.listDashboardDismissals()).toHaveLength(2)
    const res = await inject('DELETE', `${DISMISSALS}/wizard:credentials`, 'admin')
    expect(res.statusCode).toBe(204)
    expect((await adminStore.listDashboardDismissals()).map((r) => r.key)).toEqual([
      'platform:creds:accounting/xero',
    ])
  })
})

describe('notifications: acknowledge is operator+, unread-count is for everyone', () => {
  it('a viewer cannot acknowledge one notification or all of them (403)', async () => {
    await adminStore.createNotification('vertical_down', 'down', 'crm')
    const [row] = await adminStore.listUnacknowledged()
    const one = await inject('POST', `/api/notifications/${row!.id}/acknowledge`, 'viewer')
    expect(one.statusCode).toBe(403)
    const all = await inject('POST', '/api/notifications/acknowledge-all', 'viewer')
    expect(all.statusCode).toBe(403)
    expect(await adminStore.listUnacknowledged()).toHaveLength(1)
  })

  it('an operator still can (204)', async () => {
    await adminStore.createNotification('vertical_down', 'down', 'crm')
    const [row] = await adminStore.listUnacknowledged()
    const one = await inject('POST', `/api/notifications/${row!.id}/acknowledge`, 'operator')
    expect(one.statusCode).toBe(204)
    const all = await inject('POST', '/api/notifications/acknowledge-all', 'operator')
    expect(all.statusCode).toBe(204)
  })

  it('GET /api/notifications/unread-count counts unacknowledged rows minus credential_expiring', async () => {
    await adminStore.createNotification('credential_expiring', 'soon', 'accounting', 'c-1', 'x')
    await adminStore.createNotification('credential_expired', 'gone', 'accounting', 'c-2', 'x')
    await adminStore.createNotification('vertical_down', 'down', 'crm')
    const res = await inject('GET', '/api/notifications/unread-count', 'viewer')
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ data: { count: 2 } })
    await adminStore.acknowledgeAll()
    const after = await inject('GET', '/api/notifications/unread-count', 'viewer')
    expect(after.json()).toEqual({ data: { count: 0 } })
  })
})
