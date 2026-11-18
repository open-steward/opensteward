/**
 * Pins three audit surfaces:
 *
 *  - `target_id` filter — "everything that happened to key X" as a direct
 *    query rather than an eyeball job over an action-filtered list.
 *  - `GET /api/audit/actions` — the typed vocabulary, so a filter UI does not
 *    require the admin to already know the exact dotted literal.
 *  - `POST /api/internal/audit` — service-secret ingest that lets connection
 *    lifecycle events, which happen in integration-server, reach this
 *    database's audit trail.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { join } from 'path'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import Fastify, { type FastifyInstance } from 'fastify'
import jwt from '@fastify/jwt'
import { openDb } from '@opensteward/shared'
import { AdminStore } from '../../src/core/db/admin-store'
import { RuntimeSettingsStore } from '../../src/core/db/runtime-settings-store'
import { requireAuth, requireRole } from '../../src/core/auth/jwt-auth'
import { registerOpenApiBridge } from '../../src/core/openapi-setup'
import { isoifyTimestamps, enrichErrorBody } from '../../src/core/routes/_openapi'
import { createAuthRoutes } from '../../src/core/routes/auth'
import { createAuditRoutes, createInternalAuditRoutes } from '../../src/core/routes/audit'
import { AUDIT_ACTION_VALUES } from '../../src/core/db/audit-actions'

const SERVICE_SECRET = 'internal-test-service-secret-32chars!'

describe('audit improvements', () => {
  let dir: string
  let fastify: FastifyInstance
  let adminStore: AdminStore
  let prevSecret: string | undefined

  beforeEach(async () => {
    prevSecret = process.env['SERVICE_SECRET']
    process.env['SERVICE_SECRET'] = SERVICE_SECRET
    dir = mkdtempSync(join(tmpdir(), 'admin-api-audit-imp-'))
    const handle = await openDb({ sqlitePath: join(dir, 'admin.db') })
    adminStore = await AdminStore.create(handle)
    const runtimeSettings = await RuntimeSettingsStore.create(handle)

    fastify = Fastify({ logger: false })
    await registerOpenApiBridge(fastify)
    fastify.addHook('preSerialization', async (request, reply, payload) =>
      isoifyTimestamps(enrichErrorBody(payload, reply.statusCode, String(request.id))),
    )
    await fastify.register(jwt, { secret: 'test-jwt-secret-that-is-long-enough' })
    fastify.decorate('authenticate', requireAuth)
    fastify.decorate('operatorOnly', requireRole('operator'))
    fastify.decorate('adminOnly', requireRole('admin'))
    await fastify.register(createAuthRoutes(adminStore, runtimeSettings))
    await fastify.register(createAuditRoutes(adminStore))
    await fastify.register(createInternalAuditRoutes(adminStore))
    await fastify.ready()
  })

  afterEach(async () => {
    if (prevSecret === undefined) delete process.env['SERVICE_SECRET']
    else process.env['SERVICE_SECRET'] = prevSecret
    await fastify?.close()
    await adminStore?.close()
    if (dir) rmSync(dir, { recursive: true, force: true })
  })

  async function adminToken(): Promise<{ token: string; id: string }> {
    const res = await fastify.inject({
      method: 'POST',
      url: '/api/auth/setup',
      payload: { username: 'olivia', password: 'SecurePass123!' },
    })
    const body = JSON.parse(res.payload)
    return { token: body.token, id: body.user.id }
  }

  it('filters by target_id', async () => {
    const { token, id } = await adminToken()
    await adminStore.writeAudit(id, 'api_key.mint', undefined, 'key-A')
    await adminStore.writeAudit(id, 'api_key.revoke', undefined, 'key-A')
    await adminStore.writeAudit(id, 'api_key.mint', undefined, 'key-B')

    const res = await fastify.inject({
      method: 'GET',
      url: '/api/audit?target_id=key-A',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(200)
    const rows = JSON.parse(res.payload).data
    expect(rows).toHaveLength(2)
    for (const r of rows) expect(r.targetId).toBe('key-A')
  })

  it('serves the full action vocabulary, derived not hand-copied', async () => {
    const { token } = await adminToken()
    const res = await fastify.inject({
      method: 'GET',
      url: '/api/audit/actions',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(200)
    const actions = JSON.parse(res.payload).data as string[]
    expect(actions).toEqual([...AUDIT_ACTION_VALUES])
    expect(actions).toContain('user.login')
    expect(actions).toContain('api_key.rotate')
    expect(actions).toContain('connection.create')
    expect(actions.length).toBeGreaterThan(60)
  })

  it('internal ingest writes connection events under the system user', async () => {
    const res = await fastify.inject({
      method: 'POST',
      url: '/api/internal/audit',
      headers: { 'x-service-secret': SERVICE_SECRET },
      payload: {
        action: 'connection.create',
        targetId: 'conn-123',
        vertical: 'accounting',
        detail: { platform: 'fortnox', tenantId: 'acme' },
      },
    })
    expect(res.statusCode).toBe(202)
    const rows = (await adminStore.listAudit()).filter((e) => e.action === 'connection.create')
    expect(rows).toHaveLength(1)
    expect(rows[0]!.user_id).toBe('system')
    expect(rows[0]!.target_id).toBe('conn-123')
  })

  it('internal ingest refuses a bad secret and a non-connection action', async () => {
    const noSecret = await fastify.inject({
      method: 'POST',
      url: '/api/internal/audit',
      payload: { action: 'connection.create', targetId: 'x' },
    })
    expect(noSecret.statusCode).toBe(401)

    const wrongAction = await fastify.inject({
      method: 'POST',
      url: '/api/internal/audit',
      headers: { 'x-service-secret': SERVICE_SECRET },
      // Not an open audit oracle: only the connection pair is accepted.
      payload: { action: 'user.delete', targetId: 'x' },
    })
    expect(wrongAction.statusCode).toBe(400)
    expect((await adminStore.listAudit()).filter((e) => e.action === 'user.delete')).toHaveLength(0)
  })
})
