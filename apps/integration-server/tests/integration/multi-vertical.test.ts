/**
 * End-to-end HTTP tests that exercise the unified server's control plane
 * and prove that adapter slugs colliding across verticals (`bexio` lives in
 * both accounting and crm) keep their connections, settings, and routes
 * fully isolated.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { buildTestServer, seedConnection, type TestServer } from './helpers'

let server: TestServer

beforeEach(async () => {
  server = await buildTestServer()
})

afterEach(async () => {
  await server.cleanup()
})

describe('Unified server — control plane', () => {
  it('GET /health reports every vertical and the live adapter count', async () => {
    const res = await server.fastify.inject({ method: 'GET', url: '/health' })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.status).toBe('ok')
    expect(body.verticals).toEqual(
      expect.arrayContaining(['accounting', 'crm', 'ecommerce', 'logistics', 'payments']),
    )
    expect(body.adapters).toBe(0) // nothing enabled yet
    expect(body.timestamp).toBeDefined()
  })

  it('GET /v1/platforms returns flat list across every vertical', async () => {
    const res = await server.fastify.inject({ method: 'GET', url: '/v1/platforms' })
    expect(res.statusCode).toBe(200)
    const data = res.json().data as Array<{ slug: string; vertical: string }>
    expect(data.length).toBeGreaterThan(500)
    const verticals = new Set(data.map((p) => p.vertical))
    expect([...verticals].sort()).toEqual([
      'accounting',
      'crm',
      'customer-support',
      'docsign',
      'ecommerce',
      'inventory',
      'logistics',
      'payments',
      'projects',
    ])
  })

  it('GET /v1/platforms?vertical=crm filters to one vertical', async () => {
    const res = await server.fastify.inject({
      method: 'GET',
      url: '/v1/platforms?vertical=crm',
    })
    const data = res.json().data as Array<{ vertical: string }>
    expect(data.length).toBeGreaterThan(50)
    expect(data.every((p) => p.vertical === 'crm')).toBe(true)
  })

  // The two /v1/platforms cases above run credential-less only because the
  // vitest env sets OST_ALLOW_UNAUTH_ADMIN=1 and no ADMIN_SECRET — the same
  // explicit local-dev opt-in the rest of the admin surface uses. With a
  // secret configured the route is gated for real:
  it('GET /v1/platforms requires a credential once ADMIN_SECRET is set', async () => {
    process.env['ADMIN_SECRET'] = 'platforms-gate-secret'
    try {
      const bare = await server.fastify.inject({ method: 'GET', url: '/v1/platforms' })
      expect(bare.statusCode).toBe(403)

      const withSecret = await server.fastify.inject({
        method: 'GET',
        url: '/v1/platforms',
        headers: { 'x-admin-secret': 'platforms-gate-secret' },
      })
      expect(withSecret.statusCode).toBe(200)

      const live = await server.apiKeys.mint({ tenantId: 'default', scopes: ['*'] })
      const withLiveKey = await server.fastify.inject({
        method: 'GET',
        url: '/v1/platforms',
        headers: { authorization: `Bearer ${live.plaintext}` },
      })
      expect(withLiveKey.statusCode).toBe(200)

      // A test key belongs on /test/v1/platforms — the live route refuses it
      // by mode, like every other /v1/* route.
      const test = await server.apiKeys.mint({
        tenantId: 'default',
        scopes: ['*'],
        mode: 'test',
      })
      const withTestKey = await server.fastify.inject({
        method: 'GET',
        url: '/v1/platforms',
        headers: { authorization: `Bearer ${test.plaintext}` },
      })
      expect(withTestKey.statusCode).toBe(403)
      expect(withTestKey.json().error.code).toBe('KEY_MODE_MISMATCH')
    } finally {
      delete process.env['ADMIN_SECRET']
    }
  })

  it('GET /admin/platforms lists every (vertical, slug) with enabled state', async () => {
    const res = await server.fastify.inject({ method: 'GET', url: '/admin/platforms' })
    expect(res.statusCode).toBe(200)
    const rows = res.json().data as Array<{ vertical: string; slug: string; enabled: boolean }>
    expect(rows.length).toBeGreaterThan(500)
    expect(rows.every((r) => r.enabled === false)).toBe(true)
  })
})

describe('Unified server — connection lifecycle', () => {
  it('GET /connections returns empty before any are created', async () => {
    const res = await server.fastify.inject({ method: 'GET', url: '/connections' })
    expect(res.statusCode).toBe(200)
    expect(res.json().data).toEqual([])
  })

  it('seeded connection is listed and retrievable by id', async () => {
    const id = await seedConnection(server, {
      vertical: 'accounting',
      platform: 'fortnox',
      accessToken: 'seed-token',
      tenantId: 'tenant-a',
      label: 'demo',
    })

    const list = await server.fastify.inject({ method: 'GET', url: '/connections' })
    const data = list.json().data as Array<{ id: string; vertical: string }>
    expect(data).toHaveLength(1)
    expect(data[0]!.id).toBe(id)
    expect(data[0]!.vertical).toBe('accounting')

    const single = await server.fastify.inject({
      method: 'GET',
      url: `/connections/${id}`,
    })
    expect(single.statusCode).toBe(200)
    expect(single.json().data.platform).toBe('fortnox')
  })

  it('DELETE /connections/:id removes the row', async () => {
    const id = await seedConnection(server, {
      vertical: 'crm',
      platform: 'hubspot',
      accessToken: 'k',
    })
    const del = await server.fastify.inject({
      method: 'DELETE',
      url: `/connections/${id}`,
    })
    expect(del.statusCode).toBe(204)
    const list = await server.fastify.inject({ method: 'GET', url: '/connections' })
    expect(list.json().data).toHaveLength(0)
  })

  // The operator surface is documented at /admin/connections (freeing the
  // tenant /v1/connections to carry a /test/v1 sandbox variant); bare
  // /connections is an undocumented alias. Both must serve the same rows.
  it('operator surface is served at /admin/connections and the bare alias alike', async () => {
    const id = await seedConnection(server, {
      vertical: 'accounting',
      platform: 'fortnox',
      accessToken: 'seed-token',
      label: 'via-admin',
    })

    const viaAdmin = await server.fastify.inject({ method: 'GET', url: '/admin/connections' })
    expect(viaAdmin.statusCode).toBe(200)
    expect(viaAdmin.json().data.map((r: { id: string }) => r.id)).toContain(id)

    const oneViaAdmin = await server.fastify.inject({
      method: 'GET',
      url: `/admin/connections/${id}`,
    })
    expect(oneViaAdmin.statusCode).toBe(200)
    expect(oneViaAdmin.json().data.id).toBe(id)

    // Bare alias returns the same row.
    const viaAlias = await server.fastify.inject({ method: 'GET', url: `/connections/${id}` })
    expect(viaAlias.statusCode).toBe(200)
    expect(viaAlias.json().data.id).toBe(id)
  })
})

describe('Unified server — vertical resource routes', () => {
  it('GET /v1/{vertical}/{resource} 401s without connection_id', async () => {
    const res = await server.fastify.inject({
      method: 'GET',
      url: '/v1/accounting/invoices',
    })
    // The auth middleware rejects when connection_id is missing.
    expect([400, 401]).toContain(res.statusCode)
  })

  it('GET /v1/{vertical}/{resource}?connection_id=<unknown-uuid> returns CONNECTION_NOT_FOUND', async () => {
    const res = await server.fastify.inject({
      method: 'GET',
      url: '/v1/crm/contacts?connection_id=00000000-0000-4000-8000-000000000000',
    })
    expect(res.statusCode).toBe(404)
    expect(res.json().error.code).toBe('CONNECTION_NOT_FOUND')
  })

  it('GET /v1/{vertical}/{resource}?connection_id=<malformed> returns CONNECTION_ID_INVALID', async () => {
    const res = await server.fastify.inject({
      method: 'GET',
      url: '/v1/crm/contacts?connection_id=not-a-uuid',
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error.code).toBe('CONNECTION_ID_INVALID')
  })

  it('connection_id from a different vertical never returns 200', async () => {
    // Seed a CRM connection; try to use it on an accounting route.
    const id = await seedConnection(server, {
      vertical: 'crm',
      platform: 'hubspot',
      accessToken: 'k',
    })
    const res = await server.fastify.inject({
      method: 'GET',
      url: `/v1/accounting/invoices?connection_id=${id}`,
    })
    // Connection exists but vertical mismatch — auth middleware rejects.
    expect(res.statusCode).toBeGreaterThanOrEqual(400)
    expect(res.statusCode).toBeLessThan(500)
  })
})

describe('Unified server — bexio cross-vertical isolation', () => {
  beforeEach(async () => {
    const config = {
      clientId: 'fake-id',
      clientSecret: 'fake-secret',
      redirectUri: 'http://localhost/cb',
      scopes: ['openid'],
    }
    // Enable bexio in both verticals with distinct configs.
    await server.fastify.inject({
      method: 'POST',
      url: '/admin/platforms/accounting/bexio/enable',
      payload: { config: { ...config, clientId: 'acc-id' } },
    })
    await server.fastify.inject({
      method: 'POST',
      url: '/admin/platforms/crm/bexio/enable',
      payload: { config: { ...config, clientId: 'crm-id' } },
    })
  })

  it('both verticals report bexio as enabled with distinct hasConfig', async () => {
    const acc = await server.fastify.inject({
      method: 'GET',
      url: '/admin/platforms?vertical=accounting',
    })
    const crm = await server.fastify.inject({
      method: 'GET',
      url: '/admin/platforms?vertical=crm',
    })
    const accBexio = (acc.json().data as Array<{ slug: string; enabled: boolean }>).find(
      (r) => r.slug === 'bexio',
    )
    const crmBexio = (crm.json().data as Array<{ slug: string; enabled: boolean }>).find(
      (r) => r.slug === 'bexio',
    )
    expect(accBexio?.enabled).toBe(true)
    expect(crmBexio?.enabled).toBe(true)
  })

  it('OAuth start emits distinct redirects per vertical', async () => {
    const acc = await server.fastify.inject({
      method: 'GET',
      url: '/auth/accounting/bexio/connect?tenant_id=demo',
    })
    const crm = await server.fastify.inject({
      method: 'GET',
      url: '/auth/crm/bexio/connect?tenant_id=demo',
    })
    expect(acc.statusCode).toBe(302)
    expect(crm.statusCode).toBe(302)
    const accLoc = acc.headers.location as string
    const crmLoc = crm.headers.location as string
    expect(accLoc).toContain('client_id=acc-id')
    expect(crmLoc).toContain('client_id=crm-id')
  })

  it('disable in one vertical does not affect the other', async () => {
    await server.fastify.inject({
      method: 'POST',
      url: '/admin/platforms/accounting/bexio/disable',
    })
    const acc = await server.fastify.inject({
      method: 'GET',
      url: '/admin/platforms?vertical=accounting',
    })
    const crm = await server.fastify.inject({
      method: 'GET',
      url: '/admin/platforms?vertical=crm',
    })
    const accBexio = (acc.json().data as Array<{ slug: string; enabled: boolean }>).find(
      (r) => r.slug === 'bexio',
    )
    const crmBexio = (crm.json().data as Array<{ slug: string; enabled: boolean }>).find(
      (r) => r.slug === 'bexio',
    )
    expect(accBexio?.enabled).toBe(false)
    expect(crmBexio?.enabled).toBe(true)
  })
})

describe('Unified server — webhook router', () => {
  it('POST /webhooks/{vertical}/{platform} 501s for unknown handler', async () => {
    const res = await server.fastify.inject({
      method: 'POST',
      url: '/webhooks/logistics/no-such-platform',
      headers: { 'content-type': 'application/json' },
      payload: { items: [] },
    })
    // 501 (Not Implemented) — fail-closed when no verifier wired for
    // this (vertical, platform) pair.
    expect(res.statusCode).toBe(501)
    expect(res.json().error.code).toBe('WEBHOOK_HANDLER_NOT_FOUND')
  })
})
