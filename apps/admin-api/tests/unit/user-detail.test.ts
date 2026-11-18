/**
 * GET /api/users/:id — the account detail, and the identity reveal.
 *
 * An admin user has no PII: `users` is six columns and nothing there is
 * encrypted or masked. The one identifying value is `identity_links.external_id`
 * — the subject the account maps to in the IdP, which SCIM sets from
 * `externalId ?? userName` and JIT sets from the email it provisioned from.
 *
 * So the reveal here is not an access-control boundary; this whole router is
 * admin-only. It exists so that looking at that value is *recorded*. These
 * tests are therefore as much about the audit row as the payload — including
 * the row that must NOT be written, which is what stops the log filling with
 * noise on every page view.
 *
 * The equivalent end-user flow has no tests at all, so this is written rather
 * than copied.
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

const EXTERNAL_ID = 'olivia@northwind.example'

describe('GET /api/users/:id', () => {
  let dir: string
  let fastify: FastifyInstance
  let adminStore: AdminStore
  let identityStore: IdentityStore
  let runtimeSettings: RuntimeSettingsStore

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'admin-api-user-detail-'))
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

  async function admin(): Promise<{ token: string; id: string }> {
    const res = await fastify.inject({
      method: 'POST',
      url: '/api/auth/setup',
      payload: { username: 'olivia', password: 'SecurePass123!' },
    })
    const body = JSON.parse(res.payload)
    return { token: body.token, id: body.user.id }
  }

  /** Give `userId` an SSO link, so there is an external id to reveal. */
  async function linkSso(userId: string): Promise<void> {
    const provider = await identityStore.createProvider({
      slug: 'okta',
      name: 'Okta',
      protocol: 'oidc',
    })
    await identityStore.createLink({
      providerId: provider.id,
      externalId: EXTERNAL_ID,
      userId,
      scimManaged: true,
    })
  }

  const get = (token: string, id: string, qs = '') =>
    fastify.inject({
      method: 'GET',
      url: `/api/users/${id}${qs}`,
      headers: { authorization: `Bearer ${token}` },
    })

  const revealRows = async () =>
    (await adminStore.listAudit()).filter((e) => e.action === 'user.pii_reveal')

  it('returns the account without any identifying value', async () => {
    const { token, id } = await admin()
    await linkSso(id)

    const data = JSON.parse((await get(token, id)).payload).data
    expect(data.id).toBe(id)
    expect(data.username).toBe('olivia')
    expect(data.links).toHaveLength(1)
    // Absent, not masked. The whole response must not carry it anywhere.
    expect(data.links[0].externalId).toBeNull()
    expect(JSON.stringify(data)).not.toContain(EXTERNAL_ID)
  })

  it('writes no audit row for an ordinary read', async () => {
    const { token, id } = await admin()
    await linkSso(id)
    await get(token, id)
    // Otherwise every page view fills the log and the signal is gone.
    expect(await revealRows()).toHaveLength(0)
  })

  it('reveals the external id when asked', async () => {
    const { token, id } = await admin()
    await linkSso(id)

    const data = JSON.parse((await get(token, id, '?include_identity=true')).payload).data
    expect(data.links[0].externalId).toBe(EXTERNAL_ID)
    expect(data.links[0].providerName).toBe('Okta')
  })

  it('records exactly one reveal, naming who looked and at whom', async () => {
    const { token, id } = await admin()
    await linkSso(id)
    await get(token, id, '?include_identity=true')

    const rows = await revealRows()
    expect(rows).toHaveLength(1)
    expect(rows[0].user_id).toBe(id)
    expect(rows[0].target_id).toBe(id)
  })

  it('never copies the revealed value into the audit row', async () => {
    const { token, id } = await admin()
    await linkSso(id)
    await get(token, id, '?include_identity=true')

    const [row] = await revealRows()
    // An audit log that stores what it is protecting is a second copy of it.
    expect(row.detail ?? '').not.toContain(EXTERNAL_ID)
    expect(row.detail).toBeFalsy()
  })

  it('404s an unknown id without writing a reveal', async () => {
    const { token } = await admin()
    const res = await get(token, 'usr_nope', '?include_identity=true')

    expect(res.statusCode).toBe(404)
    // The end-user equivalent audits before the lookup, so it records reveals
    // of accounts that do not exist.
    expect(await revealRows()).toHaveLength(0)
  })

  describe('account shape', () => {
    it('reads a password-only account as a local admin', async () => {
      const { token, id } = await admin()
      const data = JSON.parse((await get(token, id)).payload).data

      expect(data.ssoOnly).toBe(false)
      // role=admin with no links — the set assertBreakGlassPreserved protects.
      expect(data.isLocalAdmin).toBe(true)
    })

    it('reads a linked account as SSO-only', async () => {
      const { token, id } = await admin()
      await linkSso(id)
      const data = JSON.parse((await get(token, id)).payload).data

      // Derived from links, never the hash: SCIM and JIT accounts carry a
      // hash of random bytes, so the hash cannot tell these apart.
      expect(data.ssoOnly).toBe(true)
      expect(data.isLocalAdmin).toBe(false)
    })

    it('reports whether this account is the pinned break-glass one', async () => {
      const { token, id } = await admin()
      // First-run setup pins the initial admin.
      expect(JSON.parse((await get(token, id)).payload).data.isPinnedBreakGlass).toBe(true)

      await runtimeSettings.set('auth.break_glass_user_id', 'usr_someone_else', 'admin')
      expect(JSON.parse((await get(token, id)).payload).data.isPinnedBreakGlass).toBe(false)
    })

    it('surfaces a pinned account that is not a local admin', async () => {
      // The misconfiguration nothing shows today: pinning an SSO-only account
      // means nobody can sign in the moment local login is disabled.
      const { token, id } = await admin()
      await linkSso(id)
      const data = JSON.parse((await get(token, id)).payload).data

      expect(data.isPinnedBreakGlass).toBe(true)
      expect(data.isLocalAdmin).toBe(false)
    })
  })

  it('refuses a non-admin', async () => {
    const { token } = await admin()
    await fastify.inject({
      method: 'POST',
      url: '/api/users',
      headers: { authorization: `Bearer ${token}` },
      payload: { username: 'op', password: 'SecurePass123!', role: 'operator' },
    })
    const opToken = JSON.parse(
      (
        await fastify.inject({
          method: 'POST',
          url: '/api/auth/login',
          payload: { username: 'op', password: 'SecurePass123!' },
        })
      ).payload,
    ).token

    expect((await get(opToken, 'usr_anything')).statusCode).toBe(403)
  })
})
