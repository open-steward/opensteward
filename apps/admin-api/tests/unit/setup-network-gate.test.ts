/**
 * First-run admin setup. With no BOOTSTRAP_TOKEN configured, the only other
 * guard on `POST /api/auth/setup` is the empty-table 409 — on its own that
 * would let a network caller race the operator to claim the admin account on
 * a fresh (or wiped-empty) deployment. So the route refuses non-loopback
 * callers when tokenless: a remote first-run must carry a BOOTSTRAP_TOKEN;
 * only a caller on the host may set up tokenless. admin-api does not enable
 * trustProxy, so request.ip is the real socket peer and loopback cannot be
 * forged by a header.
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
import { registerOpenApiBridge } from '../../src/core/openapi-setup'
import { isoifyTimestamps, enrichErrorBody } from '../../src/core/routes/_openapi'
import { requireAuth, requireRole } from '../../src/core/auth/jwt-auth'
import { createAuthRoutes } from '../../src/core/routes/auth'

const REMOTE = '203.0.113.7'
const BOOTSTRAP = 'a-real-bootstrap-token-32-chars-long!!'

async function boot(dir: string, bootstrapToken?: string): Promise<FastifyInstance> {
  const handle = await openDb({ sqlitePath: join(dir, 'admin.db') })
  const adminStore = await AdminStore.create(handle)
  const runtimeSettings = await RuntimeSettingsStore.create(handle)
  const fastify = Fastify({ logger: false })
  await registerOpenApiBridge(fastify)
  fastify.addHook('preSerialization', async (request, reply, payload) =>
    isoifyTimestamps(enrichErrorBody(payload, reply.statusCode, String(request.id))),
  )
  await fastify.register(jwt, { secret: 'test-jwt-secret-that-is-long-enough' })
  fastify.decorate('authenticate', requireAuth)
  fastify.decorate('operatorOnly', requireRole('operator'))
  fastify.decorate('adminOnly', requireRole('admin'))
  await fastify.register(createAuthRoutes(adminStore, runtimeSettings, { bootstrapToken }))
  await fastify.ready()
  return fastify
}

describe('POST /api/auth/setup network gate', () => {
  let dir: string
  let fastify: FastifyInstance

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'admin-api-setup-gate-'))
  })
  afterEach(async () => {
    await fastify?.close()
    if (dir) rmSync(dir, { recursive: true, force: true })
  })

  const setup = (opts: { remoteAddress?: string; token?: string } = {}) =>
    fastify.inject({
      method: 'POST',
      url: '/api/auth/setup',
      ...(opts.remoteAddress ? { remoteAddress: opts.remoteAddress } : {}),
      ...(opts.token ? { headers: { 'x-bootstrap-token': opts.token } } : {}),
      payload: { username: 'olivia', password: 'SecurePass123!' },
    })

  it('refuses a tokenless setup from a non-loopback address (403)', async () => {
    fastify = await boot(dir)
    const res = await setup({ remoteAddress: REMOTE })
    expect(res.statusCode).toBe(403)
    expect(res.payload).toContain('BOOTSTRAP_TOKEN')
  })

  it('allows a tokenless setup from loopback (the operator on the box)', async () => {
    fastify = await boot(dir)
    // fastify.inject defaults remoteAddress to 127.0.0.1.
    const res = await setup()
    expect(res.statusCode).toBe(201)
    expect(JSON.parse(res.payload).token).toBeTruthy()
  })

  it('allows a remote setup that carries the configured bootstrap token', async () => {
    fastify = await boot(dir, BOOTSTRAP)
    const withToken = await setup({ remoteAddress: REMOTE, token: BOOTSTRAP })
    expect(withToken.statusCode).toBe(201)
  })

  it('still refuses a remote setup with a wrong/absent token when one is configured', async () => {
    fastify = await boot(dir, BOOTSTRAP)
    const wrong = await setup({ remoteAddress: REMOTE, token: 'nope' })
    expect(wrong.statusCode).toBe(401)
    const absent = await setup({ remoteAddress: REMOTE })
    expect(absent.statusCode).toBe(401)
  })
})
