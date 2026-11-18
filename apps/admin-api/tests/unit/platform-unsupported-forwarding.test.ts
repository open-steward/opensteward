/**
 * Task A2 (unsupported-platform-status plan): admin-api's enable/disable/
 * config routes must forward a deliberate upstream 4xx refusal — status AND
 * body — rather than flattening every proxied failure to a generic 502.
 *
 * `PLATFORM_UNSUPPORTED` is the motivating case: integration-server (Task A1)
 * refuses `POST /admin/platforms/:vertical/:slug/enable` with
 *
 *   400 { error: { code: 'PLATFORM_UNSUPPORTED', message, reason, issueUrl } }
 *
 * Before this fix, `routes/platforms.ts` wrapped every upstream call in a
 * blanket `catch { reply.status(502).send({ error: 'Failed to …', detail }) }`
 * — so that 400 reached the admin UI/CLI as
 *
 *   502 { error: 'Failed to enable platform', detail: 'Request failed with status code 400' }
 *
 * which names neither the platform, the reason, nor the tracking issue: a
 * useless 502. These tests assert the fix without depending on Task A1's
 * code (not present in this worktree) — the upstream client is stubbed to
 * throw a plain axios-shaped error directly, exactly like `client.ts`'s own
 * `isUpstreamNotFound` helper reads errors elsewhere in this file.
 *
 * A real gateway failure (no response — DNS, refused connection) must still
 * collapse to a generic 502; that case is not a deliberate refusal and admin-
 * api genuinely doesn't know why integration-server didn't answer.
 */
import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { join } from 'path'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import Fastify, { type FastifyInstance } from 'fastify'
import jwt from '@fastify/jwt'
import { openDb } from '@opensteward/shared'
import { AdminStore } from '../../src/core/db/admin-store'
import { requireAuth, requireRole } from '../../src/core/auth/jwt-auth'
import { registerOpenApiBridge } from '../../src/core/openapi-setup'
import { isoifyTimestamps, enrichErrorBody } from '../../src/core/routes/_openapi'
import { createAuthRoutes } from '../../src/core/routes/auth'
import { createPlatformsRoutes } from '../../src/core/routes/platforms'
import { RuntimeSettingsStore } from '../../src/core/db/runtime-settings-store'
import { Aggregator } from '../../src/core/proxy/aggregator'
import { UnifiedClient } from '../../src/core/proxy/client'

/** Shape of the refusal body integration-server's `unsupportedRefusal()`
 *  (Task A1) sends — reproduced structurally, not imported, since Task A1's
 *  code does not exist in this worktree. */
const PLATFORM_UNSUPPORTED_BODY = {
  error: {
    code: 'PLATFORM_UNSUPPORTED',
    message:
      "Acme ERP is not supported: OAuth client must be registered inside each customer's own instance.",
    reason: "OAuth client must be registered inside each customer's own instance.",
    issueUrl: 'https://github.com/open-steward/opensteward/issues/445',
  },
}

/** A plain axios error carrying an upstream 4xx — no `AxiosError` class
 *  needed, since `client.ts`'s own `isUpstreamNotFound` (and the admin-api
 *  error handler in `openapi-setup.ts`) read only the plain-object shape
 *  (`isAxiosError`, `response.status`, `response.data`), not `instanceof`. */
function upstreamHttpError(status: number, data: unknown) {
  const err = new Error(`Request failed with status code ${status}`) as Error & {
    isAxiosError: true
    response: { status: number; data: unknown }
  }
  err.isAxiosError = true
  err.response = { status, data }
  return err
}

/** A real gateway failure: axios sets `isAxiosError` but there is no
 *  `response` at all when the request never got an answer. */
function networkError() {
  const err = new Error('connect ECONNREFUSED 127.0.0.1:1') as Error & { isAxiosError: true }
  err.isAxiosError = true
  return err
}

describe('platforms routes — upstream 4xx forwarding vs network-failure 502', () => {
  let dir: string
  let fastify: FastifyInstance
  let adminStore: AdminStore
  let client: UnifiedClient

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'admin-api-platform-unsupported-'))
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

    client = new UnifiedClient({ url: 'http://127.0.0.1:1' })
    const aggregator = new Aggregator(client, ['accounting'])

    await fastify.register(createAuthRoutes(adminStore, runtimeSettings))
    await fastify.register(createPlatformsRoutes(aggregator, adminStore))
    await fastify.ready()
  })

  afterEach(async () => {
    await fastify?.close()
    await adminStore?.close()
    if (dir) rmSync(dir, { recursive: true, force: true })
  })

  async function adminToken(): Promise<string> {
    const res = await fastify.inject({
      method: 'POST',
      url: '/api/auth/setup',
      payload: { username: 'admin', password: 'SecurePass123!' },
    })
    return JSON.parse(res.payload).token
  }

  function stub(method: 'enablePlatform' | 'disablePlatform' | 'setPlatformConfig', impl: () => never) {
    ;(client as unknown as Record<string, unknown>)[method] = impl
  }

  describe('POST /api/verticals/:vertical/platforms/:slug/enable', () => {
    it('forwards a 400 PLATFORM_UNSUPPORTED body and status unchanged', async () => {
      stub('enablePlatform', () => {
        throw upstreamHttpError(400, PLATFORM_UNSUPPORTED_BODY)
      })
      const token = await adminToken()
      const res = await fastify.inject({
        method: 'POST',
        url: '/api/verticals/accounting/platforms/acme-erp/enable',
        headers: { authorization: `Bearer ${token}` },
        payload: {},
      })
      expect(res.statusCode).toBe(400)
      const body = JSON.parse(res.payload)
      expect(body.error).toMatchObject(PLATFORM_UNSUPPORTED_BODY.error)
    })

    it('still answers 502 when integration-server is unreachable (no response)', async () => {
      stub('enablePlatform', () => {
        throw networkError()
      })
      const token = await adminToken()
      const res = await fastify.inject({
        method: 'POST',
        url: '/api/verticals/accounting/platforms/acme-erp/enable',
        headers: { authorization: `Bearer ${token}` },
        payload: {},
      })
      expect(res.statusCode).toBe(502)
      const body = JSON.parse(res.payload)
      expect(body.error).toBe('Failed to enable platform')
    })
  })

  describe('POST /api/verticals/:vertical/platforms/:slug/disable', () => {
    it('forwards a 400 PLATFORM_UNSUPPORTED body and status unchanged', async () => {
      stub('disablePlatform', () => {
        throw upstreamHttpError(400, PLATFORM_UNSUPPORTED_BODY)
      })
      const token = await adminToken()
      const res = await fastify.inject({
        method: 'POST',
        url: '/api/verticals/accounting/platforms/acme-erp/disable',
        headers: { authorization: `Bearer ${token}` },
      })
      expect(res.statusCode).toBe(400)
      const body = JSON.parse(res.payload)
      expect(body.error).toMatchObject(PLATFORM_UNSUPPORTED_BODY.error)
    })

    it('still answers 502 when integration-server is unreachable (no response)', async () => {
      stub('disablePlatform', () => {
        throw networkError()
      })
      const token = await adminToken()
      const res = await fastify.inject({
        method: 'POST',
        url: '/api/verticals/accounting/platforms/acme-erp/disable',
        headers: { authorization: `Bearer ${token}` },
      })
      expect(res.statusCode).toBe(502)
      const body = JSON.parse(res.payload)
      expect(body.error).toBe('Failed to disable platform')
    })
  })

  describe('PUT /api/verticals/:vertical/platforms/:slug/config', () => {
    it('forwards a 400 PLATFORM_UNSUPPORTED body and status unchanged', async () => {
      stub('setPlatformConfig', () => {
        throw upstreamHttpError(400, PLATFORM_UNSUPPORTED_BODY)
      })
      const token = await adminToken()
      const res = await fastify.inject({
        method: 'PUT',
        url: '/api/verticals/accounting/platforms/acme-erp/config',
        headers: { authorization: `Bearer ${token}` },
        payload: { config: { clientId: 'abc' } },
      })
      expect(res.statusCode).toBe(400)
      const body = JSON.parse(res.payload)
      expect(body.error).toMatchObject(PLATFORM_UNSUPPORTED_BODY.error)
    })

    it('still answers 502 when integration-server is unreachable (no response)', async () => {
      stub('setPlatformConfig', () => {
        throw networkError()
      })
      const token = await adminToken()
      const res = await fastify.inject({
        method: 'PUT',
        url: '/api/verticals/accounting/platforms/acme-erp/config',
        headers: { authorization: `Bearer ${token}` },
        payload: { config: { clientId: 'abc' } },
      })
      expect(res.statusCode).toBe(502)
      const body = JSON.parse(res.payload)
      expect(body.error).toBe('Failed to update platform config')
    })
  })

  // A 5xx from integration-server is its own fault, not a deliberate
  // refusal the caller needs verbatim — collapsing it to 502 (rather than
  // relaying a bare 500 with no OpenSteward envelope) keeps "integration-
  // server is broken" and "integration-server is unreachable" the same
  // shape for the admin UI to render.
  it('collapses an upstream 500 to a generic 502, not a forwarded 500', async () => {
    stub('enablePlatform', () => {
      throw upstreamHttpError(500, { error: 'internal error' })
    })
    const token = await adminToken()
    const res = await fastify.inject({
      method: 'POST',
      url: '/api/verticals/accounting/platforms/acme-erp/enable',
      headers: { authorization: `Bearer ${token}` },
      payload: {},
    })
    expect(res.statusCode).toBe(502)
  })
})
