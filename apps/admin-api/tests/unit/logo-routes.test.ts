/**
 * Logo-fetch job control and the public logo byte surface.
 *
 * The byte endpoint is unauthenticated by design (platform slugs are
 * non-secret catalog data and the bytes render on a public docs page), so the
 * assertions here are about what it must NOT do: leak internal columns, accept
 * a traversal path, or answer anything but 404 for a miss — platforms-ui needs
 * a clean 404 to fall back through .svg → .png → monogram.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { join } from 'path'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import Fastify, { type FastifyInstance } from 'fastify'
import jwt from '@fastify/jwt'
import { openDb } from '@opensteward/shared'
import { AdminStore } from '../../src/core/db/admin-store'
import { LogoStore } from '../../src/core/db/logo-store'
import { RuntimeSettingsStore } from '../../src/core/db/runtime-settings-store'
import { requireAuth, requireRole } from '../../src/core/auth/jwt-auth'
import { registerOpenApiBridge } from '../../src/core/openapi-setup'
import { isoifyTimestamps, enrichErrorBody } from '../../src/core/routes/_openapi'
import { createAuthRoutes } from '../../src/core/routes/auth'
import { createUsersRoutes } from '../../src/core/routes/users'
import { createLogoRoutes } from '../../src/core/routes/logos'
import { IdentityStore } from '../../src/core/db/identity-store'

const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from(Array.from({ length: 2000 }, (_, i) => i % 256)),
])

describe('Logo routes', () => {
  let dir: string
  let fastify: FastifyInstance
  let adminStore: AdminStore
  let logoStore: LogoStore
  let runtimeSettings: RuntimeSettingsStore

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'admin-api-logos-'))
    const handle = await openDb({ sqlitePath: join(dir, 'admin.db') })
    adminStore = await AdminStore.create(handle)
    const identityStore = await IdentityStore.create(
      handle,
      'test-store-secret-cccccccccccccccccccccccccccc',
    )
    logoStore = await LogoStore.create(handle)
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
    await fastify.register(createUsersRoutes(adminStore, identityStore))
    await fastify.register(createLogoRoutes(adminStore, logoStore, runtimeSettings))
    await fastify.ready()
  })

  afterEach(async () => {
    await fastify?.close()
    await adminStore?.close()
    if (dir) rmSync(dir, { recursive: true, force: true })
  })

  async function admin(): Promise<string> {
    const res = await fastify.inject({
      method: 'POST',
      url: '/api/auth/setup',
      payload: { username: 'admin', password: 'SecurePass123!' },
    })
    return JSON.parse(res.payload).token
  }

  async function operator(token: string): Promise<string> {
    await fastify.inject({
      method: 'POST',
      url: '/api/users',
      headers: { authorization: `Bearer ${token}` },
      payload: { username: 'op', password: 'SecurePass123!', role: 'operator' },
    })
    const res = await fastify.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'op', password: 'SecurePass123!' },
    })
    return JSON.parse(res.payload).token
  }

  const setClientId = (value = 'test-client-id') =>
    runtimeSettings.set('logos.brandfetch_client_id', value, 'admin')

  const start = (token: string, payload: Record<string, unknown> = {}) =>
    fastify.inject({
      method: 'POST',
      url: '/api/logo-fetch',
      headers: { authorization: `Bearer ${token}` },
      payload,
    })

  describe('POST /api/logo-fetch', () => {
    it('refuses to start without a Brandfetch client ID', async () => {
      const res = await start(await admin())
      expect(res.statusCode).toBe(400)
      const body = JSON.parse(res.payload)
      expect(body.code).toBe('BRANDFETCH_CLIENT_ID_MISSING')
      // The message has to say where to fix it — this is the most likely
      // first-run stumble.
      expect(body.error).toMatch(/Platforms/)
    })

    it('queues a job and returns 202 with the row', async () => {
      const token = await admin()
      await setClientId()

      const res = await start(token, { force: true, vertical: 'accounting' })
      expect(res.statusCode).toBe(202)
      const job = JSON.parse(res.payload).data
      expect(job).toMatchObject({ status: 'pending', force: true, vertical: 'accounting' })
      expect(job.delayMs).toBe(400)
      expect(job.id).toMatch(/^lfj_/)
    })

    it('409s when a fetch is already running', async () => {
      const token = await admin()
      await setClientId()
      await start(token)

      const res = await start(token)
      expect(res.statusCode).toBe(409)
      const body = JSON.parse(res.payload)
      expect(body.code).toBe('LOGO_FETCH_IN_PROGRESS')
      // The running job comes back so the UI can attach its poller instead of
      // just showing an error.
      expect(body.data.status).toBe('pending')
    })

    it('allows a new fetch once the previous one finished', async () => {
      const token = await admin()
      await setClientId()
      const first = JSON.parse((await start(token)).payload).data
      await logoStore.markCompleted(first.id, (await logoStore.getJob(first.id))!.progress!)

      expect((await start(token)).statusCode).toBe(202)
    })

    it('is admin-only', async () => {
      const token = await admin()
      await setClientId()
      expect((await start(await operator(token))).statusCode).toBe(403)
    })

    it('writes an audit entry', async () => {
      const token = await admin()
      await setClientId()
      const job = JSON.parse((await start(token)).payload).data

      const entries = await adminStore.listAudit()
      const entry = entries.find((e) => e.action === 'logo_fetch.start')
      expect(entry).toBeDefined()
      // The store keeps `detail` as raw JSON; the audit route is what parses
      // it back into the discriminated union.
      expect(JSON.parse(entry!.detail as string)).toMatchObject({
        jobId: job.id,
        force: false,
        vertical: null,
      })
    })
  })

  describe('cancel', () => {
    it('cancels a queued job outright (200)', async () => {
      const token = await admin()
      await setClientId()
      const job = JSON.parse((await start(token)).payload).data

      const res = await fastify.inject({
        method: 'POST',
        url: `/api/logo-fetch/${job.id}/cancel`,
        headers: { authorization: `Bearer ${token}` },
      })
      expect(res.statusCode).toBe(200)
      expect(JSON.parse(res.payload).data.status).toBe('cancelled')
    })

    it('moves a running job to cancelling (202)', async () => {
      const token = await admin()
      await setClientId()
      const job = JSON.parse((await start(token)).payload).data
      await logoStore.claim(job.id, 'pod-a')

      const res = await fastify.inject({
        method: 'POST',
        url: `/api/logo-fetch/${job.id}/cancel`,
        headers: { authorization: `Bearer ${token}` },
      })
      expect(res.statusCode).toBe(202)
      expect(JSON.parse(res.payload).data.status).toBe('cancelling')
    })

    it('409s on an already-finished job', async () => {
      const token = await admin()
      await setClientId()
      const job = JSON.parse((await start(token)).payload).data
      await logoStore.markCompleted(job.id, (await logoStore.getJob(job.id))!.progress!)

      const res = await fastify.inject({
        method: 'POST',
        url: `/api/logo-fetch/${job.id}/cancel`,
        headers: { authorization: `Bearer ${token}` },
      })
      expect(res.statusCode).toBe(409)
      expect(JSON.parse(res.payload).code).toBe('LOGO_FETCH_NOT_CANCELABLE')
    })

    it('404s on an unknown job', async () => {
      const res = await fastify.inject({
        method: 'POST',
        url: '/api/logo-fetch/lfj_nope/cancel',
        headers: { authorization: `Bearer ${await admin()}` },
      })
      expect(res.statusCode).toBe(404)
    })
  })

  describe('status and purge', () => {
    it('reports stored logo totals', async () => {
      const token = await admin()
      await logoStore.putLogo({
        slug: 'xero',
        ext: 'png',
        contentType: 'image/png',
        bytes: PNG,
        sourceDomain: 'xero.com',
        fetchedBy: null,
      })

      const res = await fastify.inject({
        method: 'GET',
        url: '/api/logos/status',
        headers: { authorization: `Bearer ${token}` },
      })
      expect(JSON.parse(res.payload).data).toMatchObject({ count: 1, totalBytes: PNG.length })
    })

    it('purges every logo, admin-only', async () => {
      const token = await admin()
      await logoStore.putLogo({
        slug: 'xero',
        ext: 'png',
        contentType: 'image/png',
        bytes: PNG,
        sourceDomain: 'xero.com',
        fetchedBy: null,
      })

      const forbidden = await fastify.inject({
        method: 'DELETE',
        url: '/api/logos',
        headers: { authorization: `Bearer ${await operator(token)}` },
      })
      expect(forbidden.statusCode).toBe(403)

      const res = await fastify.inject({
        method: 'DELETE',
        url: '/api/logos',
        headers: { authorization: `Bearer ${token}` },
      })
      expect(JSON.parse(res.payload).data.deleted).toBe(1)
      expect((await logoStore.countLogos()).count).toBe(0)
    })
  })

  describe('purge keeps the job history', () => {
    it('deletes the logos but not the record of what ran', async () => {
      const token = await admin()
      await setClientId()
      const job = JSON.parse((await start(token)).payload).data
      await logoStore.markCompleted(job.id, (await logoStore.getJob(job.id))!.progress!)
      await logoStore.putLogo({
        slug: 'xero',
        ext: 'png',
        contentType: 'image/png',
        bytes: PNG,
        sourceDomain: 'xero.com',
        fetchedBy: job.id,
      })

      await fastify.inject({
        method: 'DELETE',
        url: '/api/logos',
        headers: { authorization: `Bearer ${token}` },
      })

      expect((await logoStore.countLogos()).count).toBe(0)
      // The history is a log of what ran, and it is most useful precisely when
      // the library is empty — including runs that stored nothing. Clearing it
      // here took the operator's "Recent fetches" list with it.
      expect((await logoStore.listJobs()).map((j) => j.id)).toEqual([job.id])
    })

    it('keeps a cancelled run, which stored nothing to begin with', async () => {
      const token = await admin()
      await setClientId()
      const job = JSON.parse((await start(token)).payload).data
      await logoStore.markCancelled(job.id)

      await fastify.inject({
        method: 'DELETE',
        url: '/api/logos',
        headers: { authorization: `Bearer ${token}` },
      })

      expect((await logoStore.getJob(job.id))!.status).toBe('cancelled')
    })

    it('leaves a live job alone', async () => {
      const token = await admin()
      await setClientId()
      const job = JSON.parse((await start(token)).payload).data
      await logoStore.claim(job.id, 'pod-a')

      await fastify.inject({
        method: 'DELETE',
        url: '/api/logos',
        headers: { authorization: `Bearer ${token}` },
      })

      expect((await logoStore.getJob(job.id))!.status).toBe('running')
    })
  })

  describe('GET /data/platform-logos/:file', () => {
    beforeEach(async () => {
      await logoStore.putLogo({
        slug: 'xero',
        ext: 'png',
        contentType: 'image/png',
        bytes: PNG,
        sourceDomain: 'xero.com',
        fetchedBy: 'lfj_secret',
      })
    })

    it('serves the bytes unauthenticated with caching headers', async () => {
      const res = await fastify.inject({ method: 'GET', url: '/data/platform-logos/xero.png' })

      expect(res.statusCode).toBe(200)
      expect(res.rawPayload.equals(PNG)).toBe(true)
      expect(res.headers['content-type']).toBe('image/png')
      expect(res.headers.etag).toMatch(/^"[0-9a-f]{64}"$/)
      expect(res.headers['x-content-type-options']).toBe('nosniff')
      // Not immutable — the URL is not content-addressed, so a re-fetch has to
      // be able to win within a bounded window.
      expect(res.headers['cache-control']).toContain('max-age=300')
    })

    it('answers 304 for a matching If-None-Match, with no body', async () => {
      const first = await fastify.inject({ method: 'GET', url: '/data/platform-logos/xero.png' })
      const res = await fastify.inject({
        method: 'GET',
        url: '/data/platform-logos/xero.png',
        headers: { 'if-none-match': first.headers.etag as string },
      })

      expect(res.statusCode).toBe(304)
      expect(res.rawPayload.length).toBe(0)
      expect(res.headers.etag).toBe(first.headers.etag)
    })

    it('never leaks internal columns', async () => {
      const res = await fastify.inject({ method: 'GET', url: '/data/platform-logos/xero.png' })
      const headers = JSON.stringify(res.headers)
      // fetched_by is an internal job id; source_domain reveals the upstream
      // this deployment scrapes. Neither belongs in a public response.
      expect(headers).not.toContain('lfj_secret')
      expect(headers).not.toContain('xero.com')
    })

    it('404s a miss so the monogram fallback can fire', async () => {
      const res = await fastify.inject({ method: 'GET', url: '/data/platform-logos/unknown.svg' })
      expect(res.statusCode).toBe(404)
    })

    it('404s the wrong extension for a stored slug', async () => {
      // platforms-ui tries .svg first; a slug stored only as .png must miss
      // cleanly rather than serving PNG bytes as an SVG.
      expect(
        (await fastify.inject({ method: 'GET', url: '/data/platform-logos/xero.svg' })).statusCode,
      ).toBe(404)
    })

    it.each([
      '..%2F..%2Fetc%2Fpasswd',
      'xero.png%00.txt',
      'Xero.png',
      'xero.exe',
      '-leading-dash.png',
    ])('404s the malformed name %s', async (file) => {
      const res = await fastify.inject({ method: 'GET', url: `/data/platform-logos/${file}` })
      expect(res.statusCode).toBe(404)
    })
  })

  describe('GET /data/platform-logos/manifest.json', () => {
    it('lists stored slugs and their extensions', async () => {
      await logoStore.putLogo({
        slug: 'xero',
        ext: 'png',
        contentType: 'image/png',
        bytes: PNG,
        sourceDomain: 'xero.com',
        fetchedBy: null,
      })

      const res = await fastify.inject({ method: 'GET', url: '/data/platform-logos/manifest.json' })
      expect(res.statusCode).toBe(200)
      expect(JSON.parse(res.payload)).toEqual({ count: 1, logos: { xero: ['png'] } })
    })

    it('is empty on a deployment that stores nothing — the disk-only case', async () => {
      const res = await fastify.inject({ method: 'GET', url: '/data/platform-logos/manifest.json' })
      expect(JSON.parse(res.payload)).toEqual({ count: 0, logos: {} })
    })
  })

  describe('GET /data/platform-logos/config', () => {
    it('returns the validated config, not the raw settings', async () => {
      // cdn with no client ID must resolve to none — the same fall-back
      // resolveLogoConfig applies everywhere else.
      await runtimeSettings.set('logos.source', 'cdn', 'admin')

      const res = await fastify.inject({ method: 'GET', url: '/data/platform-logos/config' })
      expect(JSON.parse(res.payload)).toEqual({ logoSource: 'none', brandfetchClientId: null })
    })

    it('returns cdn once a client ID is set', async () => {
      await runtimeSettings.set('logos.source', 'cdn', 'admin')
      await setClientId('abc123')

      const res = await fastify.inject({ method: 'GET', url: '/data/platform-logos/config' })
      expect(JSON.parse(res.payload)).toEqual({ logoSource: 'cdn', brandfetchClientId: 'abc123' })
    })
  })
})
