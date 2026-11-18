/**
 * The sandbox over HTTP, on a real server.
 *
 * The adapter tests drive the methods directly; this drives the routes, which
 * is where the middleware, the derived connection id, the passthrough mount and
 * the error mapping all have to agree. It is the end-to-end acceptance test
 * for the sandbox HTTP surface.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { buildTestServer, type TestServer } from '../integration/helpers'
import { sandboxConnectionId } from '@opensteward/shared'

const TENANT = 'default'
const VERTICAL = 'accounting'

describe('/test/v1 sandbox', () => {
  let server: TestServer
  let testKey: string
  let liveKey: string
  let connectionId: string

  beforeAll(async () => {
    server = await buildTestServer()
    const test = await server.apiKeys.mint({ tenantId: TENANT, scopes: ['*'], mode: 'test' })
    const live = await server.apiKeys.mint({ tenantId: TENANT, scopes: ['*'] })
    testKey = test.plaintext
    liveKey = live.plaintext
    connectionId = sandboxConnectionId(TENANT, VERTICAL)
  })

  afterAll(async () => {
    await server?.cleanup()
  })

  const auth = (key: string) => ({ authorization: `Bearer ${key}` })
  const url = (path: string, id = connectionId) =>
    `/test/v1/${VERTICAL}${path}${path.includes('?') ? '&' : '?'}connection_id=${id}`

  it('lists the tenant’s sandbox connections without any OAuth', async () => {
    const res = await server.fastify.inject({
      method: 'GET',
      url: '/test/v1/connections',
      headers: auth(testKey),
    })
    expect(res.statusCode).toBe(200)
    const body = res.json() as { data: Array<{ id: string; vertical: string }> }
    expect(body.data.map((c) => c.vertical)).toContain(VERTICAL)
    expect(body.data.find((c) => c.vertical === VERTICAL)!.id).toBe(connectionId)
  })

  it('serves seeded records on a fresh deployment with zero adapters enabled', async () => {
    // The whole point of the feature: no operator setup, no upstream account.
    const res = await server.fastify.inject({
      method: 'GET',
      url: url('/invoices'),
      headers: auth(testKey),
    })
    expect(res.statusCode).toBe(200)
    const body = res.json() as { data: Array<{ id: string }> }
    expect(body.data.length).toBeGreaterThan(0)
    expect(body.data[0]!.id).toBe('inv_1042')
  })

  it('serves the documented record by its documented id', async () => {
    const res = await server.fastify.inject({
      method: 'GET',
      url: url('/invoices/inv_1042'),
      headers: auth(testKey),
    })
    expect(res.statusCode).toBe(200)
    expect((res.json() as { data: { id: string } }).data.id).toBe('inv_1042')
  })

  it('round-trips a write: POST then GET', async () => {
    const created = await server.fastify.inject({
      method: 'POST',
      url: url('/invoices'),
      headers: auth(testKey),
      payload: { invoiceNumber: 'INV-ROUNDTRIP' },
    })
    expect(created.statusCode).toBe(201)
    const id = (created.json() as { data: { id: string } }).data.id
    const fetched = await server.fastify.inject({
      method: 'GET',
      url: url(`/invoices/${id}`),
      headers: auth(testKey),
    })
    expect(fetched.statusCode).toBe(200)
    expect((fetched.json() as { data: { invoiceNumber: string } }).data.invoiceNumber).toBe(
      'INV-ROUNDTRIP',
    )
  })

  it('404s an unknown record rather than 500ing', async () => {
    const res = await server.fastify.inject({
      method: 'GET',
      url: url('/invoices/does-not-exist'),
      headers: auth(testKey),
    })
    expect(res.statusCode).toBe(404)
    expect((res.json() as { error: { code: string } }).error.code).toBe('RESOURCE_NOT_FOUND')
  })

  it('refuses a live key on /test/v1/*', async () => {
    const res = await server.fastify.inject({
      method: 'GET',
      url: url('/invoices'),
      headers: auth(liveKey),
    })
    expect(res.statusCode).toBe(403)
    expect((res.json() as { error: { code: string } }).error.code).toBe('KEY_MODE_MISMATCH')
  })

  it('refuses a test key on the live /v1/* surface', async () => {
    const res = await server.fastify.inject({
      method: 'GET',
      url: `/v1/${VERTICAL}/invoices?connection_id=${connectionId}`,
      headers: auth(testKey),
    })
    expect(res.statusCode).toBe(403)
    expect((res.json() as { error: { code: string } }).error.code).toBe('KEY_MODE_MISMATCH')
  })

  it('refuses another tenant’s sandbox connection id', async () => {
    // The whitelist is recomputed from the verified key, so this cannot pass.
    const res = await server.fastify.inject({
      method: 'GET',
      url: url('/invoices', sandboxConnectionId('someone-else', VERTICAL)),
      headers: auth(testKey),
    })
    expect(res.statusCode).toBe(403)
    expect((res.json() as { error: { code: string } }).error.code).toBe('CONNECTION_FORBIDDEN')
  })

  it('refuses an arbitrary live-looking connection UUID', async () => {
    const res = await server.fastify.inject({
      method: 'GET',
      url: url('/invoices', '11111111-2222-4333-8444-555555555555'),
      headers: auth(testKey),
    })
    expect(res.statusCode).toBe(403)
  })

  it('requires a connection_id, and says where to find one', async () => {
    const res = await server.fastify.inject({
      method: 'GET',
      url: `/test/v1/${VERTICAL}/invoices`,
      headers: auth(testKey),
    })
    expect(res.statusCode).toBe(400)
    expect((res.json() as { error: { message: string } }).error.message).toContain(
      '/test/v1/connections',
    )
  })

  it('mounts the SIMULATED /sync — a job, never an upstream call', async () => {
    // The sandbox simulates the sync lifecycle (tests/sandbox/sync.test.ts
    // owns the details); here we only pin that the route exists and answers
    // with a job envelope.
    const res = await server.fastify.inject({
      method: 'POST',
      url: url('/sync') + '&fast=true',
      headers: auth(testKey),
    })
    expect(res.statusCode).toBe(202)
    expect((res.json() as { data: { platform: string } }).data.platform).toBe('sandbox')
  })

  it('resets a tenant’s sandbox, and reseeds on the next read', async () => {
    await server.fastify.inject({
      method: 'POST',
      url: url('/invoices'),
      headers: auth(testKey),
      payload: { invoiceNumber: 'INV-TEMP' },
    })
    const reset = await server.fastify.inject({
      method: 'DELETE',
      url: '/test/v1/reset',
      headers: auth(testKey),
    })
    expect(reset.statusCode).toBe(200)
    expect((reset.json() as { data: { deleted: number } }).data.deleted).toBeGreaterThan(0)

    const after = await server.fastify.inject({
      method: 'GET',
      url: url('/invoices'),
      headers: auth(testKey),
    })
    const body = after.json() as { data: Array<{ invoiceNumber?: string }> }
    expect(body.data.length).toBeGreaterThan(0)
    expect(body.data.some((i) => i.invoiceNumber === 'INV-TEMP')).toBe(false)
  })

  it('rejects an unauthenticated request', async () => {
    const res = await server.fastify.inject({ method: 'GET', url: url('/invoices') })
    expect(res.statusCode).toBe(401)
  })
})
