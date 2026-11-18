import { afterEach, describe, expect, it, vi } from 'vitest'
import { LicenseStatusDTOSchema } from '@opensteward/shared/licensing'
import { buildTestServer, seedConnection, type TestServer } from '../integration/helpers'
import { signDevLicense } from './dev-license'

let server: TestServer | undefined
afterEach(async () => {
  await server?.cleanup()
  server = undefined
  delete process.env['ADMIN_SECRET']
})

describe('GET /admin/license (D-A: what admin-api reads for /api/license)', () => {
  it('reports the evaluated license and connection usage, never the token', async () => {
    const token = signDevLicense({
      org: 'Acme Forsakring AB',
      label: 'production',
      limits: { connections: 5, tenants: 1 },
    })
    server = await buildTestServer({ license: token })
    await seedConnection(server, {
      vertical: 'crm',
      platform: 'hubspot',
      accessToken: 't',
      label: 'a',
    })
    const res = await server.fastify.inject({ method: 'GET', url: '/admin/license' })
    expect(res.statusCode).toBe(200)
    expect(LicenseStatusDTOSchema.parse(res.json().data)).toMatchObject({
      state: 'VALID',
      org: 'Acme Forsakring AB',
      label: 'production',
      source: 'env',
      limits: { connections: 5, tenants: 1 },
      usage: { connections: 1 },
      entitlementSource: 'license',
      renewalUrl: 'https://opensteward.dev/license',
    })
    expect(res.body).not.toContain(token)
    expect(res.body).not.toContain('v4.public.')
  })

  it('MISSING: community limits and the path it looked at', async () => {
    server = await buildTestServer({ license: null })
    const dto = (await server.fastify.inject({ method: 'GET', url: '/admin/license' })).json().data
    expect(dto).toMatchObject({
      state: 'MISSING',
      entitlementSource: 'community',
      limits: { connections: 1, tenants: 1 },
      filePath: server.licenseFile,
      usage: { connections: 0 },
    })
  })

  it('a failed connection count reports usage null, not an error', async () => {
    server = await buildTestServer()
    vi.spyOn(server.store, 'count').mockRejectedValueOnce(new Error('db gone'))
    const res = await server.fastify.inject({ method: 'GET', url: '/admin/license' })
    expect(res.statusCode).toBe(200)
    expect(res.json().data).toMatchObject({ state: 'VALID', usage: { connections: null } })
  })

  it('operator-only: X-Admin-Secret gets 200; none, a wrong one, osk_ and eut_ get 403', async () => {
    process.env['ADMIN_SECRET'] = 'license-admin-secret'
    server = await buildTestServer()
    const s = server
    const admin = { 'x-admin-secret': 'license-admin-secret' }
    const get = (headers: Record<string, string> = {}) =>
      s.fastify.inject({ method: 'GET', url: '/admin/license', headers })
    const { plaintext: osk } = await s.apiKeys.mint({ tenantId: 'tenant-a', scopes: ['*'] })
    const endUser = (
      await s.fastify.inject({
        method: 'POST',
        url: '/admin/end-users',
        headers: admin,
        payload: { tenantId: 'tenant-a', email: 'eu@example.test' },
      })
    ).json().data as { id: string }
    const eut = (
      await s.fastify.inject({
        method: 'POST',
        url: '/admin/end-user-tokens',
        headers: admin,
        payload: { endUserId: endUser.id, tenantId: 'tenant-a' },
      })
    ).json().data.plaintext as string
    expect(eut).toMatch(/^eut_/)
    expect((await get()).statusCode).toBe(403)
    expect((await get({ 'x-admin-secret': 'wrong' })).json().error.code).toBe('FORBIDDEN')
    expect((await get({ authorization: `Bearer ${osk}` })).statusCode).toBe(403)
    expect((await get({ authorization: `Bearer ${eut}` })).statusCode).toBe(403)
    expect((await get(admin)).statusCode).toBe(200)
  })

  it('with no ADMIN_SECRET (and no local opt-in) it answers 403 ADMIN_DISABLED, which admin-api turns into a 503 naming ADMIN_SECRET', async () => {
    const optIn = process.env['OST_ALLOW_UNAUTH_ADMIN']
    delete process.env['OST_ALLOW_UNAUTH_ADMIN']
    try {
      server = await buildTestServer()
      const res = await server.fastify.inject({ method: 'GET', url: '/admin/license' })
      expect(res.statusCode).toBe(403)
      expect(res.json().error.code).toBe('ADMIN_DISABLED')
    } finally {
      if (optIn !== undefined) process.env['OST_ALLOW_UNAUTH_ADMIN'] = optIn
    }
  })

  it('the manager stops with the server (onClose)', async () => {
    server = await buildTestServer()
    const stop = vi.spyOn(server.license, 'stop')
    await server.cleanup()
    server = undefined
    expect(stop).toHaveBeenCalled()
  })
})
