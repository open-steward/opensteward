/**
 * limits.tenants (D-B) at POST /api/tenants: counts every registered tenant,
 * 'default' included; community limits when integration-server has never
 * answered (P11); never removes a tenant.
 */
import { afterEach, describe, expect, it } from 'vitest'
import {
  buildAdminApiTestServer,
  createUserAndLogin,
  setupAdmin,
  type AdminApiTestServer,
} from '../journeys/helpers'
import { fixedLicense, licenseStatusFixture } from '../journeys/license-fixtures'
import type { LicenseFetchFailure } from '../../src/core/license/status-cache'
import type { LicenseStatusUpstream } from '../../src/core/routes/_openapi'

let server: AdminApiTestServer
afterEach(async () => {
  await server?.cleanup()
})

async function boot(
  status: LicenseStatusUpstream | null,
  o: { stale?: boolean; failure?: LicenseFetchFailure } = {},
) {
  server = await buildAdminApiTestServer({ licenseStatus: fixedLicense(status, o) })
  return setupAdmin(server)
}
const allowing = (tenants: number) => licenseStatusFixture({ limits: { connections: 5, tenants } })
const create = (token: string, id: string, name = id.toUpperCase()) =>
  server.fastify.inject({
    method: 'POST',
    url: '/api/tenants',
    headers: { authorization: `Bearer ${token}` },
    payload: { id, name },
  })
const ids = async () => (await server.adminStore.listTenants()).map((t) => t.id).sort()

describe('POST /api/tenants — limits.tenants', () => {
  it("counts 'default': a 1-tenant license refuses the first extra tenant, typed [L7:G12]", async () => {
    const res = await create(await boot(allowing(1)), 'acme')
    expect(res.statusCode).toBe(403)
    expect(res.json().error).toEqual({
      code: 'LICENSE_LIMIT_EXCEEDED',
      message:
        "This license allows 1 tenant, counting 'default' (1 registered). Existing tenants keep working. More tenants need a plan that includes them: https://opensteward.dev/license",
      limitKey: 'tenants',
      limit: 1,
      used: 1,
    })
    expect(await ids()).toEqual(['default'])
  })

  it.each([
    ['MISSING', {}],
    ['INVALID', { reason: 'BAD_SIGNATURE' }],
    ['DEGRADED', { reason: 'EXPIRED' }],
  ] as const)(
    'a status read in community mode (%s) says community mode allows it, never "This license" (review r20)',
    async (state, extra) => {
      const community = licenseStatusFixture({
        state,
        ...extra,
        entitlementSource: 'community',
        limits: { connections: 1, tenants: 1 },
      })
      const res = await create(await boot(community), 'acme')
      expect(res.statusCode).toBe(403)
      expect(res.json().error).toEqual({
        code: 'LICENSE_LIMIT_EXCEEDED',
        message:
          "Community mode allows 1 tenant, counting 'default' (1 registered). Existing tenants keep working. More tenants need a plan that includes them: https://opensteward.dev/license",
        limitKey: 'tenants',
        limit: 1,
        used: 1,
      })
      expect(res.json().error.message).not.toContain('This license allows')
    },
  )

  it('allows up to the limit and refuses the next [L7:G12]', async () => {
    const admin = await boot(allowing(2))
    expect((await create(admin, 'acme')).statusCode).toBe(201)
    const refused = await create(admin, 'globex')
    expect(refused.statusCode).toBe(403)
    expect(refused.json().error).toMatchObject({ limit: 2, used: 2 })
    expect(await ids()).toEqual(['acme', 'default'])
  })

  it('applies to operators — refused by the license, not by the role check', async () => {
    const admin = await boot(allowing(1))
    const res = await create(await createUserAndLogin(server, admin, 'op', 'operator'), 'acme')
    expect(res.statusCode).toBe(403)
    expect(res.json().error.code).toBe('LICENSE_LIMIT_EXCEEDED')
  })

  it('a tenant-restricted operator at the limit gets SCOPE_RESTRICTED, never the deployment-wide count', async () => {
    // The scope check answers first: a restricted caller must not learn how many
    // tenants the deployment has (`used`) from a license refusal.
    const admin = await boot(allowing(2))
    await server.adminStore.createTenant('acme', 'Acme') // 2 of 2: the license would refuse
    const token = await createUserAndLogin(server, admin, 'scoped', 'operator')
    const scoped = await server.fastify.inject({
      method: 'PUT',
      url: `/api/users/${(await server.adminStore.getUserByUsername('scoped'))!.id}/scope`,
      headers: { authorization: `Bearer ${admin}` },
      payload: { mode: 'restricted', grants: [{ tenantId: 'acme', verticals: '*' }] },
    })
    expect(scoped.statusCode).toBe(200)
    const res = await create(token, 'globex')
    expect(res.statusCode).toBe(403)
    expect(res.json().error.code).toBe('SCOPE_RESTRICTED')
    expect(res.json().error).not.toHaveProperty('used')
    expect(res.json().error).not.toHaveProperty('limit')
    // The same request from an unrestricted operator is the license's to refuse.
    const op = await createUserAndLogin(server, admin, 'op', 'operator')
    expect((await create(op, 'globex')).json().error.code).toBe('LICENSE_LIMIT_EXCEEDED')
  })

  it('a duplicate still answers 409, and an empty name 400', async () => {
    const admin = await boot(allowing(1))
    expect((await create(admin, 'default')).statusCode).toBe(409)
    expect((await create(admin, 'acme', '')).statusCode).toBe(400)
  })

  it('a stale status still sets the limit', async () => {
    expect((await create(await boot(allowing(2), { stale: true }), 'acme')).statusCode).toBe(201)
  })

  it('community limits apply before integration-server has ever answered (P11) [L7:N04]', async () => {
    const res = await create(await boot(null), 'acme')
    expect(res.statusCode).toBe(403)
    expect(res.json().error).toMatchObject({
      code: 'LICENSE_LIMIT_EXCEEDED',
      limitKey: 'tenants',
      limit: 1,
      used: 1,
    })
    expect(res.json().error.message).toContain('community limits apply')
    expect(await ids()).toEqual(['default'])
  })

  it('names ADMIN_SECRET when integration-server refused admin-api (ADMIN_DISABLED)', async () => {
    const failure = {
      status: 403,
      code: 'ADMIN_DISABLED',
      message: 'Request failed with status code 403',
    }
    const res = await create(await boot(null, { failure }), 'acme')
    expect(res.json().error.message).toContain('ADMIN_SECRET')
    // One sentence per idea, no parenthesis inside another: it is read in a console flash.
    expect(res.json().error.message).toBe(
      "The license could not be read from integration-server: integration-server has no ADMIN_SECRET, so it refuses admin-api (ADMIN_DISABLED). Set the same ADMIN_SECRET on integration-server and admin-api (Helm: secrets.generate.includeAdminSecret=true) and restart both. Until it can be read, community limits apply: the deployment allows 1 tenant, counting 'default', and 1 is registered. Existing tenants keep working. More tenants need a plan that includes them: https://opensteward.dev/license",
    )
  })

  it('regression pin (passes without the feature): tenants above the limit stay listed and deletable', async () => {
    const admin = await boot(allowing(1))
    await server.adminStore.createTenant('acme', 'Acme')
    await server.adminStore.createTenant('globex', 'Globex')
    const h = { authorization: `Bearer ${admin}` }
    const list = await server.fastify.inject({ method: 'GET', url: '/api/tenants', headers: h })
    expect(list.json().data).toHaveLength(3)
    const del = await server.fastify.inject({
      method: 'DELETE',
      url: '/api/tenants/globex',
      headers: h,
    })
    expect(del.statusCode).toBe(204)
  })
})
