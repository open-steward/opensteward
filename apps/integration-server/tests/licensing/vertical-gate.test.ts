import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { VERTICALS } from '@opensteward/license-token'
import { buildTestServer, seedConnection, type TestServer } from '../integration/helpers'
import { signDevLicense } from './dev-license'

const ADMIN = 'gate-admin-secret'
const admin = { 'x-admin-secret': ADMIN }
let server: TestServer | undefined
beforeEach(() => {
  process.env['ADMIN_SECRET'] = ADMIN // the auth middleware reads it when the server is built
})
afterEach(async () => {
  await server?.cleanup()
  server = undefined
  delete process.env['ADMIN_SECRET']
})

const errorCode = (body: unknown): string => {
  const e = (body as { error?: unknown }).error
  return typeof e === 'object' && e !== null ? String((e as { code?: unknown }).code ?? '') : ''
}
async function enableBexio(s: TestServer, vertical: 'accounting' | 'crm'): Promise<void> {
  const res = await s.fastify.inject({
    method: 'POST',
    url: `/admin/platforms/${vertical}/bexio/enable`,
    headers: admin,
    payload: {
      config: {
        clientId: 'id',
        clientSecret: 'secret',
        redirectUri: 'http://localhost/cb',
        scopes: ['openid'],
      },
    },
  })
  expect(res.statusCode).toBe(200)
}
/** A bexio connection whose list is served from the cache: a request the gate lets through reaches the handler with no upstream call. */
async function cachedConnection(
  s: TestServer,
  vertical: 'accounting' | 'crm',
  type: string,
  label: string,
): Promise<string> {
  const id = await seedConnection(s, { vertical, platform: 'bexio', accessToken: 't', label })
  const v = s.normalizerVersion(vertical, 'bexio')
  await s.resourceStore!.upsert(
    vertical,
    'bexio',
    id,
    type,
    `${type}-1`,
    { id: `${type}-1`, total: 4200 },
    v,
  )
  await s.resourceStore!.markCollectionComplete(vertical, 'bexio', id, type, v)
  return id
}
/** One GET list route per vertical that the sandbox serves from fixtures, with no upstream. */
const SANDBOX_LIST_ROUTE: Record<string, string> = {
  accounting: 'invoices',
  crm: 'contacts',
  'customer-support': 'tickets',
  docsign: 'envelopes',
  ecommerce: 'products',
  inventory: 'products',
  logistics: 'shipments',
  payments: 'customers',
  projects: 'projects',
}
/** A test key for tenant-a, and its sandbox connection in each vertical. */
async function sandboxCaller(s: TestServer) {
  const { plaintext } = await s.apiKeys.mint({ tenantId: 'tenant-a', scopes: ['*'], mode: 'test' })
  const auth = { authorization: `Bearer ${plaintext}` }
  const conns = (
    await s.fastify.inject({ method: 'GET', url: '/test/v1/connections', headers: auth })
  ).json().data as Array<{ id: string; vertical: string }>
  const idOf = (vertical: string): string => conns.find((c) => c.vertical === vertical)!.id
  const get = (vertical: string, route: string) =>
    s.fastify.inject({
      method: 'GET',
      url: `/test/v1/${vertical}/${route}?connection_id=${idOf(vertical)}`,
      headers: auth,
    })
  return { auth, idOf, get }
}
/**
 * Boots on the full default license, so both connections can be created, then
 * lowers it to crm only through the file (review #2: booting crm-only would
 * refuse the accounting seed at the create guard before the gate is reached).
 */
async function bootThenLowerToCrm(): Promise<{ s: TestServer; acc: string; crm: string }> {
  const s = (server = await buildTestServer({ dataStoreMode: 'database', licenseVia: 'file' }))
  await enableBexio(s, 'accounting')
  await enableBexio(s, 'crm')
  const acc = await cachedConnection(s, 'accounting', 'invoices', 'acc')
  const crm = await cachedConnection(s, 'crm', 'contacts', 'crm')
  writeFileSync(s.licenseFile, signDevLicense({ features: ['mcp', 'vertical:crm'] }))
  await s.license.refresh()
  return { s, acc, crm }
}

describe('vertical license gate (P6)', () => {
  it('[L7:G01] [L7:G09] refuses a vertical the license does not include, with the structured envelope', async () => {
    const { s, acc } = await bootThenLowerToCrm()
    const res = await s.fastify.inject({
      method: 'GET',
      url: `/v1/accounting/invoices?connection_id=${acc}`,
      headers: admin,
    })
    expect(res.statusCode).toBe(403)
    expect(res.json()).toEqual({
      error: {
        code: 'LICENSE_FEATURE_NOT_ENTITLED',
        message: expect.stringContaining("'vertical:accounting'"),
        feature: 'vertical:accounting',
      },
    })
  })

  it('refuses writes and syncs on that vertical too, and deletes nothing', async () => {
    const { s, acc } = await bootThenLowerToCrm()
    for (const url of [
      `/v1/accounting/invoices?connection_id=${acc}`,
      `/v1/accounting/sync?connection_id=${acc}`,
    ]) {
      const res = await s.fastify.inject({ method: 'POST', url, headers: admin, payload: {} })
      expect(res.statusCode, url).toBe(403)
      expect(errorCode(res.json()), url).toBe('LICENSE_FEATURE_NOT_ENTITLED')
    }
    expect(await s.store.count()).toBe(2)
  })

  it('lets an entitled vertical through to its handler', async () => {
    const { s, crm } = await bootThenLowerToCrm()
    const res = await s.fastify.inject({
      method: 'GET',
      url: `/v1/crm/contacts?connection_id=${crm}`,
      headers: admin,
    })
    expect(res.statusCode).not.toBe(403)
    expect(errorCode(res.json())).not.toMatch(/^LICENSE_/)
  })

  it('401 before 403: an unauthenticated caller learns nothing about the license', async () => {
    const { s } = await bootThenLowerToCrm()
    const res = await s.fastify.inject({
      method: 'GET',
      url: `/v1/accounting/invoices?connection_id=${randomUUID()}`,
    })
    expect(res.statusCode).toBe(401)
  })

  it('gates the sandbox mount the same way', async () => {
    const s = (server = await buildTestServer({
      license: signDevLicense({ features: ['mcp', 'vertical:crm'] }),
    }))
    const { plaintext } = await s.apiKeys.mint({
      tenantId: 'tenant-a',
      scopes: ['*'],
      mode: 'test',
    })
    const auth = { authorization: `Bearer ${plaintext}` }
    const conns = (
      await s.fastify.inject({ method: 'GET', url: '/test/v1/connections', headers: auth })
    ).json().data as Array<{ id: string; vertical: string }>
    const acc = conns.find((c) => c.vertical === 'accounting')!
    const crm = conns.find((c) => c.vertical === 'crm')!
    const refused = await s.fastify.inject({
      method: 'GET',
      url: `/test/v1/accounting/invoices?connection_id=${acc.id}`,
      headers: auth,
    })
    expect(refused.statusCode).toBe(403)
    expect(errorCode(refused.json())).toBe('LICENSE_FEATURE_NOT_ENTITLED')
    const allowed = await s.fastify.inject({
      method: 'GET',
      url: `/test/v1/crm/contacts?connection_id=${crm.id}`,
      headers: auth,
    })
    expect(allowed.statusCode).toBe(200)
  })

  it('every one of the nine plugins is gated (the sandbox mounts the same plugins, with fixtures for all nine)', async () => {
    expect(Object.keys(SANDBOX_LIST_ROUTE).sort()).toEqual([...VERTICALS].sort())
    const s = (server = await buildTestServer({ licenseVia: 'file' }))
    const { get } = await sandboxCaller(s)
    // Entitled, every route answers 200: the refusals below come from the gate alone.
    for (const [vertical, route] of Object.entries(SANDBOX_LIST_ROUTE)) {
      expect((await get(vertical, route)).statusCode, vertical).toBe(200)
    }
    writeFileSync(s.licenseFile, signDevLicense({ features: ['mcp'] }))
    await s.license.refresh()
    for (const [vertical, route] of Object.entries(SANDBOX_LIST_ROUTE)) {
      const res = await get(vertical, route)
      expect(res.statusCode, vertical).toBe(403)
      expect(res.json().error, vertical).toMatchObject({
        code: 'LICENSE_FEATURE_NOT_ENTITLED',
        feature: `vertical:${vertical}`,
      })
    }
  })

  it('gates the sandbox simulated sync like the live one, after its credential check', async () => {
    const s = (server = await buildTestServer({
      license: signDevLicense({ features: ['mcp', 'vertical:crm'] }),
    }))
    const { auth, idOf } = await sandboxCaller(s)
    const sync = (vertical: string, headers: Record<string, string> = auth) =>
      s.fastify.inject({
        method: 'POST',
        url: `/test/v1/${vertical}/sync?connection_id=${idOf(vertical)}&fast=true`,
        headers,
        payload: {},
      })
    expect((await sync('accounting', {})).statusCode).toBe(401)
    const refused = await sync('accounting')
    expect(refused.statusCode).toBe(403)
    expect(errorCode(refused.json())).toBe('LICENSE_FEATURE_NOT_ENTITLED')
    const listed = await s.fastify.inject({
      method: 'GET',
      url: `/test/v1/accounting/sync?connection_id=${idOf('accounting')}`,
      headers: auth,
    })
    expect(listed.statusCode).toBe(403)
    expect((await sync('crm')).statusCode).toBe(202)
  })

  it('[L7:G11] a renewed license opens the vertical without a restart', async () => {
    const { s, acc } = await bootThenLowerToCrm()
    const invoices = () =>
      s.fastify.inject({
        method: 'GET',
        url: `/v1/accounting/invoices?connection_id=${acc}`,
        headers: admin,
      })
    // Closed first, so a gate that kept the boot-time entitlements cannot pass.
    expect((await invoices()).statusCode).toBe(403)
    writeFileSync(s.licenseFile, signDevLicense())
    await s.license.refresh()
    const res = await invoices()
    expect(res.statusCode).not.toBe(403)
    expect(errorCode(res.json())).not.toMatch(/^LICENSE_/)
  })
})
