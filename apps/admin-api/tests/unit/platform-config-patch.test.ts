/**
 * PUT /api/verticals/:vertical/platforms/:slug/config accepts a PATCH, not a
 * full config.
 *
 * The route forwards to integration-server's `registry.setConfig()`, which
 * merges: keys the caller omits keep their stored value, `null` clears a key.
 * That merge is what lets the admin UI re-save a platform without re-typing
 * the client secret.
 *
 * The body schema must model that: a patch, not the full discriminated
 * `PlatformConfig`. Requiring `authType` plus every field of the matching
 * branch would reject the admin UI (which sends `{clientId, clientSecret,
 * redirectUri, scopes}` and has no reason to know `authType`) at the Fastify
 * boundary:
 *
 *   400 config.authType: Invalid discriminator value.
 *       Expected 'oauth2' | 'oauth2_cc' | 'api_key' | 'basic' | 'session'
 *
 * — failing every credential save through the admin UI, the setup wizard's
 * step 4 and the standalone platform page alike.
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

const CONFIG_URL = '/api/verticals/accounting/platforms/fortnox/config'

describe('PUT platform config — partial bodies', () => {
  let dir: string
  let fastify: FastifyInstance
  let adminStore: AdminStore
  let forwarded: Record<string, unknown> | null

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'admin-api-platform-config-'))
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

    // Capture what crosses the boundary to integration-server instead of
    // opening a socket: the assertion is about the body surviving validation
    // intact, not about the HTTP hop.
    forwarded = null
    const client = new UnifiedClient({ url: 'http://127.0.0.1:1' })
    ;(client as unknown as Record<string, unknown>).setPlatformConfig = async (
      _vertical: string,
      _slug: string,
      config: Record<string, unknown>,
    ) => {
      forwarded = config
    }
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

  async function put(payload: unknown) {
    const token = await adminToken()
    return fastify.inject({
      method: 'PUT',
      url: CONFIG_URL,
      headers: { authorization: `Bearer ${token}` },
      payload: payload as Record<string, unknown>,
    })
  }

  it('accepts the admin UI body, which carries no authType', async () => {
    // Byte-for-byte the body the wizard sent when it 400'd.
    const config = {
      clientId: 'LMTc1IGwN7Hz',
      redirectUri: 'http://localhost:3010/auth/accounting/fortnox/callback',
      clientSecret: 'not-a-real-secret',
      scopes: ['companyinformation', 'invoice.read', 'customer.read'],
    }
    const res = await put({ config })
    expect(res.statusCode).toBe(200)
    expect(forwarded).toEqual(config)
  })

  it('accepts a re-save that omits clientSecret to keep the stored one', async () => {
    const res = await put({ config: { clientId: 'abc', scopes: ['invoice.read'] } })
    expect(res.statusCode).toBe(200)
    expect(forwarded).toEqual({ clientId: 'abc', scopes: ['invoice.read'] })
  })

  it('forwards adapter-specific keys the schema does not name', async () => {
    // 1,545 adapters carry config keys beyond the OAuth2 four (subdomain,
    // companyId, apiUrl…). Validation must not silently strip them.
    const res = await put({ config: { subdomain: 'acme', companyId: 42 } })
    expect(res.statusCode).toBe(200)
    expect(forwarded).toEqual({ subdomain: 'acme', companyId: 42 })
  })

  it('forwards null, the documented "clear this key" signal', async () => {
    const res = await put({ config: { redirectUri: null } })
    expect(res.statusCode).toBe(200)
    expect(forwarded).toEqual({ redirectUri: null })
  })

  it('accepts an authType-tagged body from an existing API caller', async () => {
    const res = await put({
      config: { authType: 'oauth2', clientId: 'abc', clientSecret: 'shh' },
    })
    expect(res.statusCode).toBe(200)
  })

  it('clears an authType a previous caller stored', async () => {
    // A stored authType counts toward `hasConfig`, so it has to be clearable
    // like every other key — nullable, not merely optional.
    const res = await put({ config: { authType: null } })
    expect(res.statusCode).toBe(200)
    expect(forwarded).toEqual({ authType: null })
  })

  it('still rejects a body with no config object', async () => {
    const res = await put({})
    expect(res.statusCode).toBe(400)
  })

  it('still rejects a config that is not an object', async () => {
    const res = await put({ config: 'clientId=abc' })
    expect(res.statusCode).toBe(400)
  })
})
