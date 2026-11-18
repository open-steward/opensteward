/**
 * GET /api/license — integration-server's license verdict as admin-api last read
 * it, admin role only, never the token.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import Fastify from 'fastify'
import {
  buildAdminApiTestServer,
  createUserAndLogin,
  setupAdmin,
  type AdminApiTestServer,
} from '../journeys/helpers'
import { fixedLicense, licenseStatusFixture } from '../journeys/license-fixtures'
import {
  LicenseStatusCache,
  type LicenseLookup,
  type LicenseStatusProvider,
} from '../../src/core/license/status-cache'
import type { LicenseStatusUpstream } from '../../src/core/routes/_openapi'

let server: AdminApiTestServer
afterEach(async () => {
  await server?.cleanup()
})

async function boot(
  p: LicenseStatusProvider | 'integration-server' = fixedLicense(licenseStatusFixture()),
) {
  server = await buildAdminApiTestServer({ licenseStatus: p })
  return setupAdmin(server)
}
const get = (headers: Record<string, string>) =>
  server.fastify.inject({ method: 'GET', url: '/api/license', headers })
const as = (token: string) => ({ authorization: `Bearer ${token}` })

describe('GET /api/license', () => {
  it('admin gets the status, tenant usage, the grace end and the fetch time [L7:G07]', async () => {
    const res = await get(as(await boot()))
    expect(res.statusCode).toBe(200)
    expect(res.json().data).toMatchObject({
      state: 'VALID',
      org: 'Acme Forsakring AB',
      limits: { connections: 5, tenants: 1 },
      usage: { connections: 3, tenants: 1 },
      renewalUrl: 'https://opensteward.dev/license',
      graceEndsAt: '2027-11-05T17:00:00.000Z',
      stale: false,
      fetchedAt: '2026-10-09T12:00:00.000Z',
    })
  })

  it('no graceEndsAt without an expiry (MISSING)', async () => {
    const missing = licenseStatusFixture({
      state: 'MISSING',
      source: 'none',
      entitlementSource: 'community',
      limits: { connections: 1, tenants: 1 },
      licenseId: undefined,
      org: undefined,
      tier: undefined,
      label: undefined,
      env: undefined,
      kid: undefined,
      issuedAt: undefined,
      expiresAt: undefined,
      daysRemaining: undefined,
    })
    const res = await get(as(await boot(fixedLicense(missing))))
    expect(res.json().data.state).toBe('MISSING')
    expect(res.json().data).not.toHaveProperty('graceEndsAt')
  })

  it('names the license file an OPENSTEWARD_LICENSE value is shadowing (shadowedFile)', async () => {
    const shadowed = licenseStatusFixture({
      source: 'env',
      filePath: undefined,
      shadowedFile: '/etc/opensteward/license/license.key',
    })
    const res = await get(as(await boot(fixedLicense(shadowed))))
    expect(res.statusCode).toBe(200)
    expect(res.json().data).toMatchObject({
      source: 'env',
      shadowedFile: '/etc/opensteward/license/license.key',
    })
  })

  it('serves the last known status, stale, while integration-server is down [L7:N04]', async () => {
    const res = await get(as(await boot(fixedLicense(licenseStatusFixture(), { stale: true }))))
    expect(res.statusCode).toBe(200)
    expect(res.json().data.stale).toBe(true)
  })

  it('503 LICENSE_STATUS_UNAVAILABLE before integration-server has ever answered [L7:G16]', async () => {
    const res = await get(as(await boot(fixedLicense(null))))
    expect(res.statusCode).toBe(503)
    expect(res.json().error.code).toBe('LICENSE_STATUS_UNAVAILABLE')
    expect(res.json().error.message).toContain('keeps enforcing the license on its own')
  })

  it('the 503 names ADMIN_SECRET when integration-server answered ADMIN_DISABLED [L7:G16]', async () => {
    const failure = {
      status: 403,
      code: 'ADMIN_DISABLED',
      message: 'Request failed with status code 403',
    }
    const res = await get(as(await boot(fixedLicense(null, { failure }))))
    expect(res.statusCode).toBe(503)
    expect(res.json().error.message).toContain('ADMIN_SECRET')
    expect(res.json().error.message).toContain('includeAdminSecret')
  })

  it('operator and viewer get 403 [L7:G07]', async () => {
    const admin = await boot()
    for (const role of ['operator', 'viewer'] as const) {
      const token = await createUserAndLogin(server, admin, `u-${role}`, role)
      expect((await get(as(token))).statusCode, role).toBe(403)
    }
  })

  it('no credentials: 401', async () => {
    await boot()
    expect((await get({})).statusCode).toBe(401)
  })

  it('a developer key (osk_) is not an admin-api credential: 401 [L7:G06]', async () => {
    await boot()
    expect((await get(as('osk_live_0123456789abcdefghijklmnop'))).statusCode).toBe(401)
  })

  it('an end-user token (eut_) is not an admin-api credential: 401 [L7:G05]', async () => {
    await boot()
    expect((await get(as('eut_0123456789abcdefghijklmnopqrstu'))).statusCode).toBe(401)
  })

  it('the response schema alone never serves a token, even one the provider hands it', async () => {
    // Pins the second layer on its own: a provider that kept a stray token (the
    // upstream parse skipped) still cannot put it on the wire.
    const leaky = {
      ...licenseStatusFixture(),
      token: 'v4.public.SECRETxyz',
    } as LicenseStatusUpstream
    const res = await get(as(await boot(fixedLicense(leaky))))
    expect(res.statusCode).toBe(200)
    expect(res.json().data.org).toBe('Acme Forsakring AB')
    expect(res.json().data).not.toHaveProperty('token')
    expect(res.body).not.toContain('SECRETxyz')
  })

  it('default provider: nothing asked at boot, then the answer, stripped of unknown keys and never the token [L7:G16]', async () => {
    // Pins the first layer on its own: what admin-api's cache keeps from
    // integration-server has no token and no unknown key. (The response schema
    // strips them too, so the response alone cannot tell the layers apart.) It
    // reads the cache's own answer, not parse()'s, so keeping the raw body beside
    // the parsed one (`{ ...raw, ...parse(raw) }`) fails here (review r11).
    const cacheGet = vi.spyOn(LicenseStatusCache.prototype, 'get')
    let hits = 0
    let seenSecret: unknown
    const upstream = Fastify({ logger: false })
    upstream.get('/admin/license', async (request) => {
      hits++
      seenSecret = request.headers['x-admin-secret']
      // A misbehaving or newer integration-server: extra keys, even a token. And
      // every declared key, optional ones included, must survive the parse.
      const status = licenseStatusFixture({
        source: 'env',
        shadowedFile: '/etc/opensteward/license/license.key',
      })
      return { data: { ...status, token: 'v4.public.SECRETxyz', futureField: 1 } }
    })
    vi.stubEnv('INTEGRATION_SERVER_URL', await upstream.listen({ port: 0, host: '127.0.0.1' }))
    vi.stubEnv('ADMIN_SECRET', 'route-test-admin-secret')
    try {
      const admin = await boot('integration-server')
      await new Promise((r) => setImmediate(r))
      expect(hits).toBe(0) // lazy: generatorMode and every test server stay offline
      const res = await get(as(admin))
      expect(res.statusCode).toBe(200)
      expect(res.json().data.org).toBe('Acme Forsakring AB')
      expect(res.json().data.shadowedFile).toBe('/etc/opensteward/license/license.key')
      expect(res.json().data).not.toHaveProperty('futureField')
      expect(res.json().data).not.toHaveProperty('token')
      expect(res.body).not.toContain('v4.public.')
      expect(res.body).not.toContain('SECRETxyz')
      expect(seenSecret).toBe('route-test-admin-secret')
      expect(hits).toBe(1)
      expect(cacheGet).toHaveBeenCalled()
      const lookup = (await cacheGet.mock.results[0]?.value) as LicenseLookup
      const kept = lookup.snapshot?.status as Record<string, unknown> | undefined
      expect(kept?.org).toBe('Acme Forsakring AB')
      expect(kept?.shadowedFile).toBe('/etc/opensteward/license/license.key')
      expect(kept).not.toHaveProperty('token')
      expect(kept).not.toHaveProperty('futureField')
      expect(JSON.stringify(kept)).not.toContain('SECRETxyz')
    } finally {
      cacheGet.mockRestore()
      await upstream.close()
    }
  })

  it('end to end: integration-server answering 403 ADMIN_DISABLED gives a 503 naming ADMIN_SECRET', async () => {
    // The real chain — UnifiedClient, the cache, the route — not a fixed provider: the
    // Helm default (includeAdminSecret: false) must read as a fixable configuration.
    const upstream = Fastify({ logger: false })
    upstream.get('/admin/license', async (_request, reply) =>
      reply
        .status(403)
        .send({ error: { code: 'ADMIN_DISABLED', message: 'Admin endpoints are disabled' } }),
    )
    vi.stubEnv('INTEGRATION_SERVER_URL', await upstream.listen({ port: 0, host: '127.0.0.1' }))
    try {
      const res = await get(as(await boot('integration-server')))
      expect(res.statusCode).toBe(503)
      expect(res.json().error.code).toBe('LICENSE_STATUS_UNAVAILABLE')
      expect(res.json().error.message).toContain('has no ADMIN_SECRET')
    } finally {
      await upstream.close()
    }
  })

  it('end to end: a body admin-api cannot parse gives a 503 asking for the same release on both', async () => {
    // Version skew: integration-server answers 200, but not with a LicenseStatusDTO.
    // The parse must refuse it (never serve it, never 500 on a missing field) and
    // the message must say what to do.
    const upstream = Fastify({ logger: false })
    upstream.get('/admin/license', async () => ({ data: { state: 'VALID' } }))
    vi.stubEnv('INTEGRATION_SERVER_URL', await upstream.listen({ port: 0, host: '127.0.0.1' }))
    vi.stubEnv('ADMIN_SECRET', 'route-test-admin-secret')
    try {
      const res = await get(as(await boot('integration-server')))
      expect(res.statusCode).toBe(503)
      expect(res.json().error.code).toBe('LICENSE_STATUS_UNAVAILABLE')
      expect(res.json().error.message).toContain('does not understand')
      expect(res.json().error.message).toContain('Run the same OpenSteward release on both')
    } finally {
      await upstream.close()
    }
  })

  it('end to end: integration-server unreachable, every answer is typed and none is a 500 [L7:N04]', async () => {
    // The real chain again. The upstream listens only to claim a free port and is
    // closed before admin-api boots, so every request to it is refused.
    const upstream = Fastify({ logger: false })
    vi.stubEnv('INTEGRATION_SERVER_URL', await upstream.listen({ port: 0, host: '127.0.0.1' }))
    vi.stubEnv('ADMIN_SECRET', 'route-test-admin-secret')
    await upstream.close()
    const h = as(await boot('integration-server'))
    const health = await server.fastify.inject({ method: 'GET', url: '/health' })
    const tenants = await server.fastify.inject({ method: 'GET', url: '/api/tenants', headers: h })
    const license = await get(h)
    const created = await server.fastify.inject({
      method: 'POST',
      url: '/api/tenants',
      headers: h,
      payload: { id: 'acme', name: 'ACME' },
    })
    expect([health, tenants, license, created].map((r) => r.statusCode)).toEqual([
      200, 200, 503, 403,
    ])
    expect(license.json().error.code).toBe('LICENSE_STATUS_UNAVAILABLE')
    expect(license.json().error.message).toContain('integration-server has not answered')
    // P11: until the license can be read, community limits apply, counting 'default'.
    expect(created.json().error).toMatchObject({
      code: 'LICENSE_LIMIT_EXCEEDED',
      limitKey: 'tenants',
      limit: 1,
      used: 1,
    })
    expect(created.json().error.message).toContain('community limits apply')
    expect((await server.adminStore.listTenants()).map((t) => t.id)).toEqual(['default'])
  })
})
