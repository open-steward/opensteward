import { afterEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { VERTICALS } from '@opensteward/license-token'
import { buildTestServer, type TestServer } from '../integration/helpers'
import { signDevLicense } from './dev-license'

let server: TestServer | undefined
afterEach(async () => {
  await server?.cleanup()
  server = undefined
})
const bearer = (t: string) => ({ authorization: `Bearer ${t}` })
const get = (s: TestServer, url: string, token?: string) =>
  s.fastify.inject({ method: 'GET', url, headers: token ? bearer(token) : {} })

/** The verticals mounted under /v1/me in server.ts (source-level drift check, like mount-parity). */
const END_USER_MOUNTS = [
  ...readFileSync(join(__dirname, '../../src/server.ts'), 'utf8').matchAll(
    /prefix: `\/v1\/me\/\$\{(\w+)_VERTICAL\}`/g,
  ),
]
  .map((m) => m[1])
  .sort()

async function endUserToken(s: TestServer): Promise<string> {
  const eu = (
    await s.fastify.inject({
      method: 'POST',
      url: '/admin/end-users',
      payload: { tenantId: 'tenant-a', email: 'agent@example.test' },
    })
  ).json().data as { id: string }
  const tok = (
    await s.fastify.inject({
      method: 'POST',
      url: '/admin/end-user-tokens',
      payload: { endUserId: eu.id, tenantId: 'tenant-a' },
    })
  ).json().data as { plaintext: string }
  return tok.plaintext
}

describe('capabilities (P7)', () => {
  it('[L7:G02] /v1/capabilities lists exactly the entitled verticals the server runs, and nothing about the license', async () => {
    const s = (server = await buildTestServer({
      license: signDevLicense({
        features: ['mcp', 'vertical:crm', 'vertical:payments', 'vertical:not-shipped-yet'],
      }),
    }))
    const { plaintext } = await s.apiKeys.mint({ tenantId: 'tenant-a', scopes: ['mcp:read'] })
    const res = await get(s, '/v1/capabilities', plaintext)
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ data: { verticals: ['crm', 'payments'] } })
  })

  it('community mode lists every vertical', async () => {
    const s = (server = await buildTestServer({ license: null }))
    const { plaintext } = await s.apiKeys.mint({ tenantId: 'tenant-a', scopes: ['mcp:read'] })
    expect((await get(s, '/v1/capabilities', plaintext)).json()).toEqual({
      data: { verticals: [...VERTICALS].sort() },
    })
  })

  it('needs a tenant credential, but no particular scope', async () => {
    const s = (server = await buildTestServer())
    expect((await get(s, '/v1/capabilities')).statusCode).toBe(401)
    const { plaintext } = await s.apiKeys.mint({ tenantId: 'tenant-a', scopes: ['customers:read'] })
    expect((await get(s, '/v1/capabilities', plaintext)).statusCode).toBe(200)
  })

  it('[L7:G14] a license without mcp refuses an mcp:read key; a plain key still gets the list', async () => {
    const s = (server = await buildTestServer({
      license: signDevLicense({ features: ['vertical:crm'] }),
    }))
    const mcp = (await s.apiKeys.mint({ tenantId: 'tenant-a', scopes: ['mcp:read'] })).plaintext
    const plain = (await s.apiKeys.mint({ tenantId: 'tenant-a', scopes: ['customers:read'] }))
      .plaintext
    const refused = await get(s, '/v1/capabilities', mcp)
    expect(refused.statusCode).toBe(403)
    expect(refused.json().error.code).toBe('LICENSE_FEATURE_NOT_ENTITLED')
    expect((await get(s, '/v1/capabilities', plain)).json()).toEqual({
      data: { verticals: ['crm'] },
    })
  })

  it('the sandbox rendering answers a test key the same way', async () => {
    const s = (server = await buildTestServer({
      license: signDevLicense({ features: ['mcp', 'vertical:crm', 'vertical:payments'] }),
    }))
    const { plaintext } = await s.apiKeys.mint({
      tenantId: 'tenant-a',
      scopes: ['*'],
      mode: 'test',
    })
    const res = await get(s, '/test/v1/capabilities', plaintext)
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ data: { verticals: ['crm', 'payments'] } })
  })

  it('[L7:G15] /v1/me/capabilities: the mounted end-user verticals, for an eut_ token only', async () => {
    // Drift check: a new /v1/me mount must be added to END_USER_VERTICALS in server.ts.
    expect(END_USER_MOUNTS).toEqual(['ACCOUNTING', 'CRM', 'ECOMMERCE', 'LOGISTICS', 'PAYMENTS'])
    const s = (server = await buildTestServer())
    const eut = await endUserToken(s)
    const res = await get(s, '/v1/me/capabilities', eut)
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({
      data: { verticals: ['accounting', 'crm', 'ecommerce', 'logistics', 'payments'] },
    })
    const { plaintext: osk } = await s.apiKeys.mint({ tenantId: 'tenant-a', scopes: ['*'] })
    expect((await get(s, '/v1/me/capabilities', osk)).statusCode).toBe(401)
    expect((await get(s, '/v1/capabilities', eut)).statusCode).toBe(401)
  })

  it('/v1/me/capabilities intersects the mounted verticals with the license (P7)', async () => {
    const s = (server = await buildTestServer({
      license: signDevLicense({ features: ['mcp', 'vertical:crm', 'vertical:inventory'] }),
    }))
    const eut = await endUserToken(s)
    // inventory is entitled but not mounted under /v1/me, so it is not a capability there.
    expect((await get(s, '/v1/me/capabilities', eut)).json()).toEqual({
      data: { verticals: ['crm'] },
    })
  })

  it('every vertical the server runs is in the token vocabulary', async () => {
    const s = (server = await buildTestServer())
    expect([...s.registry.verticals()].sort()).toEqual([...VERTICALS].sort())
  })
})
