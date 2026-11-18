/**
 * User-journey regression tests for the integration-server (the core unified API).
 *
 * Each `describe` is a story told from the point of view of a real persona —
 * an operator, a developer holding an API key, or an end-customer following a
 * Connect Link — and every `it` is a step in that story asserting the platform
 * behaves the way the persona expects. If new development quietly removes one of
 * these behaviours, the named journey goes red and says which promise broke.
 *
 * In-process: each test boots a throwaway Fastify server via buildTestServer()
 * and drives it with fastify.inject(). No Docker, no network.
 */
import { createHmac } from 'node:crypto'
import type { LightMyRequestResponse } from 'fastify'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { buildTestServer, seedConnection, type TestServer } from '../integration/helpers'
import { READ_SCOPES } from '../../src/verticals/accounting/platforms/read-scopes.generated'
import {
  setRateLimiter,
  inMemoryLimiter,
  type RateLimiter,
  type RateLimitConfig,
} from '@opensteward/shared'

let server: TestServer

afterEach(async () => {
  await server?.cleanup()
  vi.restoreAllMocks()
})

/** Enable an adapter for the test deployment so the registry can resolve it. */
async function enableBexio(scopes: string[] = ['openid']): Promise<void> {
  const res = await server.fastify.inject({
    method: 'POST',
    url: '/admin/platforms/accounting/bexio/enable',
    payload: {
      config: {
        clientId: 'acc-client-id',
        clientSecret: 'acc-secret',
        redirectUri: 'http://localhost/cb',
        scopes,
      },
    },
  })
  expect(res.statusCode).toBe(200)
}

/** Pull the CSRF `state` token out of an upstream authorize URL. */
function stateOf(authorizeUrl: string): string {
  const s = new URL(authorizeUrl).searchParams.get('state')
  expect(s).toBeTruthy()
  return s as string
}

// ───────────────────────────────────────────────────────────────────────────
describe('Journey: An operator connects a customer to an accounting platform via OAuth', () => {
  beforeEach(async () => {
    server = await buildTestServer()
  })

  it('the operator enables the platform for their deployment', async () => {
    const res = await server.fastify.inject({
      method: 'POST',
      url: '/admin/platforms/accounting/bexio/enable',
      payload: {
        config: {
          clientId: 'acc-client-id',
          clientSecret: 'acc-secret',
          redirectUri: 'http://localhost/cb',
          scopes: ['openid'],
        },
      },
    })
    expect(res.statusCode).toBe(200)

    const list = await server.fastify.inject({
      method: 'GET',
      url: '/admin/platforms?vertical=accounting',
    })
    const rows = list.json().data as Array<{ slug: string; enabled: boolean }>
    expect(rows.find((r) => r.slug === 'bexio')?.enabled).toBe(true)
  })

  it('starting the OAuth flow redirects the customer to the platform with the right client_id', async () => {
    await server.fastify.inject({
      method: 'POST',
      url: '/admin/platforms/accounting/bexio/enable',
      payload: {
        config: {
          clientId: 'acc-client-id',
          clientSecret: 'acc-secret',
          redirectUri: 'http://localhost/cb',
          scopes: ['openid'],
        },
      },
    })

    const res = await server.fastify.inject({
      method: 'GET',
      url: '/auth/accounting/bexio/connect?tenant_id=acme',
    })
    expect(res.statusCode).toBe(302)
    const location = res.headers.location as string
    // The redirect must point at the upstream authorize endpoint carrying our
    // client_id and a CSRF state token — losing either breaks every OAuth login.
    expect(location).toContain('client_id=acc-client-id')
    expect(location).toContain('state=')
  })
})

// ───────────────────────────────────────────────────────────────────────────
describe("Journey: A developer's API key only reaches resources within its granted scopes and tenant", () => {
  beforeEach(async () => {
    server = await buildTestServer()
  })

  async function mintKey(tenantId: string, scopes: string[]): Promise<string> {
    const res = await server.fastify.inject({
      method: 'POST',
      url: '/admin/api-keys',
      payload: { tenantId, scopes },
    })
    expect(res.statusCode).toBe(201)
    const plaintext = res.json().data.plaintext as string
    expect(plaintext).toMatch(/^osk_/)
    return plaintext
  }

  it('a key with customers scopes can create and read its own customers', async () => {
    const key = await mintKey('tenant-a', ['customers:read', 'customers:write'])

    const created = await server.fastify.inject({
      method: 'POST',
      url: '/v1/customers',
      headers: { authorization: `Bearer ${key}` },
      payload: { email: 'jane@acme.test', displayName: 'Jane' },
    })
    expect(created.statusCode).toBe(201)

    const list = await server.fastify.inject({
      method: 'GET',
      url: '/v1/customers',
      headers: { authorization: `Bearer ${key}` },
    })
    expect(list.statusCode).toBe(200)
    const emails = (list.json().data as Array<{ email: string }>).map((c) => c.email)
    expect(emails).toContain('jane@acme.test')
  })

  it('a key missing the required scope is refused with INSUFFICIENT_SCOPE', async () => {
    const key = await mintKey('tenant-a', ['connections:read']) // no customers:read

    const res = await server.fastify.inject({
      method: 'GET',
      url: '/v1/customers',
      headers: { authorization: `Bearer ${key}` },
    })
    expect(res.statusCode).toBe(403)
    expect(res.json().error.code).toBe('INSUFFICIENT_SCOPE')
  })

  it('a request with no bearer token is rejected, never served', async () => {
    const res = await server.fastify.inject({ method: 'GET', url: '/v1/customers' })
    expect(res.statusCode).toBeGreaterThanOrEqual(400)
    expect(res.statusCode).toBeLessThan(500)
  })

  it("one tenant's key never sees another tenant's customers", async () => {
    const keyA = await mintKey('tenant-a', ['customers:read', 'customers:write'])
    await server.fastify.inject({
      method: 'POST',
      url: '/v1/customers',
      headers: { authorization: `Bearer ${keyA}` },
      payload: { email: 'secret@tenant-a.test' },
    })

    const keyB = await mintKey('tenant-b', ['customers:read'])
    const list = await server.fastify.inject({
      method: 'GET',
      url: '/v1/customers',
      headers: { authorization: `Bearer ${keyB}` },
    })
    expect(list.statusCode).toBe(200)
    const emails = (list.json().data as Array<{ email: string }>).map((c) => c.email)
    expect(emails).not.toContain('secret@tenant-a.test')
  })
})

// ───────────────────────────────────────────────────────────────────────────
describe('Journey: An operator mints a hosted Connect Link and a customer opens it', () => {
  beforeEach(async () => {
    server = await buildTestServer()
  })

  async function mintLink(): Promise<{ id: string; token: string }> {
    const res = await server.fastify.inject({
      method: 'POST',
      url: '/admin/connect-sessions',
      payload: {
        tenantId: 'tenant-a',
        label: 'Onboard Acme',
        allowedVerticals: ['accounting'],
      },
    })
    expect(res.statusCode).toBe(201)
    const data = res.json().data as { id: string; token: string }
    expect(data.token).toBeTruthy()
    return data
  }

  it('the customer can fetch the live session metadata for the link', async () => {
    const { token } = await mintLink()
    const res = await server.fastify.inject({
      method: 'GET',
      url: `/connect/sessions/${token}`,
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().data.label).toBe('Onboard Acme')
    expect(res.json().data.allowedVerticals).toEqual(['accounting'])
  })

  it('once the operator revokes the link, the customer can no longer use it', async () => {
    const { id, token } = await mintLink()
    const del = await server.fastify.inject({
      method: 'DELETE',
      url: `/admin/connect-sessions/${id}`,
    })
    expect(del.statusCode).toBe(204)

    const after = await server.fastify.inject({
      method: 'GET',
      url: `/connect/sessions/${token}`,
    })
    // Revoked link is gone for the customer — 404 (deleted) or 410 (final state).
    expect([404, 410]).toContain(after.statusCode)
  })

  it('an unknown link token is never treated as valid', async () => {
    const res = await server.fastify.inject({
      method: 'GET',
      url: '/connect/sessions/not-a-real-token',
    })
    expect(res.statusCode).toBe(404)
  })
})

// ───────────────────────────────────────────────────────────────────────────
describe('Journey: A malformed or mismatched connection reference never leaks data', () => {
  beforeEach(async () => {
    server = await buildTestServer()
  })

  it('omitting connection_id is rejected before any data is touched', async () => {
    const res = await server.fastify.inject({ method: 'GET', url: '/v1/accounting/invoices' })
    expect([400, 401]).toContain(res.statusCode)
  })

  it('a malformed connection_id is rejected as CONNECTION_ID_INVALID', async () => {
    const res = await server.fastify.inject({
      method: 'GET',
      url: '/v1/crm/contacts?connection_id=not-a-uuid',
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error.code).toBe('CONNECTION_ID_INVALID')
  })

  it('an unknown connection_id is rejected as CONNECTION_NOT_FOUND', async () => {
    const res = await server.fastify.inject({
      method: 'GET',
      url: '/v1/crm/contacts?connection_id=00000000-0000-4000-8000-000000000000',
    })
    expect(res.statusCode).toBe(404)
    expect(res.json().error.code).toBe('CONNECTION_NOT_FOUND')
  })

  it("a connection from another vertical can't be used to read a different vertical", async () => {
    const crmId = await seedConnection(server, {
      vertical: 'crm',
      platform: 'hubspot',
      accessToken: 'k',
    })
    const res = await server.fastify.inject({
      method: 'GET',
      url: `/v1/accounting/invoices?connection_id=${crmId}`,
    })
    expect(res.statusCode).toBeGreaterThanOrEqual(400)
    expect(res.statusCode).toBeLessThan(500)
  })
})

// ───────────────────────────────────────────────────────────────────────────
describe('Journey: The resource cache is wired according to the configured data-store mode', () => {
  it('in database mode the per-vertical sync routes are available to operators', async () => {
    server = await buildTestServer({ dataStoreMode: 'database' })
    const res = await server.fastify.inject({
      method: 'POST',
      url: '/v1/accounting/sync',
      payload: {},
    })
    // Route is mounted: it reaches our auth middleware which demands a connection_id.
    expect(res.statusCode).toBe(400)
    expect(res.json().error?.code).toBe('CONNECTION_ID_REQUIRED')
  })

  it('in passthrough mode there is no sync surface at all (every read is live)', async () => {
    server = await buildTestServer({ dataStoreMode: 'passthrough' })
    const res = await server.fastify.inject({
      method: 'POST',
      url: '/v1/accounting/sync',
      payload: {},
    })
    // Fastify's own 404 — the route was never registered in this mode.
    expect(res.statusCode).toBe(404)
  })
})

// ───────────────────────────────────────────────────────────────────────────
describe('Journey: An inbound platform webhook is verified fail-closed', () => {
  beforeEach(async () => {
    server = await buildTestServer()
  })

  it('a webhook for a platform with no verifier is rejected, not accepted blindly', async () => {
    const res = await server.fastify.inject({
      method: 'POST',
      url: '/webhooks/logistics/no-such-platform',
      headers: { 'content-type': 'application/json' },
      payload: { items: [] },
    })
    expect(res.statusCode).toBe(501)
    expect(res.json().error.code).toBe('WEBHOOK_HANDLER_NOT_FOUND')
  })

  it('a webhook with an invalid HMAC signature is rejected', async () => {
    const body = JSON.stringify({ id: 'evt_1', type: 'payment_captured', data: { id: 'pay_1' } })
    const res = await server.fastify.inject({
      method: 'POST',
      url: '/webhooks/payments/checkout-com',
      headers: { 'content-type': 'application/json', 'cko-signature': 'deadbeef' },
      payload: body,
    })
    expect(res.statusCode).toBe(401)
    expect(res.json().error.code).toBe('INVALID_WEBHOOK_SIGNATURE')
  })

  it('a webhook with a valid HMAC signature is accepted', async () => {
    const body = JSON.stringify({ id: 'evt_1', type: 'payment_captured', data: { id: 'pay_1' } })
    // buildTestServer wires no per-adapter webhook secret, so the expected
    // signature is HMAC-SHA256 of the raw body keyed with the empty string.
    const signature = createHmac('sha256', '').update(Buffer.from(body)).digest('hex')
    const res = await server.fastify.inject({
      method: 'POST',
      url: '/webhooks/payments/checkout-com',
      headers: { 'content-type': 'application/json', 'cko-signature': signature },
      payload: body,
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().received).toBe(true)
  })
})

// ───────────────────────────────────────────────────────────────────────────
describe('Journey: The customer finishes the OAuth dance and a connection is stored', () => {
  beforeEach(async () => {
    server = await buildTestServer()
    // Best-effort webhook auto-registration / external-account lookups in the
    // callback may reach out over the network — stub fetch so the test is
    // hermetic and fast. The token exchange itself is mocked per-test.
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }))
  })

  it('a valid code+state exchanges for tokens and persists the connection', async () => {
    await enableBexio()
    // The token exchange would hit Bexio's upstream; mock it on the live
    // adapter instance the router will resolve from the registry.
    const adapter = server.registry.get('accounting', 'bexio')
    expect(adapter).toBeDefined()
    const exchange = vi
      .spyOn(adapter!, 'exchangeCode')
      .mockResolvedValue({ accessToken: 'tok-123', refreshToken: 'ref-123' })

    const connect = await server.fastify.inject({
      method: 'GET',
      url: '/auth/accounting/bexio/connect?tenant_id=acme',
    })
    const state = stateOf(connect.headers.location as string)

    const callback = await server.fastify.inject({
      method: 'GET',
      url: `/auth/accounting/bexio/callback?code=auth-code-xyz&state=${state}`,
    })
    expect(callback.statusCode).toBe(201)
    const data = callback.json().data as { id: string; status: string; platform: string }
    expect(data.status).toBe('connected')
    expect(data.platform).toBe('bexio')
    // The code we received must be the code we redeemed.
    expect(exchange).toHaveBeenCalledWith('auth-code-xyz', expect.any(String))

    // The persisted connection is now usable as a real connection reference.
    const reuse = await server.fastify.inject({
      method: 'GET',
      url: `/v1/accounting/invoices?connection_id=${data.id}`,
    })
    // Resolves to the connection (not 404 CONNECTION_NOT_FOUND) — proof it was stored.
    expect(reuse.json().error?.code).not.toBe('CONNECTION_NOT_FOUND')
  })

  /**
   * The customer pressed Cancel.
   *
   * RFC 6749 §4.1.2.1 sends `error` INSTEAD of `code`, so this arrived at a
   * handler that only knew about `code` and `state` and was answered with
   *
   *   400 MISSING_PARAMS  "`code` and `state` query params are required."
   *
   * — a raw JSON blob telling the person who cancelled that THEY had sent a
   * malformed request. The provider had already said exactly what happened
   * (Xero: `error=access_denied&error_description=TenantConsent status DENIED`)
   * and every word of it was discarded.
   */
  it('reports a declined authorization as a decline, not as a malformed request', async () => {
    await enableBexio()
    const connect = await server.fastify.inject({
      method: 'GET',
      url: '/auth/accounting/bexio/connect?tenant_id=acme',
    })
    const state = stateOf(connect.headers.location as string)

    const res = await server.fastify.inject({
      method: 'GET',
      url: `/auth/accounting/bexio/callback?error=access_denied&error_description=TenantConsent%20status%20DENIED&state=${state}`,
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error.code).toBe('OAUTH_DECLINED')
  })

  it('keeps the provider’s own reason, which is the only account of what happened', async () => {
    await enableBexio()
    const connect = await server.fastify.inject({
      method: 'GET',
      url: '/auth/accounting/bexio/connect?tenant_id=acme',
    })
    const state = stateOf(connect.headers.location as string)

    const res = await server.fastify.inject({
      method: 'GET',
      url: `/auth/accounting/bexio/callback?error=access_denied&error_description=TenantConsent%20status%20DENIED&state=${state}`,
    })
    const err = res.json().error
    expect(err.providerError).toBe('access_denied')
    expect(err.providerErrorDescription).toContain('DENIED')
  })

  it('spends the state on a decline, so a declined dance cannot be replayed', async () => {
    await enableBexio()
    const adapter = server.registry.get('accounting', 'bexio')
    const exchange = vi
      .spyOn(adapter!, 'exchangeCode')
      .mockResolvedValue({ accessToken: 'tok-123', refreshToken: 'ref-123' })

    const connect = await server.fastify.inject({
      method: 'GET',
      url: '/auth/accounting/bexio/connect?tenant_id=acme',
    })
    const state = stateOf(connect.headers.location as string)

    await server.fastify.inject({
      method: 'GET',
      url: `/auth/accounting/bexio/callback?error=access_denied&state=${state}`,
    })
    // Same state, now with a code: the pending entry is gone, so there is
    // nothing to redeem and no connection is created.
    const replay = await server.fastify.inject({
      method: 'GET',
      url: `/auth/accounting/bexio/callback?code=auth-code-xyz&state=${state}`,
    })
    expect(replay.json().error.code).toBe('INVALID_STATE')
    expect(exchange).not.toHaveBeenCalled()
  })

  it('does not create a connection when the customer declined', async () => {
    await enableBexio()
    const adapter = server.registry.get('accounting', 'bexio')
    const exchange = vi.spyOn(adapter!, 'exchangeCode')

    const connect = await server.fastify.inject({
      method: 'GET',
      url: '/auth/accounting/bexio/connect?tenant_id=acme',
    })
    const state = stateOf(connect.headers.location as string)
    await server.fastify.inject({
      method: 'GET',
      url: `/auth/accounting/bexio/callback?error=access_denied&state=${state}`,
    })
    expect(exchange).not.toHaveBeenCalled()
  })

  it('a callback with an unknown state is rejected — the CSRF guard holds', async () => {
    await enableBexio()
    const res = await server.fastify.inject({
      method: 'GET',
      url: '/auth/accounting/bexio/callback?code=auth-code-xyz&state=never-issued-this',
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error.code).toBe('INVALID_STATE')
  })

  it('a callback missing the code is rejected before any token exchange', async () => {
    await enableBexio()
    const res = await server.fastify.inject({
      method: 'GET',
      url: '/auth/accounting/bexio/callback?state=anything',
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error.code).toBe('MISSING_PARAMS')
  })
})

// ───────────────────────────────────────────────────────────────────────────
describe('Journey: A read-only Connect Link only ever asks the platform for read scopes', () => {
  beforeEach(async () => {
    server = await buildTestServer()
  })

  async function startLink(scopePolicy?: string): Promise<string> {
    const session = await server.fastify.inject({
      method: 'POST',
      url: '/admin/connect-sessions',
      payload: {
        tenantId: 'tenant-a',
        label: 'Onboard Acme',
        allowedVerticals: ['accounting'],
        scopePolicy,
      },
    })
    expect(session.statusCode).toBe(201)
    const { token } = session.json().data as { token: string }

    const start = await server.fastify.inject({
      method: 'POST',
      url: `/connect/sessions/${token}/oauth-start`,
      payload: { vertical: 'accounting', platform: 'bexio' },
    })
    expect(start.statusCode).toBe(200)
    const { redirectUrl } = start.json().data as { redirectUrl: string }
    return new URL(redirectUrl).searchParams.get('scope') ?? ''
  }

  /**
   * A customer mid-Connect-Link who cancels at the provider is not an API
   * consumer, and must not be handed JSON. Their link is still live and
   * unconsumed, so the useful place to put them is back on it — where they can
   * simply try again, or pick a different platform.
   */
  it('sends a customer who cancelled back to their own link, not to a JSON error', async () => {
    await enableBexio()
    const session = await server.fastify.inject({
      method: 'POST',
      url: '/admin/connect-sessions',
      payload: { tenantId: 'tenant-a', label: 'Onboard Acme', allowedVerticals: ['accounting'] },
    })
    const { token } = session.json().data as { token: string }
    const start = await server.fastify.inject({
      method: 'POST',
      url: `/connect/sessions/${token}/oauth-start`,
      payload: { vertical: 'accounting', platform: 'bexio' },
    })
    const state = stateOf((start.json().data as { redirectUrl: string }).redirectUrl)

    const res = await server.fastify.inject({
      method: 'GET',
      url: `/auth/accounting/bexio/callback?error=access_denied&error_description=TenantConsent%20status%20DENIED&state=${state}`,
    })
    expect(res.statusCode).toBe(302)
    expect(res.headers.location).toBe(`/connect/${token}?notice=declined`)
  })

  it('leaves the link usable after a cancel, so trying again needs no new link', async () => {
    await enableBexio()
    const session = await server.fastify.inject({
      method: 'POST',
      url: '/admin/connect-sessions',
      payload: { tenantId: 'tenant-a', label: 'Onboard Acme', allowedVerticals: ['accounting'] },
    })
    const { token } = session.json().data as { token: string }
    const start = await server.fastify.inject({
      method: 'POST',
      url: `/connect/sessions/${token}/oauth-start`,
      payload: { vertical: 'accounting', platform: 'bexio' },
    })
    const state = stateOf((start.json().data as { redirectUrl: string }).redirectUrl)
    await server.fastify.inject({
      method: 'GET',
      url: `/auth/accounting/bexio/callback?error=access_denied&state=${state}`,
    })

    const page = await server.fastify.inject({ method: 'GET', url: `/connect/${token}` })
    expect(page.statusCode).toBe(200)
  })

  it('explains the cancel on that page, in copy we own rather than the provider’s', async () => {
    await enableBexio()
    const session = await server.fastify.inject({
      method: 'POST',
      url: '/admin/connect-sessions',
      payload: { tenantId: 'tenant-a', label: 'Onboard Acme', allowedVerticals: ['accounting'] },
    })
    const { token } = session.json().data as { token: string }
    const page = await server.fastify.inject({
      method: 'GET',
      url: `/connect/${token}?notice=declined`,
    })
    expect(page.body).toContain('cancelled')
  })

  it('ignores an unknown notice rather than printing it on a branded page', async () => {
    // The value arrives in a query string. Echoing it through would let a
    // crafted link put arbitrary text on a page carrying the host's branding.
    await enableBexio()
    const session = await server.fastify.inject({
      method: 'POST',
      url: '/admin/connect-sessions',
      payload: { tenantId: 'tenant-a', label: 'Onboard Acme', allowedVerticals: ['accounting'] },
    })
    const { token } = session.json().data as { token: string }
    const page = await server.fastify.inject({
      method: 'GET',
      url: `/connect/${token}?notice=Your%20account%20is%20locked%2C%20call%20555-0100`,
    })
    expect(page.statusCode).toBe(200)
    expect(page.body).not.toContain('555-0100')
  })

  /**
   * A label collision must not destroy a completed authorization.
   *
   * A link's label becomes the connection's label, and connection labels are
   * unique per (tenant, platform). Minting a second link with a label already
   * in use produced a link that was doomed from birth — and said nothing until
   * the customer had logged in to the platform and granted consent, at which
   * point the callback answered them with
   *   {"error":{"code":"DUPLICATE_LABEL","message":"Connection label 'test 7'
   *     already exists for tenant '…' on platform 'xero'"}}
   * and dropped the tokens. The consent had to be repeated with a fresh link.
   */
  async function consumeLinkLabelled(label: string): Promise<LightMyRequestResponse> {
    const session = await server.fastify.inject({
      method: 'POST',
      url: '/admin/connect-sessions',
      payload: { tenantId: 'tenant-a', label, allowedVerticals: ['accounting'] },
    })
    const { token } = session.json().data as { token: string }
    const start = await server.fastify.inject({
      method: 'POST',
      url: `/connect/sessions/${token}/oauth-start`,
      payload: { vertical: 'accounting', platform: 'bexio' },
    })
    const state = stateOf((start.json().data as { redirectUrl: string }).redirectUrl)
    return server.fastify.inject({
      method: 'GET',
      url: `/auth/accounting/bexio/callback?code=auth-code-xyz&state=${state}`,
    })
  }

  it('completes a second link with a colliding label instead of discarding the grant', async () => {
    await enableBexio()
    const adapter = server.registry.get('accounting', 'bexio')
    vi.spyOn(adapter!, 'exchangeCode').mockResolvedValue({
      accessToken: 'tok-123',
      refreshToken: 'ref-123',
    })
    expect((await consumeLinkLabelled('Acme books')).statusCode).toBe(302)

    const second = await consumeLinkLabelled('Acme books')
    // A redirect to the thank-you page, not a JSON error blob.
    expect(second.statusCode).toBe(302)
    expect(second.body).not.toContain('DUPLICATE_LABEL')
    expect(second.headers.location).toMatch(/\/connect\/[a-f0-9]+\/done$/)
  })

  it('stores the second connection under a suffixed label the operator can rename', async () => {
    await enableBexio()
    const adapter = server.registry.get('accounting', 'bexio')
    vi.spyOn(adapter!, 'exchangeCode').mockResolvedValue({
      accessToken: 'tok-123',
      refreshToken: 'ref-123',
    })
    await consumeLinkLabelled('Acme books')
    await consumeLinkLabelled('Acme books')

    const list = await server.fastify.inject({ method: 'GET', url: '/admin/connections' })
    const labels = (list.json().data as Array<{ label: string | null }>)
      .map((c) => c.label)
      .sort()
    // Both connections exist — the grant was kept, not thrown away.
    expect(labels).toEqual(['Acme books', 'Acme books (2)'])
  })

  it('a read_only link requests exactly the platform’s curated read scopes', async () => {
    // bexio is configured with a broad default scope set…
    await enableBexio(['openid', 'company_profile'])
    const scope = await startLink('read_only')
    // …but a read-only link narrows the OAuth request to the curated read set.
    expect(scope.split(' ').sort()).toEqual([...READ_SCOPES.bexio].sort())
    // Sanity: the read set must not be the broad default we configured.
    expect(scope.split(' ')).not.toContain('company_profile')
  })

  it('a default-policy link falls back to the operator’s configured scopes', async () => {
    await enableBexio(['openid', 'company_profile'])
    const scope = await startLink('platform_default')
    expect(scope.split(' ').sort()).toEqual(['company_profile', 'openid'])
  })
})

// ───────────────────────────────────────────────────────────────────────────
describe('Journey: In database mode a synced resource is served from cache to the operator', () => {
  beforeEach(async () => {
    server = await buildTestServer({ dataStoreMode: 'database' })
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }))
  })

  it('a cached invoice is returned from the store, no live upstream call', async () => {
    await enableBexio()
    const adapter = server.registry.get('accounting', 'bexio')
    vi.spyOn(adapter!, 'exchangeCode').mockResolvedValue({ accessToken: 'tok-123' })

    // A customer connects through a Connect Link — that's what makes the
    // resulting connection tenant-owned (and therefore readable by the
    // operator's tenant key).
    const session = await server.fastify.inject({
      method: 'POST',
      url: '/admin/connect-sessions',
      payload: { tenantId: 'tenant-a', label: 'Onboard Acme', allowedVerticals: ['accounting'] },
    })
    const { token } = session.json().data as { token: string }
    const start = await server.fastify.inject({
      method: 'POST',
      url: `/connect/sessions/${token}/oauth-start`,
      payload: { vertical: 'accounting', platform: 'bexio' },
    })
    const state = stateOf((start.json().data as { redirectUrl: string }).redirectUrl)
    const cb = await server.fastify.inject({
      method: 'GET',
      url: `/auth/accounting/bexio/callback?code=auth-code-xyz&state=${state}`,
    })
    expect(cb.statusCode).toBe(302)

    // The operator reads with a tenant-scoped key.
    const keyRes = await server.fastify.inject({
      method: 'POST',
      url: '/admin/api-keys',
      payload: { tenantId: 'tenant-a', scopes: ['vertical:read', 'connections:read'] },
    })
    const key = keyRes.json().data.plaintext as string
    const conns = await server.fastify.inject({
      method: 'GET',
      url: '/v1/connections?platform=bexio',
      headers: { authorization: `Bearer ${key}` },
    })
    const connId = (conns.json().data as Array<{ id: string }>)[0].id

    // Pre-populate the read-through cache as a completed sync would have.
    //
    // Both halves matter. Rows alone are no longer enough to answer an
    // unfiltered list from cache: single-record writes also produce rows, and
    // treating their presence as completeness made one `get_invoices(id=…)`
    // serve that single invoice as the entire collection. A real completed
    // sync records the collection as complete, so this setup does too.
    // Three things, because a real completed sync does all three: it writes
    // the rows, records the collection as complete, and stamps WHICH
    // normalizer produced them. A row stamped with a different version is
    // correctly ignored — that is the Finding 26 fix — so seeding without the
    // stamp would silently test the miss path instead of the hit path.
    const normVersion = server.normalizerVersion('accounting', 'bexio')
    await server.resourceStore!.upsert(
      'accounting', 'bexio', connId, 'invoices', 'inv-1',
      { id: 'inv-1', total: 4200 },
      normVersion,
    )
    await server.resourceStore!.markCollectionComplete(
      'accounting', 'bexio', connId, 'invoices', normVersion,
    )

    // A 200 with the row — and no live bexio call (its token is a mock) —
    // proves the read was served from the cache.
    const res = await server.fastify.inject({
      method: 'GET',
      url: `/v1/accounting/invoices?connection_id=${connId}`,
      headers: { authorization: `Bearer ${key}` },
    })
    expect(res.statusCode).toBe(200)
    const rows = res.json().data as Array<{ id: string }>
    expect(rows.map((r) => r.id)).toContain('inv-1')
  })
})

// ───────────────────────────────────────────────────────────────────────────
describe('Journey: Consuming a Connect Link enqueues a signed webhook to the operator', () => {
  beforeEach(async () => {
    server = await buildTestServer()
    // The callback's best-effort webhook auto-registration may reach the
    // network; stub fetch so the test is hermetic. (Outbound event delivery
    // itself goes through SSRF-guarded safeFetch and is asserted at the
    // durable-queue layer below, not over the wire.)
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }))
  })

  it('a connect_link.consumed delivery is durably queued, signed with the subscription secret', async () => {
    await enableBexio()
    const adapter = server.registry.get('accounting', 'bexio')
    vi.spyOn(adapter!, 'exchangeCode').mockResolvedValue({ accessToken: 'tok-123' })

    // The operator subscribes to connect-link completions.
    const sub = await server.fastify.inject({
      method: 'POST',
      url: '/admin/webhook-subscriptions',
      payload: {
        tenantId: 'tenant-a',
        url: 'https://hooks.example.test/connect',
        events: ['connect_link.consumed'],
      },
    })
    expect(sub.statusCode).toBe(201)
    const { id: subId, secret } = sub.json().data as { id: string; secret: string }

    // Mint a link, start the OAuth dance through it, and complete the callback.
    const session = await server.fastify.inject({
      method: 'POST',
      url: '/admin/connect-sessions',
      payload: { tenantId: 'tenant-a', label: 'Onboard Acme', allowedVerticals: ['accounting'] },
    })
    const { token } = session.json().data as { token: string }
    const start = await server.fastify.inject({
      method: 'POST',
      url: `/connect/sessions/${token}/oauth-start`,
      payload: { vertical: 'accounting', platform: 'bexio' },
    })
    const state = stateOf((start.json().data as { redirectUrl: string }).redirectUrl)

    const callback = await server.fastify.inject({
      method: 'GET',
      url: `/auth/accounting/bexio/callback?code=auth-code-xyz&state=${state}`,
    })
    // Connect-link flow redirects the customer to the thank-you page.
    expect(callback.statusCode).toBe(302)

    // The event is durably enqueued before the callback returns, so it's
    // already visible — no polling needed.
    const list = await server.fastify.inject({
      method: 'GET',
      url: `/admin/webhook-subscriptions/${subId}/deliveries`,
    })
    expect(list.statusCode).toBe(200)
    const deliveries = list.json().data as Array<{
      eventType: string
      signature?: string
      body?: string
    }>
    const consumed = deliveries.find((d) => d.eventType === 'connect_link.consumed')
    expect(consumed, 'expected a queued connect_link.consumed delivery').toBeDefined()

    // When the row exposes the signed body, the signature must be a valid HMAC
    // of it under the subscription secret.
    if (consumed!.signature && consumed!.body) {
      const expected = createHmac('sha256', secret).update(consumed!.body).digest('hex')
      expect(consumed!.signature).toBe(expected)
    }
  })
})

// ───────────────────────────────────────────────────────────────────────────
describe('Journey: A key that exceeds its request budget is throttled', () => {
  /**
   * The real DEFAULT_API_KEY_RATE_LIMIT is 600 req/60 s — far too large to
   * exhaust deterministically in a unit test. Instead we swap the active
   * limiter for one with max=2 for the duration of this suite, then restore
   * the default inMemoryLimiter in afterEach so neighbouring journeys are
   * unaffected.
   *
   * Source: packages/shared/src/control-plane/rate-limit.ts line 28–31
   *   DEFAULT_API_KEY_RATE_LIMIT = { max: 600, windowMs: 60_000 }
   */
  const TINY_LIMIT: RateLimitConfig = { max: 2, windowMs: 60_000 }

  /** A limiter that issues exactly `max` tokens then blocks. */
  function tinyLimiter(max: number): RateLimiter {
    const counts = new Map<string, number>()
    return {
      async consume(key: string) {
        const n = (counts.get(key) ?? 0) + 1
        counts.set(key, n)
        if (n > max) {
          return { ok: false, retryAfterMs: 59_000, limit: max }
        }
        return { ok: true, remaining: max - n, limit: max, resetMs: 59_000 }
      },
    }
  }

  beforeEach(async () => {
    server = await buildTestServer()
    // Install a tight budget so the test only needs 3 requests to trip it.
    setRateLimiter(tinyLimiter(TINY_LIMIT.max))
  })

  afterEach(async () => {
    // Always restore the default backend before the next journey runs.
    setRateLimiter(inMemoryLimiter)
  })

  async function mintKey(tenantId: string, scopes: string[]): Promise<string> {
    const res = await server.fastify.inject({
      method: 'POST',
      url: '/admin/api-keys',
      payload: { tenantId, scopes },
    })
    expect(res.statusCode).toBe(201)
    return res.json().data.plaintext as string
  }

  it('the first requests within the budget succeed and carry x-ratelimit headers', async () => {
    const key = await mintKey('tenant-rl-a', ['customers:read', 'customers:write'])

    for (let i = 0; i < TINY_LIMIT.max; i++) {
      const res = await server.fastify.inject({
        method: 'GET',
        url: '/v1/customers',
        headers: { authorization: `Bearer ${key}` },
      })
      expect(res.statusCode).toBe(200)
      // The middleware emits x-ratelimit-limit on every allowed response.
      expect(res.headers['x-ratelimit-limit']).toBe(String(TINY_LIMIT.max))
    }
  })

  it('the request that exceeds the budget receives 429 RATE_LIMITED with retry-after', async () => {
    const key = await mintKey('tenant-rl-b', ['customers:read', 'customers:write'])

    // Exhaust the budget.
    for (let i = 0; i < TINY_LIMIT.max; i++) {
      await server.fastify.inject({
        method: 'GET',
        url: '/v1/customers',
        headers: { authorization: `Bearer ${key}` },
      })
    }

    // One more request must be rejected.
    const over = await server.fastify.inject({
      method: 'GET',
      url: '/v1/customers',
      headers: { authorization: `Bearer ${key}` },
    })

    expect(over.statusCode).toBe(429)
    expect(over.json().error.code).toBe('RATE_LIMITED')
    // The middleware must emit retry-after so clients can back off gracefully.
    expect(over.headers['retry-after']).toBeDefined()
    expect(Number(over.headers['retry-after'])).toBeGreaterThan(0)
    // x-ratelimit-remaining must be 0 once the budget is exhausted.
    expect(over.headers['x-ratelimit-remaining']).toBe('0')
    // x-ratelimit-limit must reflect the configured cap.
    expect(over.headers['x-ratelimit-limit']).toBe(String(TINY_LIMIT.max))
  })

  it('a different tenant key is NOT throttled — rate limit buckets are per key', async () => {
    const keyA = await mintKey('tenant-rl-c', ['customers:read', 'customers:write'])
    const keyB = await mintKey('tenant-rl-d', ['customers:read', 'customers:write'])

    // Exhaust key A's budget.
    for (let i = 0; i < TINY_LIMIT.max; i++) {
      await server.fastify.inject({
        method: 'GET',
        url: '/v1/customers',
        headers: { authorization: `Bearer ${keyA}` },
      })
    }
    // Key A is now throttled.
    const throttled = await server.fastify.inject({
      method: 'GET',
      url: '/v1/customers',
      headers: { authorization: `Bearer ${keyA}` },
    })
    expect(throttled.statusCode).toBe(429)

    // Key B has its own independent bucket — must still be served.
    const fresh = await server.fastify.inject({
      method: 'GET',
      url: '/v1/customers',
      headers: { authorization: `Bearer ${keyB}` },
    })
    expect(fresh.statusCode).toBe(200)
  })
})

// ───────────────────────────────────────────────────────────────────────────
describe('Journey: An operator sees an unsupported platform but can never connect it', () => {
  // One real platform per tracking issue: a client that targets an API the
  // platform does not have, an OAuth client that must be registered
  // inside each customer instance, and a platform with no usable API.
  // Each stays listed with its reason; nothing lets a customer start a
  // connection that cannot work.
  beforeEach(async () => {
    server = await buildTestServer()
  })

  const enable = (vertical: string, slug: string) =>
    server.fastify.inject({
      method: 'POST',
      url: `/admin/platforms/${vertical}/${slug}/enable`,
      payload: {
        config: { clientId: 'id', clientSecret: 'secret', redirectUri: 'http://localhost/cb' },
      },
    })

  it('enabling a platform whose client targets a missing API is refused with the reason', async () => {
    const res = await enable('accounting', 'giddh')
    expect(res.statusCode).toBe(400)
    const error = res.json().error as { code: string; reason: string; issueUrl?: string }
    expect(error.code).toBe('PLATFORM_UNSUPPORTED')
    expect(error.reason.trim().length).toBeGreaterThan(20)
    expect(error.reason).toContain('Giddh')
    // Shipped metadata carries no tracking-issue links: none of them would
    // resolve on the public repo.
    expect(error).not.toHaveProperty('issueUrl')
  })

  it('the refused platform stays listed for the operator, carrying its reason', async () => {
    await enable('accounting', 'giddh')
    const list = await server.fastify.inject({
      method: 'GET',
      url: '/admin/platforms?vertical=accounting',
    })
    const rows = list.json().data as Array<{
      slug: string
      enabled: boolean
      unsupported?: { reason: string; issueUrl?: string }
    }>
    const giddh = rows.find((r) => r.slug === 'giddh')
    expect(giddh?.enabled).toBe(false)
    expect(giddh?.unsupported?.reason).toContain('Giddh')
    expect(giddh?.unsupported).not.toHaveProperty('issueUrl')
  })

  it('enabling a per-instance OAuth platform is refused, naming the missing per-connection client support', async () => {
    const res = await enable('crm', 'accelo')
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toMatchObject({
      code: 'PLATFORM_UNSUPPORTED',
      reason: expect.stringContaining('Per-connection client credentials are not supported yet'),
    })
  })

  it('starting a direct connection to a platform with no usable API is refused before any redirect', async () => {
    const res = await server.fastify.inject({
      method: 'GET',
      url: '/auth/ecommerce/jimdo/connect?tenant_id=acme',
    })
    expect(res.statusCode).toBe(400)
    expect(res.headers.location).toBeUndefined()
    expect(res.json().error).toMatchObject({
      code: 'PLATFORM_UNSUPPORTED',
      reason: 'Jimdo does not offer a developer API.',
    })
  })

  it('a supported platform is unaffected', async () => {
    const res = await enable('accounting', 'bexio')
    expect(res.statusCode).toBe(200)
  })
})
