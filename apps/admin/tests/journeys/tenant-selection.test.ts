/**
 * Choosing a tenant for a customer, and for the Connect Link that names them.
 *
 * These two are coupled, which is why they are tested together. A link's tenant
 * becomes the resulting connection's owning tenant, and the server refuses a
 * link whose tenant disagrees with its customer's — so the UI must not be able
 * to ask for a combination that will be rejected.
 *
 * Hence: derive the tenant from the customer wherever one is already known, and
 * only offer a choice where there is nobody to derive it from. A single-tenant
 * deployment — which is most of them — sees none of it.
 */
import type { FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createHmac } from 'crypto'

const mockCreateEndUser = vi.fn(async () => ({ id: 'eu_1' }))
const mockCreateConnectSession = vi.fn(async () => ({ id: 's1', token: 'tok', url: null }))
const mockListTenants = vi.fn()
const mockListEndUsersPaged = vi.fn()

const ONE = [{ id: 'default', name: 'Default' }]
const TWO = [
  { id: 'default', name: 'Default' },
  { id: 'dept-a', name: 'Department A' },
]

vi.mock('../../src/core/proxy/admin-api-client', async () => {
  // `await import`: vi.mock is hoisted above this file's imports, but the
  // factory body runs later, so it can import what the top level cannot.
  const { adminApiStub } = await import('../helpers/admin-api-stub')
  return {
    AdminApiClient: adminApiStub({
      listTenants: mockListTenants,
      listEndUsersPaged: mockListEndUsersPaged,
      createEndUser: mockCreateEndUser,
      createConnectSession: mockCreateConnectSession,
      getLoginOptions: async () => {
        return { providers: [], localLoginEnabled: true }
      },
      getCompanyInfo: async () => {
        return null
      },
      listConnectSessions: async () => {
        return []
      },
      listConnectLinkTemplates: async () => {
        return []
      },
      listScopeGroups: async () => {
        return []
      },
      listAllPlatformRows: async () => {
        return [{ vertical: 'accounting', slug: 'fortnox', enabled: true, hasConfig: true }]
      },
      listCatalog: async () => {
        return [{ vertical: 'accounting', slug: 'fortnox', name: 'Fortnox' }]
      },
      listEndUsers: async () => {
        return [{ id: 'eu_1', email: 'jane@acme.example', displayName: 'Jane', tenantId: 'dept-a' }]
      },
    }),
  }
})

const { buildServer } = await import('../../src/core/server')

const SESSION_SECRET = 'tenant-selection-session-secret-long-enough'
let fastify: FastifyInstance

function cookie(): string {
  return fastify.signCookie(
    JSON.stringify({ id: 'u1', username: 'admin', role: 'admin', token: 'jwt' }),
  )
}

function csrf(c: string): string {
  return createHmac('sha256', SESSION_SECRET).update(c).digest('hex').slice(0, 32)
}

const get = (url: string) => fastify.inject({ method: 'GET', url, cookies: { session: cookie() } })

async function post(url: string, payload: Record<string, string>) {
  const c = cookie()
  return fastify.inject({
    method: 'POST',
    url,
    cookies: { session: c },
    payload: { _csrf: csrf(c), ...payload },
  })
}

beforeEach(async () => {
  mockListTenants.mockReset().mockResolvedValue(ONE)
  mockListEndUsersPaged
    .mockReset()
    .mockResolvedValue({ data: [], meta: { page: 1, limit: 25, total: 0 } })
  mockCreateEndUser.mockReset().mockResolvedValue({ id: 'eu_1' })
  mockCreateConnectSession.mockReset().mockResolvedValue({ id: 's1', token: 'tok', url: null })

  const built = await buildServer({
    server: { port: 0, host: '127.0.0.1' },
    session: { secret: SESSION_SECRET },
    admin_api: { url: 'http://localhost:3001' },
    docs_server: { url: 'http://localhost:3003' },
    sso: { publicBaseUrl: 'http://localhost:3000' },
  })
  fastify = built.fastify
  await fastify.ready()
})

afterEach(async () => {
  await fastify?.close()
})

describe('a customer gets a tenant when there is one to choose', () => {
  it('offers nothing on a single-tenant deployment', async () => {
    const res = await get('/customers/new')
    expect(res.statusCode).toBe(200)
    expect(res.body).not.toContain('name="tenantId"')
  })

  it('offers a picker once a second tenant exists', async () => {
    mockListTenants.mockResolvedValue(TWO)
    const res = await get('/customers/new')
    expect(res.body).toContain('name="tenantId"')
    expect(res.body).toContain('Department A')
  })

  it('creates the customer in the tenant that was chosen', async () => {
    mockListTenants.mockResolvedValue(TWO)
    await post('/customers', { email: 'new@acme.example', tenantId: 'dept-a' })
    expect(mockCreateEndUser).toHaveBeenCalledWith(
      'jwt',
      expect.objectContaining({ tenantId: 'dept-a' }),
    )
  })

  it('keeps the picker when a field fails validation', async () => {
    // The control must survive the re-render, or the operator loses it the
    // moment they mistype.
    mockListTenants.mockResolvedValue(TWO)
    const res = await post('/customers', { email: '', tenantId: 'dept-a' })
    expect(res.body).toContain('Email is required')
    expect(res.body).toContain('name="tenantId"')
  })
})

describe('a Connect Link takes its tenant from the customer, or asks', () => {
  it('offers no tenant controls on a single-tenant deployment', async () => {
    const res = await get('/connect-links/new')
    expect(res.statusCode).toBe(200)
    // Asserted on the element ids, not on `name="tenantId"`: the page's own
    // script contains that string in a querySelector, so a substring check
    // passes on script text and proves nothing about the rendered form.
    expect(res.body).not.toContain('id="tenantChooser"')
    expect(res.body).not.toContain('id="tenantDerived"')
  })

  it('offers a chooser when there is nobody to derive from', async () => {
    // Self-register, and new-email links, have no customer yet — the choice
    // decides which tenant they are created in.
    mockListTenants.mockResolvedValue(TWO)
    const res = await get('/connect-links/new')
    expect(res.body).toContain('id="tenantChooser"')
    expect(res.body).toContain('Department A')
  })

  it('carries a derived slot for a customer who is already known', async () => {
    mockListTenants.mockResolvedValue(TWO)
    const res = await get('/connect-links/new')
    // Hidden until a customer is picked, then filled from their record.
    expect(res.body).toContain('id="tenantDerived"')
    expect(res.body).toContain('id="tenantDerivedInput"')
  })

  it('gives the client a tenant to derive from', async () => {
    // The autocomplete carries `data-tenant` on each option; without it the
    // derived slot has nothing to fill from, and the coupling silently breaks.
    const res = await get('/customers/search.json?q=jane')
    expect(res.statusCode).toBe(200)
    expect(res.json().data[0]).toMatchObject({ id: 'eu_1', tenantId: 'dept-a' })
  })

  it('sends the chosen tenant on create', async () => {
    mockListTenants.mockResolvedValue(TWO)
    await post('/connect-links', {
      label: 'Acme onboarding',
      linkMode: 'self-register',
      tenantId: 'dept-a',
    })
    expect(mockCreateConnectSession).toHaveBeenCalledWith(
      'jwt',
      expect.objectContaining({ tenantId: 'dept-a' }),
    )
  })

  it('still defaults to the default tenant when none is sent', async () => {
    // A single-tenant deployment posts no tenantId at all; the default path
    // must work without one.
    await post('/connect-links', { label: 'Acme onboarding', linkMode: 'self-register' })
    expect(mockCreateConnectSession).toHaveBeenCalledWith(
      'jwt',
      expect.objectContaining({ tenantId: 'default' }),
    )
  })
})

describe('finding customers in one tenant', () => {
  it('offers no filter when there is only one tenant', async () => {
    const res = await get('/customers')
    expect(res.statusCode).toBe(200)
    // Capital "Tenant", matching `_table-head.ejs`'s `aria-label="Filter by
    // <%= col.header %>"` (`col.header` is `'Tenant'`) — the lowercase form
    // this asserted before never appears at all, rendered or not, so that
    // spelling passed regardless of whether the filter renders. Fixing the
    // case is what makes this a real regression test again (see the sibling
    // assertion two tests down, which already uses the capitalised form).
    expect(res.body).not.toContain('aria-label="Filter by Tenant"')
  })

  it('offers the filter once a second tenant exists', async () => {
    mockListTenants.mockResolvedValue(TWO)
    const res = await get('/customers')
    // admin-table-sort-filter Part B moved this page onto `_table-head.ejs`,
    // which builds the label from the column's own header text ("Tenant",
    // capitalised, matching the visible `<th>`) and renders the enum's blank
    // option as "All" rather than a bespoke "All tenants" — see
    // `_table-head.ejs`. The pre-existing `aria-label="Filter by tenant"` /
    // "All tenants" strings cannot survive that shared partial.
    expect(res.body).toContain('aria-label="Filter by Tenant"')
    expect(res.body).toContain('>All</option>')
    expect(res.body).toContain('Department A')
  })

  it('passes the chosen tenant upstream rather than filtering in the page', async () => {
    // Filtering client-side would only ever narrow the rows already sent, so
    // page 2 of dept-a would be page 2 of everything. Same reasoning as the
    // /webhooks search.
    mockListTenants.mockResolvedValue(TWO)
    await get('/customers?tenantId=dept-a')
    expect(mockListEndUsersPaged).toHaveBeenCalledWith(
      'jwt',
      expect.objectContaining({ tenantId: 'dept-a' }),
    )
  })

  it('keeps the filter selected, and carries it through paging', async () => {
    mockListTenants.mockResolvedValue(TWO)
    mockListEndUsersPaged.mockResolvedValue({
      data: [{ id: 'eu_1', email: 'jane@acme.example', tenantId: 'dept-a' }],
      meta: { page: 1, limit: 1, total: 5 },
    })
    const res = await get('/customers?tenantId=dept-a')
    expect(res.body).toContain('value="dept-a" selected')
    // Lose this and page 2 silently widens to every tenant.
    expect(res.body).toContain('tenantId=dept-a')
  })

  it('says which filter emptied the list, not that there are no customers', async () => {
    // "No customers match" on a filtered list reads as an empty install, which
    // is how an operator recreates customers that already exist elsewhere.
    mockListTenants.mockResolvedValue(TWO)
    const res = await get('/customers?tenantId=dept-a')
    expect(res.body).toContain('No customers in tenant')
    expect(res.body).not.toContain('No customers yet')
  })

  it('sends no tenant filter when none is chosen', async () => {
    mockListTenants.mockResolvedValue(TWO)
    await get('/customers')
    // Not `objectContaining({ tenantId: undefined })`: FILTER_PARAM-based
    // forwarding (routes/customers.ts) only emits a key that is actually IN
    // `tableState.filters`, so an unset tenant filter means the key never
    // reaches the call at all — `objectContaining` with an `undefined` value
    // does not match a call that simply lacks the key (verified empirically;
    // same distinction /connections' equivalent `search` test documents).
    const [, filters] = mockListEndUsersPaged.mock.calls[0]!
    expect(filters).not.toHaveProperty('tenantId')
  })
})
