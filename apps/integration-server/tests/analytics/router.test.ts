/**
 * `/admin/analytics/*` — the route layer: admin guard, the SQLite 409, and
 * the scope rules (a principal may not exceed the caller's scope; PII needs
 * revealPii; principals outside the scope are invisible). The Postgres work
 * itself is covered by postgres.test.ts; here the service is a stub.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import { openDb, type DbHandle } from '@opensteward/shared'
import { createAnalyticsRouter, scopeExcess } from '../../src/analytics/router'
import {
  AnalyticsService,
  type CreatePrincipalInput,
  type PrincipalSecretResult,
} from '../../src/analytics/provisioner'
import type { PrincipalRecord } from '../../src/analytics/principals-store'
import { DATA_SCOPE_HEADER } from '../../src/data-access/scope'
import { fixtureCatalog } from './fixtures'

const ADMIN = 'analytics-admin-secret'
const OLD_ADMIN = process.env['ADMIN_SECRET']
const ALL = { tenants: '*', revealPii: true }

let app: FastifyInstance

function req(
  method: 'GET' | 'POST' | 'DELETE',
  url: string,
  scope: unknown = ALL,
  body?: unknown,
  secret: string | null = ADMIN,
) {
  return app.inject({
    method,
    url,
    headers: {
      ...(secret ? { 'x-admin-secret': secret } : {}),
      ...(scope === null ? {} : { [DATA_SCOPE_HEADER]: JSON.stringify(scope) }),
    },
    ...(body === undefined ? {} : { payload: body as object }),
  })
}

beforeEach(() => {
  process.env['ADMIN_SECRET'] = ADMIN
})
afterEach(async () => {
  await app?.close()
  if (OLD_ADMIN === undefined) delete process.env['ADMIN_SECRET']
  else process.env['ADMIN_SECRET'] = OLD_ADMIN
})

describe('on SQLite', () => {
  let handle: DbHandle
  beforeEach(async () => {
    handle = await openDb({ sqlitePath: ':memory:' })
    const service = await AnalyticsService.create({
      dialect: 'sqlite',
      handle,
      storeSecret: 'x'.repeat(40),
      config: { rolePrefix: 'os', readHost: 'db.example' },
      catalog: fixtureCatalog(),
    })
    app = Fastify({ logger: false })
    await app.register(createAnalyticsRouter({ service }))
    await app.ready()
  })
  afterEach(async () => {
    await handle.close()
  })

  it('status says sqlite / manual / not provisioned', async () => {
    const r = await req('GET', '/admin/analytics/status', null)
    expect(r.statusCode).toBe(200)
    expect(r.json().data).toMatchObject({
      backend: 'sqlite',
      mode: 'manual',
      provisioned: false,
      version: null,
      readHost: 'db.example',
      schemas: { masked: 'os_analytics', pii: 'os_analytics_pii' },
    })
  })

  it.each([
    ['GET', '/admin/analytics/catalog'],
    ['POST', '/admin/analytics/provision'],
    ['GET', '/admin/analytics/provision-script'],
    ['GET', '/admin/analytics/principals'],
    ['POST', '/admin/analytics/principals'],
    ['DELETE', '/admin/analytics/principals/abc'],
    ['POST', '/admin/analytics/principals/abc/rotate'],
  ] as const)('%s %s → 409 POSTGRES_REQUIRED', async (method, url) => {
    const r = await req(method, url, ALL, method === 'POST' ? {} : undefined)
    expect(r.statusCode).toBe(409)
    expect(r.json().error.code).toBe('POSTGRES_REQUIRED')
  })

  it('is behind the admin guard', async () => {
    const r = await req('GET', '/admin/analytics/status', null, undefined, 'wrong')
    expect(r.statusCode).toBe(403)
    expect(
      (await req('GET', '/admin/analytics/status', null, undefined, null)).statusCode,
    ).toBeGreaterThanOrEqual(401)
  })
})

// ── Postgres behaviour, stubbed ──────────────────────────────────────────

function record(over: Partial<PrincipalRecord> = {}): PrincipalRecord {
  return {
    id: 'p1',
    roleName: 'os_sql_bi_000000',
    label: 'BI',
    pii: false,
    scope: { tenants: ['t1'] },
    connectionLimit: 5,
    createdBy: null,
    createdAt: 1_700_000_000_000,
    expiresAt: null,
    revokedAt: null,
    lastRotatedAt: null,
    ...over,
  }
}

function stub(principals: PrincipalRecord[], mode: 'managed' | 'manual' = 'managed') {
  const calls: {
    created: CreatePrincipalInput[]
    provisioned: number
    rotated: string[]
    revoked: string[]
  } = {
    created: [],
    provisioned: 0,
    rotated: [],
    revoked: [],
  }
  const service = {
    backend: 'postgres',
    mode,
    catalog: fixtureCatalog(),
    readHost: 'replica.example',
    status: async () => ({ backend: 'postgres', mode }),
    provision: async () => {
      calls.provisioned++
      return { changed: true, version: 1 }
    },
    provisionScript: async () => 'BEGIN;\nCOMMIT;\n',
    listPrincipals: async () => principals,
    getPrincipal: async (id: string) => principals.find((p) => p.id === id) ?? null,
    createPrincipal: async (input: CreatePrincipalInput): Promise<PrincipalSecretResult> => {
      calls.created.push(input)
      const principal = record({
        id: 'new',
        label: input.label,
        pii: input.pii,
        scope: input.scope,
      })
      return mode === 'manual'
        ? { principal, password: 'pw', script: 'BEGIN; … COMMIT;' }
        : { principal, password: 'pw' }
    },
    rotatePrincipal: async (p: PrincipalRecord) => {
      calls.rotated.push(p.id)
      return { principal: p, password: 'pw2', sessionsTerminated: 0 }
    },
    revokePrincipal: async (p: PrincipalRecord) => {
      calls.revoked.push(p.id)
      return { principal: { ...p, revokedAt: 1 }, sessionsTerminated: 1 }
    },
  }
  return { service: service as unknown as AnalyticsService, calls }
}

async function mount(service: AnalyticsService) {
  app = Fastify({ logger: false })
  await app.register(createAnalyticsRouter({ service }))
  await app.ready()
}

describe('scopeExcess', () => {
  it('accepts a principal within the caller scope', () => {
    expect(scopeExcess({ tenants: '*' }, { tenants: '*' })).toBeNull()
    expect(scopeExcess({ tenants: ['a', 'b'] }, { tenants: ['a'] })).toBeNull()
    expect(
      scopeExcess({ tenants: '*', verticals: { crm: '*' } }, { tenants: '*', verticals: ['crm'] }),
    ).toBeNull()
  })

  it('names what exceeds it', () => {
    expect(scopeExcess({ tenants: ['a'] }, { tenants: '*' })).toBe('all tenants')
    expect(scopeExcess({ tenants: ['a'] }, { tenants: ['a', 'b'] })).toBe('tenant(s) b')
    expect(scopeExcess({ tenants: '*', verticals: { crm: '*' } }, { tenants: '*' })).toBe(
      'all verticals',
    )
    expect(
      scopeExcess({ tenants: '*', verticals: { crm: '*' } }, { tenants: '*', verticals: '*' }),
    ).toBe('all verticals')
    // Only some of crm's resource types → cannot grant all of crm.
    expect(
      scopeExcess(
        { tenants: '*', verticals: { crm: ['contacts'] } },
        { tenants: '*', verticals: ['crm'] },
      ),
    ).toBe('vertical(s) crm')
    // Verticals granted within a tenant bound that tenant.
    const perTenant = { tenants: ['a', 'b'], tenantVerticals: { a: ['crm'] } }
    expect(scopeExcess(perTenant, { tenants: ['b'] })).toBeNull()
    expect(scopeExcess(perTenant, { tenants: ['a'], verticals: ['crm'] })).toBeNull()
    expect(scopeExcess(perTenant, { tenants: ['a'] })).toBe('all verticals of tenant a')
    expect(scopeExcess(perTenant, { tenants: ['a', 'b'], verticals: ['crm', 'payments'] })).toBe(
      'vertical(s) payments of tenant a',
    )
  })
})

describe('principal routes', () => {
  const body = { label: 'Metabase', scope: { tenants: ['t1'] } }

  it('creates within scope and returns the password once, with connection hints', async () => {
    const { service, calls } = stub([])
    await mount(service)
    const r = await req('POST', '/admin/analytics/principals', { tenants: ['t1', 't2'] }, body)
    expect(r.statusCode).toBe(201)
    expect(r.json().data).toMatchObject({
      password: 'pw',
      connection: {
        host: 'replica.example',
        username: 'os_sql_bi_000000',
        searchPath: 'os_analytics',
      },
      principal: { label: 'Metabase', status: 'active', pii: false },
      mode: 'managed',
    })
    expect(calls.created[0]).toMatchObject({ connectionLimit: 5, expiresAt: null, pii: false })
  })

  it('manual mode returns the script to run', async () => {
    const { service } = stub([], 'manual')
    await mount(service)
    const r = await req('POST', '/admin/analytics/principals', ALL, body)
    expect(r.statusCode).toBe(201)
    expect(r.json().data).toMatchObject({ mode: 'manual', script: 'BEGIN; … COMMIT;' })
  })

  it('403 when the principal scope exceeds the caller', async () => {
    const { service, calls } = stub([])
    await mount(service)
    const wide = await req(
      'POST',
      '/admin/analytics/principals',
      { tenants: ['t1'] },
      { label: 'x', scope: { tenants: '*' } },
    )
    expect(wide.statusCode).toBe(403)
    expect(wide.json().error.code).toBe('SCOPE_EXCEEDS_CALLER')
    const other = await req('POST', '/admin/analytics/principals', { tenants: ['t2'] }, body)
    expect(other.statusCode).toBe(403)
    const vertical = await req(
      'POST',
      '/admin/analytics/principals',
      { tenants: '*', verticals: { crm: '*' } },
      { label: 'x', scope: { tenants: '*', verticals: ['payments'] } },
    )
    expect(vertical.statusCode).toBe(403)
    expect(calls.created).toHaveLength(0)
  })

  it('403 for a PII principal without revealPii', async () => {
    const { service, calls } = stub([])
    await mount(service)
    const r = await req(
      'POST',
      '/admin/analytics/principals',
      { tenants: '*' },
      { ...body, pii: true },
    )
    expect(r.statusCode).toBe(403)
    expect(r.json().error.code).toBe('PII_NOT_ALLOWED')
    const ok = await req(
      'POST',
      '/admin/analytics/principals',
      { tenants: '*', revealPii: true },
      { ...body, pii: true },
    )
    expect(ok.statusCode).toBe(201)
    expect(ok.json().data.connection.searchPath).toBe('os_analytics_pii')
    expect(calls.created).toHaveLength(1)
  })

  it('400 on a malformed body, a past expiry, or no scope header', async () => {
    const { service } = stub([])
    await mount(service)
    expect((await req('POST', '/admin/analytics/principals', ALL, { label: '' })).statusCode).toBe(
      400,
    )
    expect(
      (await req('POST', '/admin/analytics/principals', ALL, { ...body, connectionLimit: 1000 }))
        .statusCode,
    ).toBe(400)
    expect(
      (
        await req('POST', '/admin/analytics/principals', ALL, {
          ...body,
          expiresAt: '2001-01-01T00:00:00Z',
        })
      ).statusCode,
    ).toBe(400)
    expect(
      (await req('POST', '/admin/analytics/principals', ALL, { ...body, scope: { tenants: [] } }))
        .statusCode,
    ).toBe(400)
    const noScope = await req('POST', '/admin/analytics/principals', null, body)
    expect(noScope.statusCode).toBe(400)
    expect(noScope.json().error.code).toBe('INVALID_SCOPE')
  })

  it('lists, rotates and revokes only principals within the caller scope', async () => {
    const mine = record({ id: 'mine', scope: { tenants: ['t1'] } })
    const theirs = record({ id: 'theirs', scope: { tenants: ['t2'] } })
    const everyone = record({ id: 'all', scope: { tenants: '*' } })
    const pii = record({ id: 'pii', pii: true, scope: { tenants: ['t1'] } })
    const { service, calls } = stub([mine, theirs, everyone, pii])
    await mount(service)
    const scoped = { tenants: ['t1'] }

    const list = await req('GET', '/admin/analytics/principals', scoped)
    expect(list.json().data.map((p: { id: string }) => p.id)).toEqual(['mine'])
    const listAll = await req('GET', '/admin/analytics/principals', ALL)
    expect(listAll.json().data).toHaveLength(4)

    for (const id of ['theirs', 'all', 'pii', 'missing']) {
      expect(
        (await req('POST', `/admin/analytics/principals/${id}/rotate`, scoped)).statusCode,
      ).toBe(404)
      expect((await req('DELETE', `/admin/analytics/principals/${id}`, scoped)).statusCode).toBe(
        404,
      )
    }
    const rot = await req('POST', '/admin/analytics/principals/mine/rotate', scoped)
    expect(rot.statusCode).toBe(200)
    expect(rot.json().data).toMatchObject({ password: 'pw2', sessionsTerminated: 0 })
    const del = await req('DELETE', '/admin/analytics/principals/mine', scoped)
    expect(del.statusCode).toBe(200)
    expect(del.json().data.principal.status).toBe('revoked')
    expect(calls).toMatchObject({ rotated: ['mine'], revoked: ['mine'] })
  })

  it('provisioning is deployment-wide and managed-only', async () => {
    const { service, calls } = stub([])
    await mount(service)
    expect((await req('POST', '/admin/analytics/provision', { tenants: ['t1'] })).statusCode).toBe(
      403,
    )
    expect(
      (await req('GET', '/admin/analytics/provision-script', { tenants: ['t1'] })).statusCode,
    ).toBe(403)
    const ok = await req('POST', '/admin/analytics/provision', ALL)
    expect(ok.statusCode).toBe(200)
    expect(calls.provisioned).toBe(1)
    const script = await req('GET', '/admin/analytics/provision-script', null)
    expect(script.statusCode).toBe(200)
    expect(script.headers['content-type']).toMatch(/^text\/plain/)

    const manual = stub([], 'manual')
    await app.close()
    await mount(manual.service)
    const r = await req('POST', '/admin/analytics/provision', ALL)
    expect(r.statusCode).toBe(409)
    expect(r.json().error.code).toBe('MANUAL_MODE')
  })

  it('the catalog is filtered to the caller verticals', async () => {
    const { service } = stub([])
    await mount(service)
    const all = await req('GET', '/admin/analytics/catalog', null)
    expect(all.json().data.views.map((v: { name: string }) => v.name)).toContain('payments_charges')
    const crm = await req('GET', '/admin/analytics/catalog', {
      tenants: '*',
      verticals: { crm: '*' },
    })
    const names = crm.json().data.views.map((v: { name: string }) => v.name)
    expect(names).toContain('crm_contacts')
    expect(names).toContain('connections')
    expect(names).not.toContain('payments_charges')
  })
})
