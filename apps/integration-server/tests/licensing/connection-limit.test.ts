import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { writeFileSync } from 'node:fs'
import { buildTestServer, seedConnection, type TestServer } from '../integration/helpers'
import { signDevLicense } from './dev-license'

const ADMIN = 'limit-admin-secret'
const admin = { 'x-admin-secret': ADMIN }
let server: TestServer | undefined
beforeEach(() => {
  process.env['ADMIN_SECRET'] = ADMIN
})
afterEach(async () => {
  await server?.cleanup()
  server = undefined
  delete process.env['ADMIN_SECRET']
  vi.restoreAllMocks()
})

const limit = (connections: number) => signDevLicense({ limits: { connections, tenants: 1 } })
const errorCode = (body: unknown): string => {
  const e = (body as { error?: unknown }).error
  return typeof e === 'object' && e !== null ? String((e as { code?: unknown }).code ?? '') : ''
}
const stateOf = (url: string): string => new URL(url).searchParams.get('state')!
async function enableBexio(s: TestServer): Promise<void> {
  const res = await s.fastify.inject({
    method: 'POST',
    url: '/admin/platforms/accounting/bexio/enable',
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
type JanioAdapter = {
  credentialFields(): Array<{ name: string }>
  exchangeCredentials: (...a: unknown[]) => unknown
}
async function enableJanio(s: TestServer): Promise<{ field: string; adapter: JanioAdapter }> {
  // `enable` is typed as sync but resolves an adapter (auth-connect-post.test.ts).
  const enabled = (await (s.registry.enable('logistics', 'janio') as never)) as JanioAdapter
  // Spy on the instance the routes resolve, as the journeys do for bexio.
  const adapter = s.registry.get('logistics', 'janio') as unknown as JanioAdapter
  return { field: enabled.credentialFields()[0]!.name, adapter }
}
async function cacheInvoice(s: TestServer, id: string): Promise<void> {
  const v = s.normalizerVersion('accounting', 'bexio')
  await s.resourceStore!.upsert(
    'accounting',
    'bexio',
    id,
    'invoices',
    'inv-1',
    { id: 'inv-1', total: 4200 },
    v,
  )
  await s.resourceStore!.markCollectionComplete('accounting', 'bexio', id, 'invoices', v)
}
const readInvoices = (s: TestServer, id: string) =>
  s.fastify.inject({
    method: 'GET',
    url: `/v1/accounting/invoices?connection_id=${id}`,
    headers: admin,
  })
const postInvoice = (s: TestServer, id: string) =>
  s.fastify.inject({
    method: 'POST',
    url: `/v1/accounting/invoices?connection_id=${id}`,
    headers: admin,
    payload: {},
  })
async function connectSession(
  s: TestServer,
  verticals = ['accounting'],
  extra: { endUserId?: string } = {},
): Promise<string> {
  const res = await s.fastify.inject({
    method: 'POST',
    url: '/admin/connect-sessions',
    headers: admin,
    payload: { tenantId: 'tenant-a', label: 'Onboard Acme', allowedVerticals: verticals, ...extra },
  })
  expect(res.statusCode).toBe(201)
  return (res.json().data as { token: string }).token
}
/** An end user in tenant-a and an eut_ token for them that may write (no mcp:read). */
async function endUserWithToken(s: TestServer): Promise<{ endUserId: string; eut: string }> {
  const eu = await s.fastify.inject({
    method: 'POST',
    url: '/admin/end-users',
    headers: admin,
    payload: { tenantId: 'tenant-a', email: 'agent@example.test' },
  })
  expect(eu.statusCode).toBe(201)
  const endUserId = (eu.json().data as { id: string }).id
  const minted = await s.fastify.inject({
    method: 'POST',
    url: '/admin/end-user-tokens',
    headers: admin,
    payload: { endUserId, tenantId: 'tenant-a', scopes: ['*'] },
  })
  expect(minted.statusCode).toBe(201)
  return { endUserId, eut: (minted.json().data as { plaintext: string }).plaintext }
}
/** A bexio connection linked to the end user the way /v1/me requires: a consumed Connect Link. */
async function connectViaLink(s: TestServer, endUserId: string): Promise<void> {
  const token = await connectSession(s, ['accounting'], { endUserId })
  const start = await s.fastify.inject({
    method: 'POST',
    url: `/connect/sessions/${token}/oauth-start`,
    payload: { vertical: 'accounting', platform: 'bexio' },
  })
  expect(start.statusCode).toBe(200)
  const state = stateOf((start.json().data as { redirectUrl: string }).redirectUrl)
  const cb = await s.fastify.inject({
    method: 'GET',
    url: `/auth/accounting/bexio/callback?code=c&state=${state}`,
  })
  expect(cb.statusCode).toBe(302)
  expect(cb.headers.location).toBe(`/connect/${token}/done`)
}

describe('connection limit (P5/P6)', () => {
  it('refuses the connection past the limit at the store chokepoint', async () => {
    const s = (server = await buildTestServer({ license: limit(2) }))
    await seedConnection(s, { vertical: 'crm', platform: 'hubspot', accessToken: 't', label: 'a' })
    await seedConnection(s, { vertical: 'crm', platform: 'hubspot', accessToken: 't', label: 'b' })
    await expect(
      seedConnection(s, { vertical: 'crm', platform: 'hubspot', accessToken: 't', label: 'c' }),
    ).rejects.toMatchObject({
      name: 'LicenseError',
      code: 'LICENSE_LIMIT_EXCEEDED',
      statusCode: 403,
    })
    expect(await s.store.count()).toBe(2)
  })

  it('[L7:G08] community with one connection: POST /auth/:v/:p/connect is refused before the credential exchange, with the full body', async () => {
    const s = (server = await buildTestServer({ license: null }))
    const { field, adapter } = await enableJanio(s)
    await seedConnection(s, {
      vertical: 'crm',
      platform: 'hubspot',
      accessToken: 't',
      label: 'only',
    })
    const exchange = vi.spyOn(adapter, 'exchangeCredentials')
    const res = await s.fastify.inject({
      method: 'POST',
      url: '/auth/logistics/janio/connect',
      headers: admin,
      payload: { fields: { [field]: 'key-1' }, label: 'second' },
    })
    expect(res.statusCode).toBe(403)
    expect(res.json().error).toMatchObject({
      code: 'LICENSE_LIMIT_EXCEEDED',
      limitKey: 'connections',
      limit: 1,
      used: 1,
    })
    expect(exchange).not.toHaveBeenCalled()
    expect(await s.store.count()).toBe(1)
  })

  it('an unentitled vertical is refused at create, through the store and through the route', async () => {
    const s = (server = await buildTestServer({
      license: signDevLicense({ features: ['mcp', 'vertical:crm'] }),
    }))
    const { field } = await enableJanio(s)
    await expect(
      seedConnection(s, { vertical: 'logistics', platform: 'janio', accessToken: 't', label: 'x' }),
    ).rejects.toMatchObject({
      code: 'LICENSE_FEATURE_NOT_ENTITLED',
    })
    const res = await s.fastify.inject({
      method: 'POST',
      url: '/auth/logistics/janio/connect',
      headers: admin,
      payload: { fields: { [field]: 'key-1' } },
    })
    expect(res.statusCode).toBe(403)
    expect(res.json().error).toMatchObject({
      code: 'LICENSE_FEATURE_NOT_ENTITLED',
      feature: 'vertical:logistics',
    })
    expect(await s.store.count()).toBe(0)
  })

  it('OAuth start is unauthenticated: refused with a generic body; the details go to the log only (review #6)', async () => {
    const s = (server = await buildTestServer({ license: limit(1) }))
    await enableBexio(s)
    await seedConnection(s, { vertical: 'crm', platform: 'hubspot', accessToken: 't', label: 'a' })
    const res = await s.fastify.inject({ method: 'GET', url: '/auth/accounting/bexio/connect' })
    expect(res.statusCode).toBe(403)
    expect(res.headers.location).toBeUndefined()
    const { error } = res.json() as { error: Record<string, unknown> }
    expect(Object.keys(error).sort()).toEqual(['code', 'message'])
    expect(error['code']).toBe('LICENSE_LIMIT_EXCEEDED')
    expect(String(error['message'])).not.toMatch(/\d/)
  })

  it('reconnecting at the limit is refused at OAuth start, saying export, delete, reconnect; the cached rows are untouched (Review Focus #5)', async () => {
    const s = (server = await buildTestServer({ dataStoreMode: 'database', license: null })) // community: 1 connection
    await enableBexio(s)
    const id = await seedConnection(s, {
      vertical: 'accounting',
      platform: 'bexio',
      accessToken: 'expired',
      label: 'acme',
    })
    await cacheInvoice(s, id)
    const res = await s.fastify.inject({ method: 'GET', url: '/auth/accounting/bexio/connect' })
    expect(res.statusCode).toBe(403)
    expect(res.json().error.code).toBe('LICENSE_LIMIT_EXCEEDED')
    expect(res.json().error.message).toMatch(/export.*delete.*reconnect/)
    const read = await readInvoices(s, id)
    expect(read.statusCode).toBe(200)
    expect((read.json().data as Array<{ id: string }>).map((r) => r.id)).toContain('inv-1')
    expect(await s.store.count()).toBe(1)
  })

  it('a callback that loses the race (an API caller) is refused with a generic body; nothing is stored, the cached rows are untouched (Review Focus #5)', async () => {
    const s = (server = await buildTestServer({ dataStoreMode: 'database', license: limit(2) }))
    await enableBexio(s)
    const first = await seedConnection(s, {
      vertical: 'accounting',
      platform: 'bexio',
      accessToken: 't',
      label: 'acme',
    })
    await cacheInvoice(s, first)
    const start = await s.fastify.inject({ method: 'GET', url: '/auth/accounting/bexio/connect' })
    expect(start.statusCode).toBe(302)
    const state = stateOf(start.headers.location as string)
    await seedConnection(s, {
      vertical: 'crm',
      platform: 'hubspot',
      accessToken: 't',
      label: 'other',
    }) // the slot is gone
    vi.spyOn(s.registry.get('accounting', 'bexio')!, 'exchangeCode').mockResolvedValue({
      accessToken: 'tok',
    })
    const cb = await s.fastify.inject({
      method: 'GET',
      url: `/auth/accounting/bexio/callback?code=c&state=${state}`,
    })
    expect(cb.statusCode).toBe(403)
    expect(Object.keys(cb.json().error).sort()).toEqual(['code', 'message'])
    expect(await s.store.count()).toBe(2)
    expect((await readInvoices(s, first)).json().data.map((r: { id: string }) => r.id)).toContain(
      'inv-1',
    )
  })

  it('Connect Link oauth-start: refused before the redirect, with a customer-safe message', async () => {
    const s = (server = await buildTestServer({ license: limit(1) }))
    await enableBexio(s)
    await seedConnection(s, { vertical: 'crm', platform: 'hubspot', accessToken: 't', label: 'a' })
    const token = await connectSession(s)
    const res = await s.fastify.inject({
      method: 'POST',
      url: `/connect/sessions/${token}/oauth-start`,
      payload: { vertical: 'accounting', platform: 'bexio' },
    })
    expect(res.statusCode).toBe(403)
    expect(res.json().error.code).toBe('LICENSE_LIMIT_EXCEEDED')
    expect(res.json().error.message).not.toMatch(/license/i)
  })

  it('Connect Link credentials: refused before the credential exchange', async () => {
    const s = (server = await buildTestServer({ license: limit(1) }))
    const { field, adapter } = await enableJanio(s)
    await seedConnection(s, { vertical: 'crm', platform: 'hubspot', accessToken: 't', label: 'a' })
    const token = await connectSession(s, ['logistics'])
    const exchange = vi.spyOn(adapter, 'exchangeCredentials')
    const res = await s.fastify.inject({
      method: 'POST',
      url: `/connect/sessions/${token}/credentials`,
      payload: { vertical: 'logistics', platform: 'janio', fields: { [field]: 'k' } },
    })
    expect(res.statusCode).toBe(403)
    expect(res.json().error.code).toBe('LICENSE_LIMIT_EXCEEDED')
    expect(res.json().error.message).not.toMatch(/license/i)
    expect(exchange).not.toHaveBeenCalled()
    expect(await s.store.count()).toBe(1)
  })

  it('a Connect Link callback that loses the race lands the customer back on their link page', async () => {
    const s = (server = await buildTestServer({ license: limit(1) }))
    await enableBexio(s)
    const token = await connectSession(s)
    const start = await s.fastify.inject({
      method: 'POST',
      url: `/connect/sessions/${token}/oauth-start`,
      payload: { vertical: 'accounting', platform: 'bexio' },
    })
    expect(start.statusCode).toBe(200)
    const state = stateOf((start.json().data as { redirectUrl: string }).redirectUrl)
    await seedConnection(s, {
      vertical: 'crm',
      platform: 'hubspot',
      accessToken: 't',
      label: 'raced',
    })
    vi.spyOn(s.registry.get('accounting', 'bexio')!, 'exchangeCode').mockResolvedValue({
      accessToken: 'tok',
    })
    const cb = await s.fastify.inject({
      method: 'GET',
      url: `/auth/accounting/bexio/callback?code=c&state=${state}`,
    })
    expect(cb.statusCode).toBe(302)
    expect(cb.headers.location).toBe(`/connect/${token}?notice=capacity`)
    expect(await s.store.count()).toBe(1)
    const page = await s.fastify.inject({ method: 'GET', url: `/connect/${token}?notice=capacity` })
    expect(page.statusCode).toBe(200)
    expect(page.body).toContain('cannot accept new connections right now')
  })

  it('[L7:G13] after a lowered license: the oldest N keep writing, the rest are read-only; reads and syncs work; nothing is deleted', async () => {
    const s = (server = await buildTestServer({
      dataStoreMode: 'database',
      license: limit(5),
      licenseVia: 'file',
    }))
    await enableBexio(s)
    const a = await seedConnection(s, {
      vertical: 'accounting',
      platform: 'bexio',
      accessToken: 't',
      label: 'a',
    })
    const b = await seedConnection(s, {
      vertical: 'accounting',
      platform: 'bexio',
      accessToken: 't',
      label: 'b',
    })
    await cacheInvoice(s, a)
    await cacheInvoice(s, b)
    const [writable] = await s.store.listIdsInCreationOrder(1)
    const readOnly = writable === a ? b : a
    writeFileSync(s.licenseFile, limit(1))
    await s.license.refresh()

    const refused = await postInvoice(s, readOnly)
    expect(refused.statusCode).toBe(403)
    expect(refused.json().error).toMatchObject({
      code: 'LICENSE_LIMIT_EXCEEDED',
      connectionId: readOnly,
      limit: 1,
      used: 2,
    })
    const allowed = await postInvoice(s, writable!) // bexio has no createInvoice: the handler answers 501
    expect(allowed.statusCode).not.toBe(403)
    expect(errorCode(allowed.json())).not.toMatch(/^LICENSE_/)
    expect((await readInvoices(s, readOnly)).statusCode).toBe(200)
    const sync = await s.fastify.inject({
      method: 'POST',
      url: `/v1/accounting/sync?connection_id=${readOnly}`,
      headers: admin,
      payload: {},
    })
    expect(sync.statusCode).not.toBe(403)
    expect(errorCode(sync.json())).not.toMatch(/^LICENSE_/)
    expect(await s.store.count()).toBe(2)

    // Deleting the writable one frees the slot: the read-only connection writes again.
    expect(
      (
        await s.fastify.inject({
          method: 'DELETE',
          url: `/admin/connections/${writable}`,
          headers: admin,
        })
      ).statusCode,
    ).toBe(204)
    const after = await postInvoice(s, readOnly)
    expect(after.statusCode).not.toBe(403)
    expect(errorCode(after.json())).not.toMatch(/^LICENSE_/)
  })

  it('the write gate covers /v1/me too: an eut_ caller cannot write on a read-only connection (P6)', async () => {
    const s = (server = await buildTestServer({ license: limit(5), licenseVia: 'file' }))
    await enableBexio(s)
    const { endUserId, eut } = await endUserWithToken(s)
    vi.spyOn(s.registry.get('accounting', 'bexio')!, 'exchangeCode').mockResolvedValue({
      accessToken: 'tok',
    })
    await connectViaLink(s, endUserId)
    await connectViaLink(s, endUserId)
    const [writable, readOnly, ...rest] = await s.store.listIdsInCreationOrder()
    expect(rest).toEqual([])
    writeFileSync(s.licenseFile, limit(1))
    await s.license.refresh()

    const postAsEndUser = (id: string) =>
      s.fastify.inject({
        method: 'POST',
        url: `/v1/me/accounting/invoices?connection_id=${id}`,
        headers: { authorization: `Bearer ${eut}` },
        payload: {},
      })
    const refused = await postAsEndUser(readOnly!)
    expect(refused.statusCode).toBe(403)
    expect(refused.json().error).toMatchObject({
      code: 'LICENSE_LIMIT_EXCEEDED',
      connectionId: readOnly,
      limit: 1,
      used: 2,
    })
    // The same token on the writable connection reaches the handler (bexio has
    // no createInvoice: 501), so the refusal above is the write gate's alone.
    const allowed = await postAsEndUser(writable!)
    expect(allowed.statusCode).not.toBe(403)
    expect(errorCode(allowed.json())).not.toMatch(/^LICENSE_/)
    expect(await s.store.count()).toBe(2)
  })

  it('a refusal is re-checked against the database, so a slot freed where no listener fires is usable at once (Review Focus #4)', async () => {
    const s = (server = await buildTestServer({ license: limit(5), licenseVia: 'file' }))
    await enableBexio(s)
    const a = await seedConnection(s, {
      vertical: 'accounting',
      platform: 'bexio',
      accessToken: 't',
      label: 'a',
      tenantId: 't-1',
    })
    const b = await seedConnection(s, {
      vertical: 'accounting',
      platform: 'bexio',
      accessToken: 't',
      label: 'b',
      tenantId: 't-1',
    })
    const [writable] = await s.store.listIdsInCreationOrder(1)
    const readOnly = writable === a ? b : a
    writeFileSync(s.licenseFile, limit(1))
    await s.license.refresh()
    expect((await postInvoice(s, readOnly)).statusCode).toBe(403) // warms the cached allow-list
    // deleteByTenant fires no delete listener, so the guard's cache is NOT invalidated.
    expect(await s.store.deleteByTenant('t-1', writable!)).toBe(true)
    expect((await postInvoice(s, readOnly)).statusCode).not.toBe(403)
  })
})
