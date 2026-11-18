import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { writeFileSync } from 'node:fs'
import { buildTestServer, seedConnection, type TestServer } from '../integration/helpers'
import { signDevLicense } from './dev-license'

/**
 * A license refusal is never replayed under an Idempotency-Key (P6: "a stale
 * cache never refuses"). The idempotency middleware sits on the root, ahead of
 * every vertical plugin's auth middleware, write gate and vertical gate; it
 * used to claim the key first and keep whatever came back for 24 h, so a
 * client retrying one logical write under one key was refused long after the
 * operator freed a slot or renewed — and the same request without the key
 * went through.
 */

const ADMIN = 'idem-admin-secret'
const admin = { 'x-admin-secret': ADMIN }
let server: TestServer | undefined
beforeEach(() => {
  process.env['ADMIN_SECRET'] = ADMIN // the auth middleware reads it when the server is built
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
/** bexio has no createInvoice: a write the gates let through reaches the handler and answers 501. */
const postInvoice = (s: TestServer, id: string, key?: string) =>
  s.fastify.inject({
    method: 'POST',
    url: `/v1/accounting/invoices?connection_id=${id}`,
    headers: { ...admin, ...(key ? { 'idempotency-key': key } : {}) },
    payload: {},
  })
const replayed = (res: { headers: Record<string, unknown> }): boolean =>
  res.headers['idempotency-replayed'] === 'true'

/** Two bexio connections under limit(5), then the license lowered to 1: the later one is read-only. */
async function overTheLimit(): Promise<{ s: TestServer; writable: string; readOnly: string }> {
  const s = (server = await buildTestServer({ license: limit(5), licenseVia: 'file' }))
  await enableBexio(s)
  for (const label of ['a', 'b']) {
    await seedConnection(s, { vertical: 'accounting', platform: 'bexio', accessToken: 't', label })
  }
  const [writable, readOnly] = await s.store.listIdsInCreationOrder()
  writeFileSync(s.licenseFile, limit(1))
  await s.license.refresh()
  return { s, writable: writable!, readOnly: readOnly! }
}

describe('Idempotency-Key never replays a license refusal (P6)', () => {
  it('the write gate: once a slot is freed, a retry under the same key is let through', async () => {
    const { s, writable, readOnly } = await overTheLimit()
    const refused = await postInvoice(s, readOnly, 'k-1')
    expect(refused.statusCode).toBe(403)
    expect(refused.json().error).toMatchObject({ code: 'LICENSE_LIMIT_EXCEEDED', used: 2 })

    const deleted = await s.fastify.inject({
      method: 'DELETE',
      url: `/admin/connections/${writable}`,
      headers: admin,
    })
    expect(deleted.statusCode).toBe(204)

    const retry = await postInvoice(s, readOnly, 'k-1')
    expect(replayed(retry)).toBe(false)
    expect(retry.statusCode).not.toBe(403)
    expect(errorCode(retry.json())).not.toMatch(/^LICENSE_/)
  })

  it('the write gate: once the license is renewed, a retry under the same key is let through', async () => {
    const { s, readOnly } = await overTheLimit()
    expect((await postInvoice(s, readOnly, 'k-renew')).statusCode).toBe(403)

    writeFileSync(s.licenseFile, limit(50))
    await s.license.refresh()

    const retry = await postInvoice(s, readOnly, 'k-renew')
    expect(replayed(retry)).toBe(false)
    expect(retry.statusCode).not.toBe(403)
    expect(errorCode(retry.json())).not.toMatch(/^LICENSE_/)
  })

  it('the vertical gate: once the vertical is entitled again, a retry under the same key is let through', async () => {
    const s = (server = await buildTestServer({ license: signDevLicense(), licenseVia: 'file' }))
    await enableBexio(s)
    const conn = await seedConnection(s, {
      vertical: 'accounting',
      platform: 'bexio',
      accessToken: 't',
      label: 'a',
    })
    // A license without accounting: the connection stays, the vertical gate refuses.
    writeFileSync(s.licenseFile, signDevLicense({ features: ['mcp', 'vertical:crm'] }))
    await s.license.refresh()

    const refused = await postInvoice(s, conn, 'k-feature')
    expect(refused.statusCode).toBe(403)
    expect(errorCode(refused.json())).toBe('LICENSE_FEATURE_NOT_ENTITLED')

    writeFileSync(s.licenseFile, signDevLicense())
    await s.license.refresh()

    const retry = await postInvoice(s, conn, 'k-feature')
    expect(replayed(retry)).toBe(false)
    expect(retry.statusCode).not.toBe(403)
    expect(errorCode(retry.json())).not.toMatch(/^LICENSE_/)
  })

  it('POST /auth/:v/:p/connect: after "export, delete, then reconnect", the same key connects', async () => {
    const s = (server = await buildTestServer({ license: null })) // community: one connection
    await s.registry.enable('logistics', 'janio')
    const adapter = s.registry.get('logistics', 'janio') as unknown as {
      credentialFields(): Array<{ name: string }>
      exchangeCredentials: (...a: unknown[]) => unknown
    }
    const field = adapter.credentialFields()[0]!.name
    vi.spyOn(adapter, 'exchangeCredentials').mockResolvedValue({ accessToken: 'janio-key' })
    const only = await seedConnection(s, {
      vertical: 'crm',
      platform: 'hubspot',
      accessToken: 't',
      label: 'only',
    })
    const connect = () =>
      s.fastify.inject({
        method: 'POST',
        url: '/auth/logistics/janio/connect',
        headers: { ...admin, 'idempotency-key': 'k-connect' },
        payload: { fields: { [field]: 'key-1' }, label: 'second' },
      })

    const refused = await connect()
    expect(refused.statusCode).toBe(403)
    expect(errorCode(refused.json())).toBe('LICENSE_LIMIT_EXCEEDED')

    const deleted = await s.fastify.inject({
      method: 'DELETE',
      url: `/admin/connections/${only}`,
      headers: admin,
    })
    expect(deleted.statusCode).toBe(204)

    const retry = await connect()
    expect(replayed(retry)).toBe(false)
    expect(errorCode(retry.json())).not.toMatch(/^LICENSE_/)
    expect(retry.statusCode).toBe(200)
    expect(await s.store.count()).toBe(1)
    // The connection that was made is what the key replays from now on.
    const again = await connect()
    expect(replayed(again)).toBe(true)
    expect(again.json()).toEqual(retry.json())
    expect(await s.store.count()).toBe(1)
  })
})
