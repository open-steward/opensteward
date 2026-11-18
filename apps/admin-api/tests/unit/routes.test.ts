import { describe, it, expect, afterEach, beforeEach } from 'vitest'
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
import { createNotificationsRoutes } from '../../src/core/routes/notifications'
import { createAuditRoutes } from '../../src/core/routes/audit'
import { createVerticalsRoutes } from '../../src/core/routes/verticals'
import { createConnectionsRoutes } from '../../src/core/routes/connections'
import { createPlatformsRoutes } from '../../src/core/routes/platforms'
import { createCompanyInfoRoutes } from '../../src/core/routes/company-info'
import { Aggregator } from '../../src/core/proxy/aggregator'
import { UnifiedClient } from '../../src/core/proxy/client'

function makeTmpDir(): string {
  return mkdtempSync(join(tmpdir(), 'admin-api-routes-'))
}

describe('Admin API routes', () => {
  let dir: string
  let fastify: FastifyInstance
  let adminStore: AdminStore

  beforeEach(async () => {
    dir = makeTmpDir()
    const handle = await openDb({ sqlitePath: join(dir, 'admin.db') })
    adminStore = await AdminStore.create(handle)
    // Shares the SAME handle as adminStore (borrower — not closed separately).
    const identityStore = await IdentityStore.create(
      handle,
      'test-store-secret-cccccccccccccccccccccccccccc',
    )
    const runtimeSettings = await RuntimeSettingsStore.create(handle)

    // Minimal Fastify instance (no helmet/rate-limit to avoid version conflicts).
    // Mirror production by wiring the Zod validator + serializer compilers so
    // routes with `schema:` (Zod) get the same runtime treatment they see in
    // `core/server.ts`.
    fastify = Fastify({ logger: false })
    await registerOpenApiBridge(fastify)
    // Mirror production: normalise timestamp fields to ISO 8601 before the
    // Zod response serializer runs (same hook as core/server.ts).
    fastify.addHook('preSerialization', async (request, reply, payload) =>
      isoifyTimestamps(enrichErrorBody(payload, reply.statusCode, String(request.id))),
    )
    await fastify.register(jwt, { secret: 'test-jwt-secret-that-is-long-enough' })

    fastify.decorate('authenticate', requireAuth)
    fastify.decorate('operatorOnly', requireRole('operator'))
    fastify.decorate('adminOnly', requireRole('admin'))

    // Aggregator points at a dummy backend with no verticals configured.
    // Every /api/verticals/:vertical/... request should 404 locally before
    // ever touching the network.
    const client = new UnifiedClient({ url: 'http://127.0.0.1:1' })
    const aggregator = new Aggregator(client, [])

    await fastify.register(createAuthRoutes(adminStore, runtimeSettings))
    await fastify.register(createUsersRoutes(adminStore, identityStore))
    await fastify.register(createVerticalsRoutes(aggregator))
    await fastify.register(createConnectionsRoutes(aggregator, adminStore))
    await fastify.register(createNotificationsRoutes(adminStore))
    await fastify.register(createAuditRoutes(adminStore))
    await fastify.register(createPlatformsRoutes(aggregator, adminStore))
    await fastify.register(createCompanyInfoRoutes(adminStore))

    await fastify.ready()
  })

  afterEach(async () => {
    await fastify?.close()
    // Closes the shared handle (identityStore is a borrower — do not close it).
    await adminStore?.close()
    if (dir) rmSync(dir, { recursive: true, force: true })
  })

  async function setupAdmin(username = 'admin', password = 'SecurePass123!'): Promise<string> {
    const res = await fastify.inject({
      method: 'POST',
      url: '/api/auth/setup',
      payload: { username, password },
    })
    return JSON.parse(res.payload).token
  }

  // ── Auth routes ─────────────────────────────────────────

  describe('POST /api/auth/setup', () => {
    it('creates the first admin user (201)', async () => {
      const res = await fastify.inject({
        method: 'POST',
        url: '/api/auth/setup',
        payload: { username: 'admin', password: 'SecurePass123!' },
      })
      expect(res.statusCode).toBe(201)
      const body = JSON.parse(res.payload)
      expect(body.token).toBeDefined()
      expect(body.user.role).toBe('admin')
    })

    it('blocks second setup (409)', async () => {
      await setupAdmin()
      const res = await fastify.inject({
        method: 'POST',
        url: '/api/auth/setup',
        payload: { username: 'admin2', password: 'SecurePass123!' },
      })
      expect(res.statusCode).toBe(409)
    })

    it('validates missing fields (400)', async () => {
      const res = await fastify.inject({
        method: 'POST',
        url: '/api/auth/setup',
        payload: {},
      })
      expect(res.statusCode).toBe(400)
    })

    it('rejects reserved __-prefixed usernames (400)', async () => {
      const res = await fastify.inject({
        method: 'POST',
        url: '/api/auth/setup',
        payload: { username: '__probe__', password: 'SecurePass123!' },
      })
      expect(res.statusCode).toBe(400)
    })
  })

  describe('GET /api/auth/has-users', () => {
    it('reports no users on a fresh deployment WITHOUT creating one', async () => {
      const res = await fastify.inject({ method: 'GET', url: '/api/auth/has-users' })
      expect(res.statusCode).toBe(200)
      expect(JSON.parse(res.payload).hasUsers).toBe(false)
      // Must be side-effect-free: a real setup still succeeds afterwards. (It would
      // 409 if the check had persisted a probe user.)
      const setup = await fastify.inject({
        method: 'POST',
        url: '/api/auth/setup',
        payload: { username: 'admin', password: 'SecurePass123!' },
      })
      expect(setup.statusCode).toBe(201)
    })

    it('reports users present once an admin exists', async () => {
      await setupAdmin()
      const res = await fastify.inject({ method: 'GET', url: '/api/auth/has-users' })
      expect(res.statusCode).toBe(200)
      expect(JSON.parse(res.payload).hasUsers).toBe(true)
    })
  })

  describe('POST /api/auth/setup — bootstrap token gate', () => {
    // Self-contained gated instance: the shared beforeEach server has no token.
    async function gatedApp(token?: string) {
      const d = makeTmpDir()
      const handle = await openDb({ sqlitePath: join(d, 'admin.db') })
      const store = await AdminStore.create(handle)
      const rs = await RuntimeSettingsStore.create(handle)
      const app = Fastify({ logger: false })
      await registerOpenApiBridge(app)
      await app.register(jwt, { secret: 'test-jwt-secret-that-is-long-enough' })
      app.decorate('authenticate', requireAuth)
      await app.register(createAuthRoutes(store, rs, { bootstrapToken: token }))
      await app.ready()
      const setup = (headers?: Record<string, string>) =>
        app.inject({
          method: 'POST',
          url: '/api/auth/setup',
          headers,
          payload: { username: 'admin', password: 'SecurePass123!' },
        })
      const cleanup = async () => {
        await app.close()
        await store.close()
        rmSync(d, { recursive: true, force: true })
      }
      return { setup, cleanup }
    }

    it('rejects setup without the token when BOOTSTRAP_TOKEN is set (401)', async () => {
      const { setup, cleanup } = await gatedApp('s3cret-bootstrap-token')
      expect((await setup()).statusCode).toBe(401)
      await cleanup()
    })

    it('rejects setup with a wrong token (401)', async () => {
      const { setup, cleanup } = await gatedApp('s3cret-bootstrap-token')
      expect((await setup({ 'x-bootstrap-token': 'wrong' })).statusCode).toBe(401)
      await cleanup()
    })

    it('accepts setup with the correct token (201)', async () => {
      const { setup, cleanup } = await gatedApp('s3cret-bootstrap-token')
      expect((await setup({ 'x-bootstrap-token': 's3cret-bootstrap-token' })).statusCode).toBe(201)
      await cleanup()
    })

    it('no gate when BOOTSTRAP_TOKEN is unset (201 without a header)', async () => {
      const { setup, cleanup } = await gatedApp(undefined)
      expect((await setup()).statusCode).toBe(201)
      await cleanup()
    })
  })

  describe('POST /api/auth/login', () => {
    it('returns JWT on valid credentials', async () => {
      await setupAdmin()
      const res = await fastify.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { username: 'admin', password: 'SecurePass123!' },
      })
      expect(res.statusCode).toBe(200)
      expect(JSON.parse(res.payload).token).toBeDefined()
    })

    it('returns 401 on invalid credentials', async () => {
      await setupAdmin()
      const res = await fastify.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { username: 'admin', password: 'wrong' },
      })
      expect(res.statusCode).toBe(401)
    })

    it('returns 400 on missing fields', async () => {
      const res = await fastify.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: {},
      })
      expect(res.statusCode).toBe(400)
    })
  })

  describe('GET /api/auth/me', () => {
    it('returns user info with valid JWT', async () => {
      const token = await setupAdmin()
      const res = await fastify.inject({
        method: 'GET',
        url: '/api/auth/me',
        headers: { authorization: `Bearer ${token}` },
      })
      expect(res.statusCode).toBe(200)
      expect(JSON.parse(res.payload).user.username).toBe('admin')
    })

    it('returns 401 without JWT', async () => {
      const res = await fastify.inject({
        method: 'GET',
        url: '/api/auth/me',
      })
      expect(res.statusCode).toBe(401)
    })
  })

  // ── User routes ─────────────────────────────────────────

  describe('GET /api/users', () => {
    it('returns users for admin', async () => {
      const token = await setupAdmin()
      const res = await fastify.inject({
        method: 'GET',
        url: '/api/users',
        headers: { authorization: `Bearer ${token}` },
      })
      expect(res.statusCode).toBe(200)
      expect(JSON.parse(res.payload).data).toHaveLength(1)
    })

    it('returns 401 without auth', async () => {
      const res = await fastify.inject({
        method: 'GET',
        url: '/api/users',
      })
      expect(res.statusCode).toBe(401)
    })
  })

  describe('POST /api/users', () => {
    it('creates a new user (201)', async () => {
      const token = await setupAdmin()
      const res = await fastify.inject({
        method: 'POST',
        url: '/api/users',
        headers: { authorization: `Bearer ${token}` },
        payload: { username: 'operator1', password: 'SecurePass456!', role: 'operator' },
      })
      expect(res.statusCode).toBe(201)
      expect(JSON.parse(res.payload).data.role).toBe('operator')
    })

    it('rejects invalid role (400)', async () => {
      const token = await setupAdmin()
      const res = await fastify.inject({
        method: 'POST',
        url: '/api/users',
        headers: { authorization: `Bearer ${token}` },
        payload: { username: 'x', password: 'SecurePass456!', role: 'superadmin' },
      })
      expect(res.statusCode).toBe(400)
    })

    it('rejects duplicate username (409)', async () => {
      const token = await setupAdmin()
      const res = await fastify.inject({
        method: 'POST',
        url: '/api/users',
        headers: { authorization: `Bearer ${token}` },
        payload: { username: 'admin', password: 'SecurePass456!', role: 'viewer' },
      })
      expect(res.statusCode).toBe(409)
    })
  })

  describe('DELETE /api/users/:id', () => {
    it('cannot delete own account (400)', async () => {
      const token = await setupAdmin()
      const meRes = await fastify.inject({
        method: 'GET',
        url: '/api/auth/me',
        headers: { authorization: `Bearer ${token}` },
      })
      const userId = JSON.parse(meRes.payload).user.id
      const res = await fastify.inject({
        method: 'DELETE',
        url: `/api/users/${userId}`,
        headers: { authorization: `Bearer ${token}` },
      })
      expect(res.statusCode).toBe(400)
    })

    it('returns 404 for non-existent user', async () => {
      const token = await setupAdmin()
      const res = await fastify.inject({
        method: 'DELETE',
        url: '/api/users/fake-id',
        headers: { authorization: `Bearer ${token}` },
      })
      expect(res.statusCode).toBe(404)
    })
  })

  // ── Notification routes ─────────────────────────────────

  describe('GET /api/notifications', () => {
    it('returns empty notifications initially', async () => {
      const token = await setupAdmin()
      const res = await fastify.inject({
        method: 'GET',
        url: '/api/notifications',
        headers: { authorization: `Bearer ${token}` },
      })
      expect(res.statusCode).toBe(200)
      expect(JSON.parse(res.payload).data).toHaveLength(0)
    })
  })

  describe('POST /api/notifications/:id/acknowledge', () => {
    it('returns 404 for missing notification', async () => {
      const token = await setupAdmin()
      const res = await fastify.inject({
        method: 'POST',
        url: '/api/notifications/9999/acknowledge',
        headers: { authorization: `Bearer ${token}` },
      })
      expect(res.statusCode).toBe(404)
    })
  })

  describe('POST /api/notifications/acknowledge-all', () => {
    it('succeeds even when empty (204)', async () => {
      const token = await setupAdmin()
      const res = await fastify.inject({
        method: 'POST',
        url: '/api/notifications/acknowledge-all',
        headers: { authorization: `Bearer ${token}` },
      })
      expect(res.statusCode).toBe(204)
    })
  })

  // ── Audit routes ────────────────────────────────────────

  describe('GET /api/audit', () => {
    it('returns audit log', async () => {
      const token = await setupAdmin()
      const res = await fastify.inject({
        method: 'GET',
        url: '/api/audit',
        headers: { authorization: `Bearer ${token}` },
      })
      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.payload)
      expect(body.meta).toBeDefined()
      expect(Array.isArray(body.data)).toBe(true)
    })

    it('returns 401 without auth', async () => {
      const res = await fastify.inject({
        method: 'GET',
        url: '/api/audit',
      })
      expect(res.statusCode).toBe(401)
    })
  })

  // ── Verticals route ─────────────────────────────────────

  describe('GET /api/verticals', () => {
    it('returns empty verticals when none configured', async () => {
      const token = await setupAdmin()
      const res = await fastify.inject({
        method: 'GET',
        url: '/api/verticals',
        headers: { authorization: `Bearer ${token}` },
      })
      expect(res.statusCode).toBe(200)
      expect(JSON.parse(res.payload).data).toHaveLength(0)
    })
  })

  // ── Connections route ───────────────────────────────────

  describe('GET /api/connections', () => {
    it('returns empty connections when no verticals configured', async () => {
      const token = await setupAdmin()
      const res = await fastify.inject({
        method: 'GET',
        url: '/api/connections',
        headers: { authorization: `Bearer ${token}` },
      })
      expect(res.statusCode).toBe(200)
      expect(JSON.parse(res.payload).data).toHaveLength(0)
    })
  })

  describe('GET /api/connections/:vertical/:id', () => {
    it('returns 404 for unknown vertical', async () => {
      const token = await setupAdmin()
      const res = await fastify.inject({
        method: 'GET',
        url: '/api/connections/unknown/some-id',
        headers: { authorization: `Bearer ${token}` },
      })
      expect(res.statusCode).toBe(404)
    })
  })

  // ── Providers route ─────────────────────────────────────

  describe('GET /api/platforms', () => {
    it('returns empty providers when no verticals configured', async () => {
      const token = await setupAdmin()
      const res = await fastify.inject({
        method: 'GET',
        url: '/api/platforms',
        headers: { authorization: `Bearer ${token}` },
      })
      expect(res.statusCode).toBe(200)
      expect(JSON.parse(res.payload).data).toHaveLength(0)
    })
  })

  // ── Adapter management routes ─────────────────────────────

  describe('GET /api/verticals/:vertical/platforms', () => {
    it('returns 404 for unknown vertical', async () => {
      const token = await setupAdmin()
      const res = await fastify.inject({
        method: 'GET',
        url: '/api/verticals/unknown/platforms',
        headers: { authorization: `Bearer ${token}` },
      })
      expect(res.statusCode).toBe(404)
    })

    it('returns 401 without auth', async () => {
      const res = await fastify.inject({
        method: 'GET',
        url: '/api/verticals/logistics/platforms',
      })
      expect(res.statusCode).toBe(401)
    })
  })

  describe('GET /api/platforms/status', () => {
    // The all-verticals counterpart of the per-vertical route above. It exists
    // so the admin UI can answer "what is enabled?" in one request instead of
    // nine — the fan-out that let a Connect Link render exhaust
    // integration-server's per-IP rate budget.
    it('returns 401 without auth', async () => {
      const res = await fastify.inject({ method: 'GET', url: '/api/platforms/status' })
      expect(res.statusCode).toBe(401)
    })

    it('answers with a list envelope, not a per-vertical shape', async () => {
      const token = await setupAdmin()
      const res = await fastify.inject({
        method: 'GET',
        url: '/api/platforms/status',
        headers: { authorization: `Bearer ${token}` },
      })
      // 200 with rows, or 502 when integration-server is unreachable from the
      // test harness — never 404: the route takes no vertical parameter.
      expect([200, 502]).toContain(res.statusCode)
      if (res.statusCode === 200) {
        const body = JSON.parse(res.payload)
        expect(Array.isArray(body.data)).toBe(true)
        expect(body.meta).toHaveProperty('total')
      }
    })
  })

  describe('POST /api/verticals/:vertical/platforms/:slug/enable', () => {
    it('returns 404 for unknown vertical (no config body)', async () => {
      const token = await setupAdmin()
      // `config` is an optional discriminated PlatformConfig. Pass no
      // body so validation passes and the vertical-unknown branch fires.
      const res = await fastify.inject({
        method: 'POST',
        url: '/api/verticals/unknown/platforms/fortnox/enable',
        headers: { authorization: `Bearer ${token}` },
        payload: {},
      })
      expect(res.statusCode).toBe(404)
    })

    it('rejects OAuth2 config missing clientId / clientSecret (400)', async () => {
      const token = await setupAdmin()
      // PlatformConfig is a discriminated union keyed by `authType`. The
      // oauth2 branch requires clientId + clientSecret; without them the
      // Zod validator should refuse before the handler runs (acceptance
      // criterion 3 of the operator-api-improvements plan).
      const res = await fastify.inject({
        method: 'POST',
        url: '/api/verticals/unknown/platforms/fortnox/enable',
        headers: { authorization: `Bearer ${token}` },
        payload: { config: { authType: 'oauth2' } },
      })
      expect(res.statusCode).toBe(400)
      const body = JSON.parse(res.payload)
      const msg = typeof body.error === 'string' ? body.error : ''
      // The Zod error path includes either clientId or clientSecret
      expect(msg + JSON.stringify(body.issues ?? '')).toMatch(/clientId|clientSecret/)
    })

    it('returns 401 without auth', async () => {
      const res = await fastify.inject({
        method: 'POST',
        url: '/api/verticals/logistics/platforms/fedex/enable',
        payload: {},
      })
      expect(res.statusCode).toBe(401)
    })
  })

  describe('POST /api/verticals/:vertical/platforms/:slug/disable', () => {
    it('returns 404 for unknown vertical', async () => {
      const token = await setupAdmin()
      const res = await fastify.inject({
        method: 'POST',
        url: '/api/verticals/unknown/platforms/fortnox/disable',
        headers: { authorization: `Bearer ${token}` },
      })
      expect(res.statusCode).toBe(404)
    })
  })

  describe('PUT /api/verticals/:vertical/platforms/:slug/config', () => {
    it('returns 400 when config is missing', async () => {
      const token = await setupAdmin()
      const res = await fastify.inject({
        method: 'PUT',
        url: '/api/verticals/unknown/platforms/fortnox/config',
        headers: { authorization: `Bearer ${token}` },
        payload: {},
      })
      // Schema validation (body.config required) runs at the Fastify
      // boundary, before the handler — so a missing `config` returns 400
      // even when the vertical is also unknown.
      expect(res.statusCode).toBe(400)
    })
  })

  // ── Company info routes ───────────────────────────────────

  describe('GET /api/company-info', () => {
    it('returns 401 without auth', async () => {
      const res = await fastify.inject({ method: 'GET', url: '/api/company-info' })
      expect(res.statusCode).toBe(401)
    })

    it('returns null when nothing has been saved', async () => {
      const token = await setupAdmin()
      const res = await fastify.inject({
        method: 'GET',
        url: '/api/company-info',
        headers: { authorization: `Bearer ${token}` },
      })
      expect(res.statusCode).toBe(200)
      expect(JSON.parse(res.payload).data).toBeNull()
    })

    it('returns the saved record', async () => {
      const token = await setupAdmin()
      await fastify.inject({
        method: 'PUT',
        url: '/api/company-info',
        headers: { authorization: `Bearer ${token}` },
        payload: { name: 'Acme', website: 'https://acme.example.com' },
      })
      const res = await fastify.inject({
        method: 'GET',
        url: '/api/company-info',
        headers: { authorization: `Bearer ${token}` },
      })
      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.payload)
      expect(body.data.name).toBe('Acme')
      expect(body.data.website).toBe('https://acme.example.com')
    })
  })

  describe('PUT /api/company-info', () => {
    it('returns 401 without auth', async () => {
      const res = await fastify.inject({
        method: 'PUT',
        url: '/api/company-info',
        payload: { name: 'Acme' },
      })
      expect(res.statusCode).toBe(401)
    })

    it('upserts the record (200) and writes audit', async () => {
      const token = await setupAdmin()
      const res = await fastify.inject({
        method: 'PUT',
        url: '/api/company-info',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          name: 'Acme',
          website: 'https://acme.example.com',
          primaryColor: '#2D6ADB',
          country: 'SE',
        },
      })
      expect(res.statusCode).toBe(200)
      expect(JSON.parse(res.payload).data.name).toBe('Acme')

      // Audit entry written
      const audit = await adminStore.listAudit()
      const entry = audit.find((e) => e.action === 'company_info.update')
      expect(entry).toBeDefined()
    })

    it('returns 400 for invalid website URL', async () => {
      const token = await setupAdmin()
      const res = await fastify.inject({
        method: 'PUT',
        url: '/api/company-info',
        headers: { authorization: `Bearer ${token}` },
        payload: { website: 'not-a-url' },
      })
      expect(res.statusCode).toBe(400)
      expect(JSON.parse(res.payload).error).toContain('website')
    })

    it('returns 400 for invalid hex color', async () => {
      const token = await setupAdmin()
      const res = await fastify.inject({
        method: 'PUT',
        url: '/api/company-info',
        headers: { authorization: `Bearer ${token}` },
        payload: { primaryColor: 'blue' },
      })
      expect(res.statusCode).toBe(400)
    })

    it('returns 400 for invalid country code', async () => {
      const token = await setupAdmin()
      const res = await fastify.inject({
        method: 'PUT',
        url: '/api/company-info',
        headers: { authorization: `Bearer ${token}` },
        payload: { country: 'SWE' },
      })
      expect(res.statusCode).toBe(400)
    })
  })

  describe('DELETE /api/company-info', () => {
    async function saveAcme(token: string) {
      await fastify.inject({
        method: 'PUT',
        url: '/api/company-info',
        headers: { authorization: `Bearer ${token}` },
        payload: { name: 'Acme', primaryColor: '#2D6ADB', baseUrl: 'https://acme.example.com' },
      })
    }

    it('returns 401 without auth', async () => {
      const res = await fastify.inject({ method: 'DELETE', url: '/api/company-info' })
      expect(res.statusCode).toBe(401)
    })

    it('refuses an operator (403) and keeps the record', async () => {
      const token = await setupAdmin()
      await saveAcme(token)
      await fastify.inject({
        method: 'POST',
        url: '/api/users',
        headers: { authorization: `Bearer ${token}` },
        payload: { username: 'operator1', password: 'SecurePass456!', role: 'operator' },
      })
      const login = await fastify.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { username: 'operator1', password: 'SecurePass456!' },
      })
      const res = await fastify.inject({
        method: 'DELETE',
        url: '/api/company-info',
        headers: { authorization: `Bearer ${JSON.parse(login.payload).token}` },
      })
      expect(res.statusCode).toBe(403)
      expect((await adminStore.getCompanyInfo())?.name).toBe('Acme')
    })

    it('returns the deployment to the shipped defaults and writes audit', async () => {
      const token = await setupAdmin()
      await saveAcme(token)
      const res = await fastify.inject({
        method: 'DELETE',
        url: '/api/company-info',
        headers: { authorization: `Bearer ${token}` },
      })
      expect(res.statusCode).toBe(204)

      // Back to exactly what a fresh install answers — not a record of nulls.
      const read = await fastify.inject({
        method: 'GET',
        url: '/api/company-info',
        headers: { authorization: `Bearer ${token}` },
      })
      expect(JSON.parse(read.payload).data).toBeNull()
      const pub = await fastify.inject({ method: 'GET', url: '/api/company-info/public' })
      expect(JSON.parse(pub.payload).data).toMatchObject({
        name: null,
        primaryColor: null,
        baseUrl: null,
      })

      const audit = await adminStore.listAudit()
      expect(audit.find((e) => e.action === 'company_info.reset')).toBeDefined()
    })

    it('is idempotent when nothing has been saved', async () => {
      const token = await setupAdmin()
      const res = await fastify.inject({
        method: 'DELETE',
        url: '/api/company-info',
        headers: { authorization: `Bearer ${token}` },
      })
      expect(res.statusCode).toBe(204)
    })

    it('lets the record be saved again afterwards', async () => {
      const token = await setupAdmin()
      await saveAcme(token)
      await fastify.inject({
        method: 'DELETE',
        url: '/api/company-info',
        headers: { authorization: `Bearer ${token}` },
      })
      const res = await fastify.inject({
        method: 'PUT',
        url: '/api/company-info',
        headers: { authorization: `Bearer ${token}` },
        payload: { name: 'Beta' },
      })
      expect(res.statusCode).toBe(200)
      // Nothing from before the reset survives into the new record.
      expect(JSON.parse(res.payload).data).toMatchObject({ name: 'Beta', primaryColor: null })
    })
  })
})
