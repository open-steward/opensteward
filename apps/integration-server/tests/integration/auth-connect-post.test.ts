/**
 * `POST /auth/{vertical}/{platform}/connect` — headless connect for adapters
 * that take a static credential rather than an OAuth redirect.
 *
 * These cases pin the parts that are easy to get wrong or quietly weaken:
 * the admin gate, the field contract, and that a credential really is stored
 * and readable back as a connection.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest'
import { buildTestServer, type TestServer } from './helpers'

// A single-field api-key adapter, so the `api_key` shorthand is exercised too.
const VERTICAL = 'logistics'
const PLATFORM = 'janio'
const PATH = `/auth/${VERTICAL}/${PLATFORM}/connect`

describe('POST /auth/{vertical}/{platform}/connect', () => {
  let server: TestServer
  let fieldName: string

  beforeAll(async () => {
    server = await buildTestServer()
    // `enable` is typed as sync but resolves an adapter; await it or every
    // property below reads off a Promise.
    const adapter = (await (server.registry.enable(VERTICAL, PLATFORM) as never)) as {
      credentialFields(): Array<{ name: string }>
    }
    fieldName = adapter.credentialFields()[0]!.name
  }, 60_000)

  afterAll(async () => {
    await server?.cleanup()
    delete process.env['ADMIN_SECRET']
  })

  const post = (payload: Record<string, unknown>, headers: Record<string, string> = {}) =>
    server.fastify.inject({ method: 'POST', url: PATH, payload, headers })

  it('stores the credential and returns a connection that reads back', async () => {
    const res = await post({ fields: { [fieldName]: 'key-live-abc' }, label: 'Janio prod' })
    expect(res.statusCode).toBe(200)
    const { data } = res.json() as {
      data: { id: string; platform: string; tenantId: string | null; label: string; status: string }
    }
    expect(data.platform).toBe(PLATFORM)
    expect(data.status).toBe('connected')
    expect(data.label).toBe('Janio prod')

    // The point of the route: a usable connection, with the credential
    // actually persisted rather than a plausible-looking response.
    const stored = await server.store.loadById(data.id)
    expect(stored).toBeTruthy()
    expect(stored!.accessToken).toBe('key-live-abc')
  })

  it('accepts `api_key` as shorthand for a single-field adapter', async () => {
    const res = await post({ api_key: 'key-live-shorthand', label: 'Janio shorthand' })
    expect(res.statusCode).toBe(200)
    const id = (res.json() as { data: { id: string } }).data.id
    expect((await server.store.loadById(id))!.accessToken).toBe('key-live-shorthand')
  })

  it('carries tenant_id through to the stored connection', async () => {
    const res = await post({ api_key: 'k', tenant_id: 'acme', label: 'Janio acme' })
    expect(res.statusCode).toBe(200)
    expect((res.json() as { data: { tenantId: string } }).data.tenantId).toBe('acme')
  })

  it('names the missing fields rather than failing opaquely', async () => {
    const res = await post({ fields: {} })
    expect(res.statusCode).toBe(400)
    const body = res.json() as { error: { code: string; fields: Array<{ name: string }> } }
    expect(body.error.code).toBe('MISSING_FIELDS')
    expect(body.error.fields.map((f) => f.name)).toContain(fieldName)
  })

  it('404s an adapter with no static-credential flow', async () => {
    // Not enabled in this registry, so it cannot be connected either way.
    const res = await server.fastify.inject({
      method: 'POST',
      url: `/${'auth'}/${VERTICAL}/definitely-not-an-adapter/connect`,
      payload: { api_key: 'k' },
    })
    expect(res.statusCode).toBe(404)
    expect((res.json() as { error: { code: string } }).error.code).toBe('ADAPTER_UNAVAILABLE')
  })

  it('409s a duplicate label', async () => {
    const label = 'Janio duplicate'
    expect((await post({ api_key: 'k1', label })).statusCode).toBe(200)
    const second = await post({ api_key: 'k2', label })
    expect(second.statusCode).toBe(409)
    expect((second.json() as { error: { code: string } }).error.code).toBe('DUPLICATE_LABEL')
  })

  describe('a tenant dev key is the other way in', () => {
    const withKey = async (key: string, payload: Record<string, unknown>) =>
      server.fastify.inject({
        method: 'POST',
        url: PATH,
        payload,
        headers: { authorization: `Bearer ${key}` },
      })

    it("accepts connections:write and stores under the key's own tenant", async () => {
      const key = await server.apiKeys.mint({
        tenantId: 'acme',
        scopes: ['connections:write'],
        mode: 'live',
      })
      const res = await withKey(key.plaintext, { api_key: 'k', label: 'tenant key' })
      expect(res.statusCode).toBe(200)
      expect((res.json() as { data: { tenantId: string } }).data.tenantId).toBe('acme')
    })

    it('IGNORES a tenant_id in the body — the key decides, not the caller', async () => {
      // The whole reason a tenant key is allowed here. If the body could set
      // this, any tenant key could mint connections owned by another tenant.
      const key = await server.apiKeys.mint({
        tenantId: 'acme',
        scopes: ['connections:write'],
        mode: 'live',
      })
      const res = await withKey(key.plaintext, {
        api_key: 'k',
        tenant_id: 'victim',
        label: 'body tenant ignored',
      })
      expect(res.statusCode).toBe(200)
      expect((res.json() as { data: { tenantId: string } }).data.tenantId).toBe('acme')
    })

    it('refuses a key without connections:write', async () => {
      const key = await server.apiKeys.mint({
        tenantId: 'acme',
        scopes: ['connections:read'],
        mode: 'live',
      })
      const res = await withKey(key.plaintext, { api_key: 'k', label: 'read only' })
      expect(res.statusCode).toBe(403)
      expect((res.json() as { error: { code: string } }).error.code).toBe('INSUFFICIENT_SCOPE')
    })

    it('refuses a sandbox key — this writes a real credential', async () => {
      const key = await server.apiKeys.mint({
        tenantId: 'acme',
        scopes: ['*'],
        mode: 'test',
      })
      const res = await withKey(key.plaintext, { api_key: 'k', label: 'test key' })
      expect(res.statusCode).toBe(403)
    })

    it('refuses a bearer token that is not a key at all', async () => {
      const res = await withKey('osk_not_a_real_key', { api_key: 'k', label: 'bogus' })
      expect(res.statusCode).toBe(401)
    })
  })

  it('refuses to write a credential without the admin secret', async () => {
    // The route takes `tenant_id` from the request, so it reaches across
    // tenants. Unauthenticated, anyone reachable could mint a connection
    // owned by any tenant and have that tenant's traffic flow through an
    // upstream account they control. This assertion pins that the route is
    // never unauthenticated.
    process.env['ADMIN_SECRET'] = 'super-secret'
    try {
      const denied = await post({ api_key: 'k', tenant_id: 'victim', label: 'no secret' })
      expect(denied.statusCode).toBe(403)

      const wrong = await post(
        { api_key: 'k', label: 'wrong secret' },
        { 'x-admin-secret': 'not-it' },
      )
      expect(wrong.statusCode).toBe(403)

      const allowed = await post(
        { api_key: 'k', label: 'right secret' },
        { 'x-admin-secret': 'super-secret' },
      )
      expect(allowed.statusCode).toBe(200)
    } finally {
      delete process.env['ADMIN_SECRET']
    }
  })
  describe('an OAuth platform that also takes a static secret key', () => {
    // Stripe is `auth_type: oauth2` (Connect), but every Stripe test-mode
    // account is reached with a fixed `sk_test_…` key — there is no OAuth
    // ceremony for your own account. The route gates on `exchangeCredentials`
    // alone, never on `auth_type`, so a hybrid adapter gets both ways in.
    const STRIPE_PATH = '/auth/payments/stripe/connect'

    // beforeEach, not beforeAll: the ownership test below disables stripe, so
    // with a shared setup every test after it (under `--sequence.shuffle`,
    // seed 4242, the key-path test) found no adapter and got a 404.
    beforeEach(async () => {
      const adapter = (await (server.registry.enable('payments', 'stripe', {
        clientId: 'ca_test_client',
        clientSecret: 'sk_test_platform_secret',
        redirectUri: 'http://localhost:3010/auth/payments/stripe/callback',
      }) as never)) as { registerWebhook: (...args: unknown[]) => Promise<unknown> }
      // The route auto-registers a webhook after storing the credential; the
      // real implementation would dial api.stripe.com. Stub it — and return a
      // secret, so the test also pins that the key path persists it.
      vi.spyOn(adapter, 'registerWebhook').mockResolvedValue({
        id: 'we_test',
        secret: 'whsec_test',
      })
    })

    it('stores an sk_test_ key as the bearer credential instead of 404ing', async () => {
      const res = await server.fastify.inject({
        method: 'POST',
        url: STRIPE_PATH,
        payload: { api_key: 'sk_test_51deadbeef', label: 'Stripe test mode' },
      })
      expect(res.statusCode).toBe(200)
      const { data } = res.json() as { data: { id: string; platform: string; status: string } }
      expect(data.platform).toBe('stripe')
      expect(data.status).toBe('connected')
      const stored = (await server.store.loadById(data.id))!
      expect(stored.accessToken).toBe('sk_test_51deadbeef')
      expect(stored.webhookSecret).toBe('whsec_test')
    })

    it("is usable with the owning tenant's own developer key, and no other", async () => {
      // No Connect Link session is written on this path, so ownership has to
      // come from the row itself. Before this was recorded, the tenant a
      // headless connection was minted for could not use it — every /v1
      // request with its key answered CONNECTION_FORBIDDEN, and only the
      // admin secret worked.
      const key = await server.apiKeys.mint({
        tenantId: 'acme',
        scopes: ['connections:write', 'vertical:payments'],
      })
      const minted = await server.fastify.inject({
        method: 'POST',
        url: STRIPE_PATH,
        payload: { api_key: 'sk_test_owned', label: 'Stripe owned by acme' },
        headers: { authorization: `Bearer ${key.plaintext}` },
      })
      expect(minted.statusCode).toBe(200)
      const id = (minted.json() as { data: { id: string } }).data.id
      expect((await server.store.getRow(id))!.ownerTenantId).toBe('acme')

      // Disable the adapter so the resource route stops at ADAPTER_UNAVAILABLE
      // — after auth and ownership, before any call to Stripe. A 404 here is
      // the proof that ownership passed; a 403 is the old refusal.
      await server.registry.disable('payments', 'stripe')
      const own = await server.fastify.inject({
        method: 'GET',
        url: `/v1/payments/customers?connection_id=${id}`,
        headers: { authorization: `Bearer ${key.plaintext}` },
      })
      expect(own.statusCode).toBe(404)
      expect((own.json() as { error: { code: string } }).error.code).toBe('ADAPTER_UNAVAILABLE')

      const other = await server.apiKeys.mint({ tenantId: 'victim', scopes: ['vertical:payments'] })
      const theirs = await server.fastify.inject({
        method: 'GET',
        url: `/v1/payments/customers?connection_id=${id}`,
        headers: { authorization: `Bearer ${other.plaintext}` },
      })
      expect(theirs.statusCode).toBe(403)
      expect((theirs.json() as { error: { code: string } }).error.code).toBe('CONNECTION_FORBIDDEN')
    })
  })
})
