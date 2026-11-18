/**
 * Refusing to switch off the only credential anybody can get in with.
 *
 * `auth.dev_api_keys_enabled = false` is the developer-API twin of disabling
 * local login, and it has the same failure mode: do it against an OIDC setup
 * that does not work and every developer is locked out of a running
 * deployment, with `X-Admin-Secret` the only way back.
 *
 * The local-login setting can only *advise* "once an SSO provider is verified
 * working", because admin-api cannot check it. This one it can — the issuer
 * rows live in the integration-server, which reports whether OAuth could
 * actually admit anybody — so the advice is enforced instead of printed.
 *
 * Deliberately fails closed on an unreachable integration-server: refusing a
 * disable that would have been fine is an inconvenience, allowing one that
 * locks everybody out is an outage.
 */
import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import jwt from '@fastify/jwt'
import { openDb } from '@opensteward/shared'
import { AdminStore } from '../../src/core/db/admin-store'
import { IdentityStore } from '../../src/core/db/identity-store'
import { requireAuth, requireRole } from '../../src/core/auth/jwt-auth'
import { registerOpenApiBridge } from '../../src/core/openapi-setup'
import { isoifyTimestamps, enrichErrorBody } from '../../src/core/routes/_openapi'
import { createAuthRoutes } from '../../src/core/routes/auth'
import { createRuntimeSettingsRoutes } from '../../src/core/routes/runtime-settings'
import { UnifiedClient } from '../../src/core/proxy/client'
import { RuntimeSettingsStore } from '../../src/core/db/runtime-settings-store'

const API_KEYS = 'auth.dev_api_keys_enabled'
const OAUTH = 'auth.dev_oauth_enabled'

type Readiness = { ready: boolean; reason: string }

let fastify: FastifyInstance
let adminStore: AdminStore
let runtimeSettings: RuntimeSettingsStore
/** Null makes the stub throw, standing in for an unreachable service. */
let readiness: Readiness | null

beforeEach(async () => {
  const handle = await openDb({ sqlitePath: ':memory:' })
  adminStore = await AdminStore.create(handle)
  const identityStore = await IdentityStore.create(
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

  readiness = { ready: true, reason: 'Local IdP is configured and has verified a token.' }
  const client = new UnifiedClient({ url: 'http://127.0.0.1:1' })
  ;(client as unknown as { getOAuthReadiness: () => Promise<Readiness> }).getOAuthReadiness =
    async () => {
      if (!readiness) throw new Error('connect ECONNREFUSED 127.0.0.1:3010')
      return readiness
    }

  await fastify.register(createAuthRoutes(adminStore, runtimeSettings))
  await fastify.register(
    createRuntimeSettingsRoutes(adminStore, client, identityStore, runtimeSettings),
  )
  await fastify.ready()
})

afterEach(async () => {
  await fastify?.close()
  await adminStore?.close()
})

async function adminToken(): Promise<string> {
  const res = await fastify.inject({
    method: 'POST',
    url: '/api/auth/setup',
    payload: { username: 'admin', password: 'SecurePass123!' },
  })
  return JSON.parse(res.payload).token
}

const patch = (token: string, key: string, value: unknown) =>
  fastify.inject({
    method: 'PATCH',
    url: `/api/runtime-settings/${key}`,
    headers: { authorization: `Bearer ${token}` },
    payload: { key, value },
  })

describe('disabling API keys', () => {
  it('is refused while OAuth is switched off', async () => {
    const token = await adminToken()
    const res = await patch(token, API_KEYS, false)
    expect(res.statusCode).toBe(409)
    const body = JSON.parse(res.payload)
    expect(body.error.code).toBe('AUTH_LOCKOUT_REFUSED')
    expect(body.error.message).toContain('auth.dev_oauth_enabled')
    // And nothing was written.
    expect((await runtimeSettings.get(API_KEYS))?.value).toBe(true)
  })

  it('is refused when OAuth is on but could not admit anybody', async () => {
    const token = await adminToken()
    await patch(token, OAUTH, true)
    readiness = { ready: false, reason: 'Local IdP has never verified a token.' }

    const res = await patch(token, API_KEYS, false)
    expect(res.statusCode).toBe(409)
    const body = JSON.parse(res.payload)
    expect(body.error.code).toBe('AUTH_LOCKOUT_REFUSED')
    // The operator is told which of the several reasons applies.
    expect(body.error.message).toContain('never verified a token')
    expect((await runtimeSettings.get(API_KEYS))?.value).toBe(true)
  })

  it('is refused when the integration-server cannot be reached', async () => {
    // Unproven is not proven. Failing open here would let a network blip
    // become a lockout.
    const token = await adminToken()
    await patch(token, OAUTH, true)
    readiness = null

    const res = await patch(token, API_KEYS, false)
    expect(res.statusCode).toBe(409)
    expect(JSON.parse(res.payload).error.code).toBe('AUTH_LOCKOUT_REFUSED')
    expect((await runtimeSettings.get(API_KEYS))?.value).toBe(true)
  })

  it('goes through once OAuth is on and verified working', async () => {
    const token = await adminToken()
    await patch(token, OAUTH, true)

    const res = await patch(token, API_KEYS, false)
    expect(res.statusCode).toBe(200)
    expect((await runtimeSettings.get(API_KEYS))?.value).toBe(false)
  })
})

describe('what the guard does not touch', () => {
  it('never blocks turning API keys back on', async () => {
    const token = await adminToken()
    await patch(token, OAUTH, true)
    await patch(token, API_KEYS, false)
    readiness = { ready: false, reason: 'Local IdP has no registered clients.' }

    // Re-enabling is the recovery move. It must work even when OAuth has
    // since broken — that is exactly when an operator needs it.
    const res = await patch(token, API_KEYS, true)
    expect(res.statusCode).toBe(200)
    expect((await runtimeSettings.get(API_KEYS))?.value).toBe(true)
  })

  it('never blocks disabling OAuth itself', async () => {
    // Turning off the newer credential cannot lock anybody out while keys
    // are still on, so it carries no guard.
    const token = await adminToken()
    await patch(token, OAUTH, true)
    const res = await patch(token, OAUTH, false)
    expect(res.statusCode).toBe(200)
  })

  it('leaves the local-login break-glass guard alone', async () => {
    const token = await adminToken()
    // The first-run admin is a password-usable local admin, so this passes
    // its own guard — proving the dev-keys guard does not swallow the
    // local-login guard.
    const res = await patch(token, 'auth.local_login_enabled', false)
    expect(res.statusCode).toBe(200)
  })
})
