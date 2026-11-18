/**
 * PATCH /api/users/:id — role change and password reset in place.
 *
 * In-place update preserves the user id — delete-and-recreate changes it
 * and can orphan the break-glass pin. The contract pinned here: the same
 * break-glass floor that guards deletion
 * guards demotion, self-demotion is refused, the password value never
 * reaches the audit log, and a reset actually rotates the credential.
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

describe('PATCH /api/users/:id', () => {
  let dir: string
  let fastify: FastifyInstance
  let adminStore: AdminStore
  let identityStore: IdentityStore
  let runtimeSettings: RuntimeSettingsStore

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'admin-api-user-update-'))
    const handle = await openDb({ sqlitePath: join(dir, 'admin.db') })
    adminStore = await AdminStore.create(handle)
    identityStore = await IdentityStore.create(
      handle,
      'test-store-secret-cccccccccccccccccccccccccccc',
    )
    runtimeSettings = await RuntimeSettingsStore.create(handle)

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
    await fastify.register(createUsersRoutes(adminStore, identityStore, runtimeSettings))
    await fastify.ready()
  })

  afterEach(async () => {
    await fastify?.close()
    await adminStore?.close()
    if (dir) rmSync(dir, { recursive: true, force: true })
  })

  async function setupAdmin(): Promise<{ token: string; id: string }> {
    const res = await fastify.inject({
      method: 'POST',
      url: '/api/auth/setup',
      payload: { username: 'olivia', password: 'SecurePass123!' },
    })
    const body = JSON.parse(res.payload)
    return { token: body.token, id: body.user.id }
  }

  const create = (token: string, username: string, role: string) =>
    fastify.inject({
      method: 'POST',
      url: '/api/users',
      headers: { authorization: `Bearer ${token}` },
      payload: { username, password: 'SecurePass123!', role },
    })

  const patch = (token: string, id: string, body: Record<string, unknown>) =>
    fastify.inject({
      method: 'PATCH',
      url: `/api/users/${id}`,
      headers: { authorization: `Bearer ${token}` },
      payload: body,
    })

  const login = (username: string, password: string) =>
    fastify.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username, password },
    })

  it('changes a role in place — same id, audited without secrets', async () => {
    const { token } = await setupAdmin()
    const created = JSON.parse((await create(token, 'viewer.van', 'viewer')).payload).data

    const res = await patch(token, created.id, { role: 'operator' })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.payload).data
    expect(body.id).toBe(created.id)
    expect(body.role).toBe('operator')

    const rows = (await adminStore.listAudit()).filter((e) => e.action === 'user.update')
    expect(rows).toHaveLength(1)
    expect(rows[0]!.target_id).toBe(created.id)
  })

  it('resets a password: old stops working, new works, value never audited', async () => {
    const { token } = await setupAdmin()
    const created = JSON.parse((await create(token, 'petra.op', 'operator')).payload).data

    const res = await patch(token, created.id, { password: 'FreshSecret456!' })
    expect(res.statusCode).toBe(200)

    expect((await login('petra.op', 'SecurePass123!')).statusCode).toBe(401)
    expect((await login('petra.op', 'FreshSecret456!')).statusCode).toBe(200)

    const all = JSON.stringify(await adminStore.listAudit())
    expect(all).not.toContain('FreshSecret456!')
    expect(all).toContain('passwordChanged')
  })

  it('refuses changing your own role', async () => {
    const { token, id } = await setupAdmin()
    const res = await patch(token, id, { role: 'viewer' })
    expect(res.statusCode).toBe(400)
  })

  it('refuses a demotion that would leave no break-glass admin', async () => {
    const { token, id: setupId } = await setupAdmin()
    const second = JSON.parse((await create(token, 'aksel.admin', 'admin')).payload).data

    // While the setup admin is a plain local admin, demoting the second is
    // fine — a password-usable admin remains.
    expect((await patch(token, second.id, { role: 'viewer' })).statusCode).toBe(200)
    expect((await patch(token, second.id, { role: 'admin' })).statusCode).toBe(200)

    // Make the setup admin SSO-only. The second admin is now the LAST
    // password-usable local admin — same floor that refuses deleting them.
    const provider = await identityStore.createProvider({
      slug: 'okta',
      name: 'Okta',
      protocol: 'oidc',
    })
    await identityStore.createLink({
      providerId: provider.id,
      externalId: 'olivia@corp.example',
      userId: setupId,
      scimManaged: false,
    })
    const refused = await patch(token, second.id, { role: 'viewer' })
    expect(refused.statusCode).toBe(409)
  })

  it('validates the password policy and the role enum', async () => {
    const { token } = await setupAdmin()
    const created = JSON.parse((await create(token, 'quinn.v', 'viewer')).payload).data
    expect((await patch(token, created.id, { password: 'short' })).statusCode).toBe(400)
    expect((await patch(token, created.id, { role: 'superuser' })).statusCode).toBe(400)
    expect((await patch(token, created.id, {})).statusCode).toBe(400)
    expect((await patch(token, 'nope', { role: 'viewer' })).statusCode).toBe(404)
  })
})
