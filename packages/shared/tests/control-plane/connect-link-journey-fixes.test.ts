/**
 * Three Connect Link contracts:
 *
 *  1. `rate_limit.connect_link.per_minute` — the brute-force guard the
 *     settings page describes is consumed on the public /connect surface.
 *  2. `connect_link.default_expiry_hours` / `connect_link.one_time_default` —
 *     the admin form's defaults come from these settings.
 *  3. `redirectUrl` — honoured on the credential-form branch as well as the
 *     OAuth callback, so non-OAuth adapters also return the customer to the
 *     developer's app.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import { openDb } from '../../src/db'
import type { DbHandle } from '../../src/db'
import { ConnectSessionStore } from '../../src/auth/connect-sessions'
import { EndUserStore } from '../../src/auth/end-users'
import { CredentialStore } from '../../src/auth/store'
import { ApiKeyStore } from '../../src/auth/api-keys'
import { createConnectRouter } from '../../src/control-plane/connect-router'
import { createConnectAdminRouter } from '../../src/control-plane/connect-admin-router'
import { createCustomersRouter } from '../../src/control-plane/customers-router'
import { resetRateLimitBuckets } from '../../src/control-plane/rate-limit'
import type { HostBranding } from '../../src/control-plane/host-info'

const SECRET = 'connect-journey-fixes-secret-must-be-32c'

function hostBranding(): HostBranding {
  return {
    name: null,
    logoDataUrl: null,
    primaryColor: null,
    secondaryColor: null,
    fontFamily: null,
    fontDataUrl: null,
    fontUrl: null,
    faviconDataUrl: null,
    hideAttribution: false,
    supportEmail: null,
    privacyPolicyUrl: null,
    termsOfServiceUrl: null,
    baseUrl: null,
  }
}

const hostInfo = { get: async () => hostBranding() } as never

/** An api_key adapter that accepts anything — the non-OAuth catalog shape. */
const fakeAdapter = {
  credentialFields: () => [{ name: 'apiKey', label: 'API key', type: 'password' }],
  exchangeCredentials: async () => ({ accessToken: 'exchanged' }),
}

const PLATFORMS = [
  { vertical: 'accounting', slug: 'fake', name: 'Fake Books', auth_type: 'api_key' },
] as never

describe('public /connect surface rate limit', () => {
  let handle: DbHandle
  let fastify: FastifyInstance

  beforeEach(async () => {
    resetRateLimitBuckets()
    handle = await openDb({ sqlitePath: ':memory:' })
    const sessions = await ConnectSessionStore.create(handle)
    const endUsers = await EndUserStore.create(handle, SECRET)
    const credentials = await CredentialStore.create(handle, SECRET)
    fastify = Fastify({ logger: false })
    await fastify.register(
      createConnectRouter({
        store: credentials,
        registry: { get: () => fakeAdapter } as never,
        sessions,
        endUsers,
        hostInfo,
        platforms: PLATFORMS,
        rateLimit: { max: 2, windowMs: 60_000 },
      }),
    )
    await fastify.ready()
  })
  afterEach(async () => {
    await fastify?.close()
    await handle?.close()
  })

  it('429s the landing page after the budget, as HTML with Retry-After', async () => {
    const first = await fastify.inject({ method: 'GET', url: '/connect/nope' })
    expect(first.statusCode).toBe(404) // token is junk, but the request counted
    const second = await fastify.inject({ method: 'GET', url: '/connect/nope' })
    expect(second.statusCode).toBe(404)

    const third = await fastify.inject({ method: 'GET', url: '/connect/nope' })
    expect(third.statusCode).toBe(429)
    expect(third.headers['retry-after']).toBeDefined()
    // A browser opened this — answer with the branded error page, not JSON.
    expect(third.headers['content-type']).toContain('text/html')
    expect(third.body).toContain('Too many requests')
  })

  it('shares one IP-keyed budget across tokens — guessing does not reset it', async () => {
    await fastify.inject({ method: 'GET', url: '/connect/guess-one' })
    await fastify.inject({ method: 'GET', url: '/connect/guess-two' })
    const res = await fastify.inject({ method: 'GET', url: '/connect/guess-three' })
    expect(res.statusCode).toBe(429)
  })

  it('answers JSON on the API routes', async () => {
    await fastify.inject({ method: 'GET', url: '/connect/a' })
    await fastify.inject({ method: 'GET', url: '/connect/b' })
    const res = await fastify.inject({
      method: 'POST',
      url: '/connect/sessions/junk/oauth-start',
      payload: {},
    })
    expect(res.statusCode).toBe(429)
    expect(res.json().error.code).toBe('RATE_LIMITED')
  })
})

describe('deployment defaults for newly minted links', () => {
  let handle: DbHandle
  let fastify: FastifyInstance
  let sessions: ConnectSessionStore

  beforeEach(async () => {
    resetRateLimitBuckets()
    handle = await openDb({ sqlitePath: ':memory:' })
    sessions = await ConnectSessionStore.create(handle)
    const endUsers = await EndUserStore.create(handle, SECRET)
    fastify = Fastify({ logger: false })
    await fastify.register(
      createConnectAdminRouter({
        store: {} as never,
        endUsers,
        sessions,
        linkDefaults: () => ({ expiryHours: 5, oneTimeDefault: true }),
      }),
    )
    await fastify.ready()
  })
  afterEach(async () => {
    await fastify?.close()
    await handle?.close()
  })

  it('applies expiry and one-time defaults when the mint omits them', async () => {
    const before = Date.now()
    const res = await fastify.inject({
      method: 'POST',
      url: '/admin/connect-sessions',
      payload: { tenantId: 'default', label: 'defaults test' },
    })
    expect(res.statusCode).toBe(201)
    const row = res.json().data
    expect(row.oneTimeOnly).toBe(true)
    const fiveHours = 5 * 3_600_000
    expect(row.expiresAt).toBeGreaterThanOrEqual(before + fiveHours - 5_000)
    expect(row.expiresAt).toBeLessThanOrEqual(Date.now() + fiveHours + 5_000)
  })

  it('explicit values always win over the defaults', async () => {
    const explicit = Date.now() + 60_000
    const res = await fastify.inject({
      method: 'POST',
      url: '/admin/connect-sessions',
      payload: {
        tenantId: 'default',
        label: 'explicit test',
        expiresAt: explicit,
        oneTimeOnly: false,
      },
    })
    expect(res.statusCode).toBe(201)
    const row = res.json().data
    expect(row.expiresAt).toBe(explicit)
    expect(row.oneTimeOnly).toBe(false)
  })

  it('applies the same defaults on the developer mint path', async () => {
    const apiKeys = await ApiKeyStore.create(handle, SECRET)
    const endUsers = await EndUserStore.create(handle, SECRET)
    const credentials = await CredentialStore.create(handle, SECRET)
    const dev = Fastify({ logger: false })
    await dev.register(
      createCustomersRouter({
        apiKeys,
        endUsers,
        sessions,
        credentials,
        linkDefaults: () => ({ expiryHours: 5, oneTimeDefault: true }),
      }),
    )
    await dev.ready()
    try {
      const key = await apiKeys.mint({ tenantId: 't', scopes: ['*'] })
      const customer = await endUsers.create({ tenantId: 't', email: 'c@x.example' })
      const before = Date.now()
      const res = await dev.inject({
        method: 'POST',
        url: `/v1/customers/${customer.id}/connect-links`,
        headers: { authorization: `Bearer ${key.plaintext}` },
        payload: {},
      })
      expect(res.statusCode).toBe(201)
      const link = res.json().data
      expect(link.oneTimeOnly).toBe(true)
      const fiveHours = 5 * 3_600_000
      expect(new Date(link.expiresAt).getTime()).toBeGreaterThanOrEqual(
        before + fiveHours - 5_000,
      )
    } finally {
      await dev.close()
    }
  })
})

describe('credential-form flow honours redirectUrl', () => {
  let handle: DbHandle
  let fastify: FastifyInstance
  let sessions: ConnectSessionStore

  beforeEach(async () => {
    resetRateLimitBuckets()
    handle = await openDb({ sqlitePath: ':memory:' })
    sessions = await ConnectSessionStore.create(handle)
    const endUsers = await EndUserStore.create(handle, SECRET)
    const credentials = await CredentialStore.create(handle, SECRET)
    fastify = Fastify({ logger: false })
    await fastify.register(
      createConnectRouter({
        store: credentials,
        registry: { get: () => fakeAdapter } as never,
        sessions,
        endUsers,
        hostInfo,
        platforms: PLATFORMS,
      }),
    )
    await fastify.ready()
  })
  afterEach(async () => {
    await fastify?.close()
    await handle?.close()
  })

  const submit = (token: string) =>
    fastify.inject({
      method: 'POST',
      url: `/connect/sessions/${token}/credentials`,
      payload: { vertical: 'accounting', platform: 'fake', fields: { apiKey: 'k' } },
    })

  it("returns the developer's redirectUrl when the link has one", async () => {
    const session = await sessions.create({
      tenantId: 't',
      label: 'with redirect',
      redirectUrl: 'https://app.example/integrations/done',
    })
    const res = await submit(session.token)
    expect(res.statusCode).toBe(201)
    expect(res.json().data.redirect).toBe('https://app.example/integrations/done')
    expect(res.json().data.connectionId).toBeDefined()
  })

  it('falls back to the hosted thank-you page otherwise', async () => {
    const session = await sessions.create({ tenantId: 't', label: 'no redirect' })
    const res = await submit(session.token)
    expect(res.statusCode).toBe(201)
    expect(res.json().data.redirect).toBe(`/connect/${session.token}/done`)
  })
})
