import { afterEach, describe, expect, it, vi } from 'vitest'
import { writeFileSync } from 'node:fs'
import { buildTestServer, seedConnection, type TestServer } from '../integration/helpers'
import { daysFromNow, signDevLicense } from './dev-license'

let server: TestServer | undefined
afterEach(async () => {
  await server?.cleanup()
  server = undefined
})

describe('[L7:G11] hot reload: renewal and lapse without a restart', () => {
  it('MISSING → VALID when license.key appears (the directory watch buildServer starts)', async () => {
    const s = (server = await buildTestServer({ license: null, licenseVia: 'file' }))
    expect(s.license.current().state).toBe('MISSING')
    writeFileSync(s.licenseFile, signDevLicense({ sub: 'lic_renewed01' }))
    await vi.waitFor(() => expect(s.license.current().licenseId).toBe('lic_renewed01'), {
      timeout: 10_000,
      interval: 100,
    })
    expect(
      (await s.fastify.inject({ method: 'GET', url: '/admin/license' })).json().data.state,
    ).toBe('VALID')
  })

  it('a renewal replaces an expiring license and lifts its limit', async () => {
    const s = (server = await buildTestServer({
      license: signDevLicense({ exp: daysFromNow(10), limits: { connections: 1, tenants: 1 } }),
      licenseVia: 'file',
    }))
    expect(s.license.current().state).toBe('EXPIRING')
    await seedConnection(s, { vertical: 'crm', platform: 'hubspot', accessToken: 't', label: 'a' })
    await expect(
      seedConnection(s, { vertical: 'crm', platform: 'hubspot', accessToken: 't', label: 'b' }),
    ).rejects.toMatchObject({ code: 'LICENSE_LIMIT_EXCEEDED' })
    writeFileSync(
      s.licenseFile,
      signDevLicense({ exp: daysFromNow(365), limits: { connections: 5, tenants: 1 } }),
    )
    await s.license.refresh()
    expect(s.license.current().state).toBe('VALID')
    await expect(
      seedConnection(s, { vertical: 'crm', platform: 'hubspot', accessToken: 't', label: 'b' }),
    ).resolves.toBeTypeOf('string')
  })

  it('a lapse past grace drops to community mode: nothing is deleted, an over-cap write is refused', async () => {
    // With no credential the vertical scope check answers first (INSUFFICIENT_SCOPE),
    // so write as the operator. The auth middleware reads ADMIN_SECRET when the server is built.
    process.env['ADMIN_SECRET'] = 'hot-reload-admin-secret'
    try {
      const s = (server = await buildTestServer({ licenseVia: 'file' }))
      const a = await seedConnection(s, {
        vertical: 'crm',
        platform: 'hubspot',
        accessToken: 't',
        label: 'a',
      })
      const b = await seedConnection(s, {
        vertical: 'crm',
        platform: 'hubspot',
        accessToken: 't',
        label: 'b',
      })
      writeFileSync(
        s.licenseFile,
        signDevLicense({ iat: daysFromNow(-400), nbf: daysFromNow(-400), exp: daysFromNow(-40) }),
      )
      await s.license.refresh()
      expect(s.license.current()).toMatchObject({
        state: 'DEGRADED',
        entitlementSource: 'community',
      })
      expect(await s.store.count()).toBe(2)
      const [writable] = await s.store.listIdsInCreationOrder(1)
      const readOnly = writable === a ? b : a
      const res = await s.fastify.inject({
        method: 'POST',
        url: `/v1/crm/contacts?connection_id=${readOnly}`,
        headers: { 'x-admin-secret': 'hot-reload-admin-secret' },
        payload: {},
      })
      expect(res.statusCode).toBe(403)
      expect(res.json().error.code).toBe('LICENSE_LIMIT_EXCEEDED')
    } finally {
      delete process.env['ADMIN_SECRET']
    }
  })

  it('an env token is never replaced by the file; the shadowed file is reported (Review Focus #2)', async () => {
    const s = (server = await buildTestServer({
      license: signDevLicense({ sub: 'lic_fromenv001' }),
    }))
    writeFileSync(s.licenseFile, signDevLicense({ sub: 'lic_fromfile01' }))
    await s.license.refresh()
    expect(
      (await s.fastify.inject({ method: 'GET', url: '/admin/license' })).json().data,
    ).toMatchObject({
      source: 'env',
      licenseId: 'lic_fromenv001',
      shadowedFile: s.licenseFile,
    })
  })
})
