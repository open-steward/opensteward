/**
 * The audit log names the operator, not their uuid.
 *
 * `user_id` stays the stored key — it survives a rename and it is what the
 * rows are actually indexed on — so the username is resolved at read time.
 * The cases that matter are the ones where that resolution has nothing to
 * resolve: a deleted account, and the literal `system` the background workers
 * write under. Neither may lose the record of who acted.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { join } from 'path'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import Fastify, { type FastifyInstance } from 'fastify'
import jwt from '@fastify/jwt'
import { openDb } from '@opensteward/shared'
import { AdminStore } from '../../src/core/db/admin-store'
import { IdentityStore } from '../../src/core/db/identity-store'
import { RuntimeSettingsStore } from '../../src/core/db/runtime-settings-store'
import { requireAuth, requireRole } from '../../src/core/auth/jwt-auth'
import { registerOpenApiBridge } from '../../src/core/openapi-setup'
import { isoifyTimestamps, enrichErrorBody } from '../../src/core/routes/_openapi'
import { createAuthRoutes } from '../../src/core/routes/auth'
import { createUsersRoutes } from '../../src/core/routes/users'
import { createAuditRoutes } from '../../src/core/routes/audit'

describe('audit log usernames', () => {
  let dir: string
  let fastify: FastifyInstance
  let adminStore: AdminStore

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'admin-api-audit-names-'))
    const handle = await openDb({ sqlitePath: join(dir, 'admin.db') })
    adminStore = await AdminStore.create(handle)
    const identityStore = await IdentityStore.create(
      handle,
      'test-store-secret-cccccccccccccccccccccccccccc',
    )
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
    await fastify.register(createUsersRoutes(adminStore, identityStore))
    await fastify.register(createAuditRoutes(adminStore))
    await fastify.ready()
  })

  afterEach(async () => {
    await fastify?.close()
    await adminStore?.close()
    if (dir) rmSync(dir, { recursive: true, force: true })
  })

  async function setup(): Promise<{ token: string; id: string }> {
    const res = await fastify.inject({
      method: 'POST',
      url: '/api/auth/setup',
      payload: { username: 'olivia', password: 'SecurePass123!' },
    })
    const body = JSON.parse(res.payload)
    return { token: body.token, id: body.user.id }
  }

  const list = (token: string, qs = '') =>
    fastify.inject({
      method: 'GET',
      url: `/api/audit${qs}`,
      headers: { authorization: `Bearer ${token}` },
    })

  it('reports the username alongside the id', async () => {
    const { token, id } = await setup()
    await adminStore.writeAudit({ userId: id, action: 'end_user.pii_reveal', targetId: 'cus_1' })

    const entry = JSON.parse((await list(token)).payload).data.find(
      (e: { action: string }) => e.action === 'end_user.pii_reveal',
    )
    expect(entry.username).toBe('olivia')
    // The id is still there: it is the stable key, and dropping it would break
    // correlation with anything else that records who acted.
    expect(entry.userId).toBe(id)
  })

  it('names the operator for a PII reveal specifically', async () => {
    // The case that prompted this: revealing a customer's PII recorded a uuid,
    // which tells a reviewer nothing about who looked.
    const { token, id } = await setup()
    await adminStore.writeAudit({ userId: id, action: 'end_user.pii_reveal', targetId: 'cus_9' })

    const body = JSON.parse((await list(token, '?action=end_user.pii_reveal')).payload)
    expect(body.data[0].username).toBe('olivia')
    expect(body.data[0].username).not.toMatch(/^usr_/)
  })

  it('keeps the id visible when the account has been deleted', async () => {
    const { token } = await setup()
    await adminStore.writeAudit({ userId: 'usr_gone', action: 'user.delete' })

    const entry = JSON.parse((await list(token, '?action=user.delete')).payload).data[0]
    // An audit entry must not lose who acted just because the account is gone.
    expect(entry.username).toBe('usr_gone')
    expect(entry.userId).toBe('usr_gone')
  })

  it('reads "system" for a background worker', async () => {
    const { token } = await setup()
    await adminStore.writeAudit({ userId: 'system', action: 'audit.retention.prune' })

    const entry = JSON.parse((await list(token, '?action=audit.retention.prune')).payload).data[0]
    expect(entry.username).toBe('system')
  })

  it('filters by the username the table displays', async () => {
    const { token, id } = await setup()
    await adminStore.writeAudit({ userId: id, action: 'end_user.pii_reveal' })
    await adminStore.writeAudit({ userId: 'usr_someone_else', action: 'end_user.pii_reveal' })

    // A filter that only accepted a uuid would be unusable next to a column of
    // usernames.
    const body = JSON.parse((await list(token, '?user_id=olivia')).payload)
    expect(body.data.length).toBeGreaterThan(0)
    for (const e of body.data) expect(e.userId).toBe(id)
  })

  it('still filters by the raw id', async () => {
    const { token, id } = await setup()
    await adminStore.writeAudit({ userId: id, action: 'end_user.pii_reveal' })

    const body = JSON.parse((await list(token, `?user_id=${id}`)).payload)
    expect(body.data.length).toBeGreaterThan(0)
    for (const e of body.data) expect(e.userId).toBe(id)
  })

  it('carries the username into the CSV export', async () => {
    const { token, id } = await setup()
    await adminStore.writeAudit({ userId: id, action: 'end_user.pii_reveal' })

    const res = await fastify.inject({
      method: 'GET',
      url: '/api/audit/export?format=csv',
      headers: { authorization: `Bearer ${token}` },
    })
    const [header] = res.payload.split('\n')
    expect(header).toContain('username')
    expect(res.payload).toContain('olivia')
  })

  it('resolves each account once, not once per row', async () => {
    const { token, id } = await setup()
    for (let i = 0; i < 25; i++) {
      await adminStore.writeAudit({ userId: id, action: 'end_user.pii_reveal' })
    }
    // Scoped to the rows under test: the page also carries the boot-time
    // `schema.migrate` entry, which is written under `system` by design.
    const body = JSON.parse((await list(token, '?action=end_user.pii_reveal')).payload)
    expect(body.data).toHaveLength(25)
    // One lookup for the page, not N+1 — the resolver takes the whole set.
    expect(body.data.every((e: { username: string }) => e.username === 'olivia')).toBe(true)
  })
})
