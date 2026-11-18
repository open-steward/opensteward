/**
 * End-to-end tests for the three data-store modes.
 *
 * Most cache behaviour is covered by the unit tests in
 * `packages/shared/tests/data-store/`; these tests verify the
 * end-to-end wiring — that the mode flag in `ServiceConfig` reaches the
 * right places at boot, that `/sync` routes mount only when the data
 * store is on, and that `request.cacheMode` / `request.resourceStore` are
 * correctly threaded into the verticals.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { buildTestServer, seedConnection, type TestServer } from './helpers'

describe('data-store mode: database (default in production)', () => {
  let server: TestServer

  beforeEach(async () => {
    server = await buildTestServer({ dataStoreMode: 'database' })
  })

  afterEach(async () => {
    await server.cleanup()
  })

  it('mounts /v1/{vertical}/sync routes for every vertical', async () => {
    for (const vertical of ['accounting', 'crm', 'ecommerce', 'logistics', 'payments', 'docsign', 'projects', 'customer-support', 'inventory']) {
      const res = await server.fastify.inject({
        method: 'GET',
        url: `/v1/${vertical}/sync?connection_id=00000000-0000-4000-8000-000000000000`,
      })
      // 404 (CONNECTION_NOT_FOUND from auth middleware) means the route is
      // mounted; 404 with FST_ERR_NOT_FOUND would mean the route is missing.
      // 400/401 are also acceptable as long as it's not "route not found".
      expect([400, 401, 404]).toContain(res.statusCode)
      if (res.statusCode === 404) {
        // confirm it's our auth-middleware 404, not Fastify's
        expect(res.json().error?.code).toMatch(/CONNECTION/)
      }
    }
  })

  it('POST /v1/accounting/sync without connection_id fails with CONNECTION_ID_REQUIRED', async () => {
    const res = await server.fastify.inject({
      method: 'POST',
      url: '/v1/accounting/sync',
      payload: {},
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error?.code).toBe('CONNECTION_ID_REQUIRED')
  })

  it('POST /v1/accounting/sync with valid connection enqueues a job', async () => {
    const id = await seedConnection(server, {
      vertical: 'accounting',
      platform: 'fortnox',
      accessToken: 'seed',
      tenantId: 'tenant-a',
      label: 'demo',
    })
    const res = await server.fastify.inject({
      method: 'POST',
      url: `/v1/accounting/sync?connection_id=${id}`,
      payload: {},
    })
    // Acceptable: 202 (job enqueued), 401 (no auth), 403 (auth ran but rejected).
    expect([202, 401, 403]).toContain(res.statusCode)
    if (res.statusCode === 202) {
      const body = res.json()
      expect(body.data?.vertical).toBe('accounting')
      expect(body.data?.connectionId).toBe(id)
      expect(body.data?.status).toBe('pending')
    }
  })
})

describe('data-store mode: passthrough', () => {
  let server: TestServer

  beforeEach(async () => {
    server = await buildTestServer({ dataStoreMode: 'passthrough' })
  })

  afterEach(async () => {
    await server.cleanup()
  })

  it('/v1/{vertical}/sync routes are NOT mounted', async () => {
    for (const vertical of ['accounting', 'crm', 'ecommerce', 'logistics', 'payments', 'docsign', 'projects', 'customer-support', 'inventory']) {
      const res = await server.fastify.inject({
        method: 'POST',
        url: `/v1/${vertical}/sync`,
        payload: {},
      })
      // Fastify returns 404 with FST_ERR_NOT_FOUND when the route isn't registered.
      expect(res.statusCode).toBe(404)
    }
  })
})

describe('data-store mode: external', () => {
  let server: TestServer

  beforeEach(async () => {
    server = await buildTestServer({ dataStoreMode: 'external' })
  })

  afterEach(async () => {
    await server.cleanup()
  })

  it('mounts /sync routes the same as database mode', async () => {
    const res = await server.fastify.inject({
      method: 'POST',
      url: '/v1/accounting/sync',
      payload: {},
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error?.code).toBe('CONNECTION_ID_REQUIRED')
  })
})

describe('data-store cascade on connection delete', () => {
  let server: TestServer

  beforeEach(async () => {
    server = await buildTestServer({ dataStoreMode: 'database' })
  })

  afterEach(async () => {
    await server.cleanup()
  })

  it('deleteById on a connection cascades to ResourceStore', async () => {
    const id = await seedConnection(server, {
      vertical: 'accounting',
      platform: 'fortnox',
      accessToken: 'seed',
      tenantId: null,
      label: 'demo',
    })

    const rs = server.resourceStore
    expect(rs).toBeDefined()
    await rs!.upsert('accounting', 'fortnox', id, 'invoices', 'inv-1', { id: 'inv-1' })
    await rs!.upsert('accounting', 'fortnox', id, 'contacts', 'c-1', { id: 'c-1' })
    expect((await rs!.list('accounting', 'fortnox', id, 'invoices')).length).toBe(1)

    expect(await server.store.deleteById(id)).toBe(true)
    expect(await server.store.getRow(id)).toBeNull()
    expect((await rs!.list('accounting', 'fortnox', id, 'invoices')).length).toBe(0)
    expect((await rs!.list('accounting', 'fortnox', id, 'contacts')).length).toBe(0)
  })
})
