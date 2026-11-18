/**
 * Journey: sorting and per-column filtering on /users, the first table this
 * feature reaches. Its POST delete form (in the Actions cell) is exactly why
 * it was chosen to go first — see _table-filters-form.ejs for why the filter
 * form has to live outside the <table>.
 *
 * Also covers the Task 5 rollout to /tenants, /identity-providers and
 * /oauth-clients — three pages with no prior filter form, so nothing there
 * was absorbed, plus the wizard guard on /tenants' shared partial.
 *
 * Task 6 adds /connect-links and /connect-link-templates. /connect-links is
 * the second page (after /oauth-clients' Authority) where a filterable
 * column's cell transforms its underlying field rather than rendering it raw
 * — see the Tenant and Customer fixtures below.
 *
 * Task 7 adds /webhooks, /scope-groups and /api-keys — the first pages where
 * an ABOVE-TABLE GET form (tenant/search, vertical/platform) is absorbed
 * into the filter row rather than merely added alongside it, so its old
 * query params (`search`, `tenantId`, `vertical`, `platform`) become
 * `legacy` aliases. /api-keys is also the conditional-column case: the
 * Actions header only exists for an admin, so its TableSpec is built inside
 * the handler per role, and the cell-count regression pin below is what
 * would have caught a fixed column list misaligning every cell for an
 * operator or viewer.
 */
import type { FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const USERS = [
  { id: 'u-zoe', username: 'zoe', role: 'viewer', createdAt: '2026-01-03T09:00:00.000Z' },
  { id: 'u-adam', username: 'Adam', role: 'admin', createdAt: '2026-01-05T09:00:00.000Z' },
  { id: 'u-mia', username: 'mia', role: 'admin', createdAt: '2026-01-04T09:00:00.000Z' },
]

const TENANTS = [
  { id: 'default', name: 'Default' },
  { id: 'acme', name: 'Acme' },
  { id: 'globex', name: 'Globex' },
  // Deliberately a name that shares no substring with its id (unlike the
  // three above, where id and name are the same word modulo case — a filter
  // on the raw tenantId would pass those by accident). This is what makes
  // the /connect-links Tenant regression pin below honest.
  { id: 't-northwind', name: 'Northwind Traders' },
]

const CONNECT_SESSIONS = [
  {
    id: 's1',
    token: 'tok-s1',
    tenantId: 'default',
    endUserId: null as string | null,
    label: 'Zephyr onboarding',
    allowedVerticals: [] as string[],
    allowedPlatforms: [] as Array<{ vertical: string; slug: string }>,
    redirectUrl: null,
    expiresAt: '2026-09-20T00:00:00.000Z',
    consumedAt: null,
    connectionId: null,
    createdAt: '2026-09-01T00:00:00.000Z',
    createdBy: null,
    status: 'active' as const,
    oneTimeOnly: false,
    url: 'https://example.com/connect/tok-s1',
  },
  {
    id: 's2',
    token: 'tok-s2',
    tenantId: 't-northwind',
    // Present, so the Customer cell renders the id rather than "anonymous" —
    // the other half of the same regression pin.
    endUserId: 'end-user-42',
    label: 'Amber onboarding',
    allowedVerticals: [] as string[],
    allowedPlatforms: [] as Array<{ vertical: string; slug: string }>,
    redirectUrl: null,
    expiresAt: '2026-09-25T00:00:00.000Z',
    consumedAt: '2026-09-10T00:00:00.000Z',
    connectionId: null,
    createdAt: '2026-09-02T00:00:00.000Z',
    createdBy: null,
    status: 'consumed' as const,
    oneTimeOnly: false,
    url: null,
  },
]

const CONNECT_TEMPLATES = [
  {
    id: 1,
    tenantId: 'acme',
    name: 'Vendor onboarding',
    // A description AND a pinned platform, neither sharing a word with the
    // name — what makes the must-fix 6 (THE RULE) regression pins below
    // honest: 'finance' appears only in the description, 'fortnox' only in
    // the pinned-platform sub-line the cell renders under it.
    description: 'Onboard finance vendors quickly',
    linkMode: 'pinned' as const,
    allowedVerticals: [] as string[],
    allowedPlatforms: [{ vertical: 'accounting', slug: 'fortnox' }],
    scopeGroupId: null,
    expiryDays: 7,
    oneTimeOnly: false,
    redirectUrl: null,
    createdAt: '2026-08-01T00:00:00.000Z',
    createdBy: null,
  },
  {
    id: 2,
    tenantId: 'globex',
    name: 'Customer self-serve',
    description: null,
    linkMode: 'self-register' as const,
    allowedVerticals: [] as string[],
    allowedPlatforms: [] as Array<{ vertical: string; slug: string }>,
    scopeGroupId: null,
    expiryDays: 30,
    oneTimeOnly: true,
    redirectUrl: null,
    createdAt: '2026-08-05T00:00:00.000Z',
    createdBy: null,
  },
]

const IDPS = [
  {
    id: 'idp-okta',
    name: 'Okta',
    protocol: 'oidc',
    slug: 'okta',
    enabled: true,
    jitEnabled: true,
    defaultRole: 'viewer',
  },
  {
    id: 'idp-adfs',
    name: 'Corp ADFS',
    protocol: 'saml',
    slug: 'adfs',
    enabled: false,
    jitEnabled: false,
    defaultRole: 'operator',
  },
]

const REGISTRY_ISSUER = {
  id: 'iss_1',
  name: 'Corp Keycloak',
  issuer: 'https://idp.corp.example/realms/main',
  authorityMode: 'registry' as const,
  tenantClaim: null,
  allowedTenants: [] as string[],
  enabled: true,
  lastVerifiedAt: '2026-08-29T10:00:00.000Z',
}

const EXTERNAL_ISSUER = {
  id: 'iss_2',
  name: 'Partner Auth0',
  issuer: 'https://partner.example/',
  authorityMode: 'external' as const,
  tenantClaim: 'https://opensteward/tenant',
  allowedTenants: ['acme'],
  enabled: true,
  lastVerifiedAt: null,
}

const WEBHOOKS = [
  {
    id: 'wh-1',
    tenantId: 'default',
    url: 'https://hooks.example.com/billing',
    label: 'Billing hook',
    events: ['*'],
    paused: false,
    createdAt: '2026-08-01T00:00:00.000Z',
    lastFiredAt: '2026-08-20T00:00:00.000Z',
    lastStatus: 200,
    lastError: null,
    // 'teams' (label 'Microsoft Teams') vs wh-2's absent format (falls back
    // to 'opensteward', label 'OpenSteward envelope') is deliberately an
    // inversion between slug order and label order: 'opensteward' <
    // 'teams' alphabetically, but 'Microsoft Teams' < 'OpenSteward envelope'
    // — see the Delivery-sort tests below (fix-round-2, Important B/fold-in).
    format: 'teams',
  },
  {
    id: 'wh-2',
    tenantId: 't-northwind',
    url: 'https://hooks.example.com/shipping',
    label: 'Shipping hook',
    events: ['connection.created'],
    paused: false,
    createdAt: '2026-08-05T00:00:00.000Z',
    lastFiredAt: null,
    lastStatus: null,
    lastError: null,
    // No `format` — exercises the fallback-to-'opensteward' path, the same
    // shape an older admin-api's row has.
  },
]

const PROVIDERS_CATALOG = [
  { vertical: 'accounting', slug: 'fortnox', name: 'Fortnox' },
  { vertical: 'crm', slug: 'nutshell', name: 'Nutshell' },
]

const SCOPE_GROUPS = [
  {
    id: 1,
    vertical: 'accounting',
    platform: 'fortnox',
    name: 'Read-only books',
    scopes: ['accounting:read'],
    createdAt: '2026-07-01T00:00:00.000Z',
  },
  {
    id: 2,
    vertical: 'crm',
    platform: 'nutshell',
    name: 'Sales sync',
    scopes: ['crm:read', 'crm:write'],
    createdAt: '2026-07-05T00:00:00.000Z',
  },
]

const API_KEYS = [
  {
    id: 'k1',
    tenantId: 'default',
    mode: 'live' as const,
    prefix: 'osk_live1',
    label: 'CI runner',
    scopes: ['accounting:read'],
    createdAt: '2026-08-01T00:00:00.000Z',
    lastUsedAt: '2026-08-25T00:00:00.000Z',
    revokedAt: null,
    expiresAt: null,
  },
  {
    id: 'k2',
    tenantId: 't-northwind',
    mode: 'test' as const,
    prefix: 'osk_test2',
    label: 'Local dev',
    scopes: ['crm:read'],
    createdAt: '2026-08-05T00:00:00.000Z',
    lastUsedAt: null,
    revokedAt: null,
    expiresAt: null,
  },
  {
    // No label and no mode — both cells fall back (label -> prefix, mode ->
    // "Live"), which is exactly the case THE RULE THAT MATTERS MOST exists
    // for: an accessor reading the bare field would see `undefined` and
    // exclude this row from a filter matching what is actually on screen.
    id: 'k3',
    tenantId: 'default',
    prefix: 'osk_nolabel3',
    label: null,
    scopes: ['*'],
    createdAt: '2026-08-10T00:00:00.000Z',
    lastUsedAt: null,
    revokedAt: null,
    expiresAt: null,
  },
]

// Platform rows for the /platforms Configure tab (Task 8). Only `accounting`
// carries fixture data — the route asks all nine KNOWN_VERTICALS and the
// adminApiStub Proxy already resolves any unlisted list* to `[]`, so naming
// just the one vertical this suite exercises keeps the fixture legible.
const PLATFORM_ROWS_DEFAULT: Record<
  string,
  Array<{ slug: string; enabled: boolean; hasConfig: boolean }>
> = {
  accounting: [
    { slug: 'fortnox', enabled: true, hasConfig: true },
    { slug: 'xero', enabled: false, hasConfig: false },
  ],
}

// Reassigned by the pagination tests below, which need a fixture past the
// 50-row page size that platforms.ts's old in-process filter never had to
// slice — reset to the default in this file's own beforeEach so one test's
// override cannot leak into the next.
let platformRowsByVertical = PLATFORM_ROWS_DEFAULT

// 60 rows, zero-padded so a substring filter ('plat-0') selects an exact,
// countable subset (plat-00..plat-09 — 10 of the 60) for the "total reflects
// the FILTERED count" pin below.
const MANY_PLATFORMS = Array.from({ length: 60 }, (_, i) => ({
  slug: `plat-${String(i).padStart(2, '0')}`,
  enabled: i % 2 === 0,
  hasConfig: true,
}))

// Task 3 (/connections): two rows whose label, status, vertical and platform
// each differ, so a filter or sort on any one of those columns has something
// real to narrow or reorder — and a platform slug ('shopify') that does NOT
// appear in TENANTS/PLATFORM_ROWS_DEFAULT, so the Platform filter's "options
// come from the data present" pin below cannot pass by accident against some
// other fixture's platform list.
const CONNECTIONS = [
  {
    id: 'c-fortnox-1111',
    vertical: 'accounting',
    platform: 'fortnox',
    tenantId: 'default',
    label: 'Acme Books',
    status: 'valid',
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    lastRefreshAt: null as string | null,
    lastRefreshStatus: null as string | null,
  },
  {
    id: 'c-shopify-2222',
    vertical: 'ecommerce',
    platform: 'shopify',
    tenantId: 't-northwind',
    label: 'Northwind Shop',
    status: 'expired',
    createdAt: '2026-08-05T00:00:00.000Z',
    updatedAt: '2026-08-05T00:00:00.000Z',
    lastRefreshAt: null as string | null,
    lastRefreshStatus: 'expired' as string | null,
  },
]

/**
 * A small stand-in for admin-api's own filter/sort logic (connections.ts's
 * `CONNECTION_SORT_ACCESSORS`/per-column filters), so this suite's "excludes the non-matching
 * row" and "renders in the order admin-api returns" pins exercise something
 * real rather than a canned response that would pass unchanged whichever
 * params reached it.
 */
function filterAndSortConnections(filters?: Record<string, unknown> | null) {
  let rows = CONNECTIONS
  const sub = (v: unknown) => (typeof v === 'string' ? v.toLowerCase() : undefined)
  if (typeof filters?.f_label === 'string')
    rows = rows.filter((c) => c.label.toLowerCase().includes(sub(filters.f_label)!))
  if (typeof filters?.f_id === 'string')
    rows = rows.filter((c) => c.id.toLowerCase().includes(sub(filters.f_id)!))
  if (typeof filters?.f_vertical === 'string') rows = rows.filter((c) => c.vertical === filters.f_vertical)
  if (typeof filters?.f_status === 'string') rows = rows.filter((c) => c.status === filters.f_status)
  if (typeof filters?.f_platform === 'string')
    rows = rows.filter((c) => c.platform.toLowerCase().includes(sub(filters.f_platform)!))
  if (typeof filters?.f_tenant === 'string') rows = rows.filter((c) => c.tenantId === filters.f_tenant)
  // admin-api's own `search` param — id OR label — never `f_search`, which
  // it does not declare. Standing in for that here is what makes the
  // "?search= still matches by id" journey test genuine rather than a
  // canned response.
  if (typeof filters?.search === 'string') {
    const needle = sub(filters.search)!
    rows = rows.filter(
      (c) => c.id.toLowerCase().includes(needle) || c.label.toLowerCase().includes(needle),
    )
  }
  if (typeof filters?.sort === 'string') {
    const key = filters.sort === 'tenant' ? 'tenantId' : filters.sort === 'created' ? 'createdAt' : filters.sort
    const sign = filters.dir === 'desc' ? -1 : 1
    rows = [...rows].sort(
      (a, b) => String((a as any)[key]).localeCompare(String((b as any)[key])) * sign,
    )
  }
  return rows
}

const mockListConnectionsPaged = vi.fn(async (_token: string, filters?: Record<string, unknown>) => {
  const data = filterAndSortConnections(filters)
  return { data, meta: { page: 1, limit: 50, total: data.length } }
})

vi.mock('../../src/core/proxy/admin-api-client', async () => {
  const { adminApiStub } = await import('../helpers/admin-api-stub')
  return {
    AdminApiClient: adminApiStub({
      hasUsers: async () => true,
      getCompanyInfo: async () => null,
      getLoginOptions: async () => ({ providers: [], localLoginEnabled: true }),
      listUsers: async () => USERS,
      listTenants: async () => TENANTS,
      listTenantDomains: async () => [],
      listIdentityProviders: async () => IDPS,
      listOAuthIssuers: async () => [REGISTRY_ISSUER, EXTERNAL_ISSUER],
      getOAuthReadiness: async () => ({ ready: true, reason: 'ok' }),
      getOAuthIssuer: async (_token: string, id: string) =>
        id === 'iss_1'
          ? { issuer: REGISTRY_ISSUER, clients: [{ tenantId: 'acme', revokedAt: null }], rules: [] }
          : null,
      getDataStoreMetrics: async () => null,
      listConnectSessions: async () => CONNECT_SESSIONS,
      listConnectLinkTemplates: async () => CONNECT_TEMPLATES,
      getConnectSession: async (_token: string, id: string) =>
        CONNECT_SESSIONS.find((s) => s.id === id) ?? null,
      listWebhookSubs: async (_token: string, filters?: { tenantId?: string }) =>
        filters?.tenantId ? WEBHOOKS.filter((w) => w.tenantId === filters.tenantId) : WEBHOOKS,
      listScopeGroups: async (_token: string, filter?: { vertical?: string; platform?: string }) =>
        SCOPE_GROUPS.filter(
          (g) =>
            (!filter?.vertical || g.vertical === filter.vertical) &&
            (!filter?.platform || g.platform === filter.platform),
        ),
      listCatalog: async () => PROVIDERS_CATALOG,
      listApiKeys: async (_token: string, tenantId?: string) =>
        tenantId ? API_KEYS.filter((k) => k.tenantId === tenantId) : API_KEYS,
      listPlatforms: async (_token: string, vertical: string) => platformRowsByVertical[vertical] ?? [],
      listConnectionsPaged: mockListConnectionsPaged,
    }),
  }
})

const { buildServer } = await import('../../src/core/server')

const SESSION_SECRET = 'admin-table-sort-filter-secret-long-enough'
let fastify: FastifyInstance

function session(role = 'admin') {
  return fastify.signCookie(JSON.stringify({ id: 'u1', username: 'admin', role, token: 'jwt' }))
}

const get = (url: string, role = 'admin') =>
  fastify.inject({ method: 'GET', url, cookies: { session: session(role) } })

beforeEach(async () => {
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
  vi.clearAllMocks()
})

/**
 * `_table-filters-form.ejs` carries the active `sort`/`dir` across a filter
 * submit as hidden inputs, which is the "sorting survives a filter submit"
 * behaviour its own comment promises. Nothing pinned it: deleting both inputs
 * left all 1281 admin tests green across all fourteen tables.
 *
 * Pinned once, here, rather than per table — the partial is shared and every
 * table renders the same markup from it. /users is an in-memory table with a
 * simple spec, so the assertion is about the partial and not about that page.
 *
 * The negative case is what makes it bite: with NO sort active the inputs must
 * be ABSENT, so a version that always emitted them (and therefore always
 * passed a presence-only check) fails too.
 */
describe('Journey: a filter submit carries the active sort with it', () => {
  it('emits sort and dir as hidden inputs on the filter form when a column is sorted', async () => {
    const res = await get('/users?sort=username&dir=desc')
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain(
      '<input type="hidden" form="users-filters" name="sort" value="username">',
    )
    expect(res.body).toContain('<input type="hidden" form="users-filters" name="dir" value="desc">')
  })

  it('emits neither when no column is sorted', async () => {
    const res = await get('/users')
    expect(res.statusCode).toBe(200)
    expect(res.body).not.toContain('form="users-filters" name="sort"')
    expect(res.body).not.toContain('form="users-filters" name="dir"')
  })

  /**
   * `page` deliberately does NOT travel with them: a changed filter returns to
   * page 1, which is the other half of the same comment. Asserted here so the
   * two halves cannot drift apart.
   */
  it('does not carry page across a filter submit', async () => {
    const res = await get('/users?sort=username&dir=desc&page=3')
    expect(res.body).not.toContain('form="users-filters" name="page"')
  })
})

describe('Journey: sortable columns and per-column filters on /users', () => {
  it('renders a sort link and a filter row', async () => {
    const res = await get('/users')
    expect(res.statusCode).toBe(200)
    // The concrete rendered string, `&amp;` and all — EJS's `<%= %>` escapes
    // `&`, so this is what actually reaches the browser. Two independent
    // substring checks (`sort=username`, `dir=asc`) would pass even if the
    // Username link were malformed, since `dir=asc` also appears in the
    // Role and Created links; only the full href pins it to this column.
    expect(res.body).toContain('href="/users?sort=username&amp;dir=asc"')
    expect(res.body).toContain('name="f_username"')
    // The filter row's cells are <th>, never <td> — every cell-scoped test
    // helper in this suite anchors on <td>.
    expect(res.body).toMatch(/<tr class="table__filters">\s*<th/)
    // The headline constraint this task exists to enforce: the filter form
    // renders BEFORE the table it filters, not nested inside it — see
    // _table-filters-form.ejs. And the table's own POST delete form, which
    // is exactly why /users went first, still renders untouched.
    expect(res.body.indexOf('id="users-filters"')).toBeLessThan(res.body.indexOf('<table'))
    expect(res.body).toContain('<form method="POST" action="/users/u-adam/delete"')
  })

  it('sorts by a column', async () => {
    const res = await get('/users?sort=username&dir=asc')
    const body = res.body.slice(res.body.indexOf('<tbody>'))
    expect(body.indexOf('Adam')).toBeLessThan(body.indexOf('mia'))
    expect(body.indexOf('mia')).toBeLessThan(body.indexOf('zoe'))
  })

  it('filters by a column', async () => {
    const res = await get('/users?f_username=mi')
    const body = res.body.slice(res.body.indexOf('<tbody>'))
    expect(body).toContain('mia')
    expect(body).not.toContain('zoe')
  })

  it('renders in the untouched default order with no params', async () => {
    const res = await get('/users')
    const body = res.body.slice(res.body.indexOf('<tbody>'))
    expect(body.indexOf('zoe')).toBeLessThan(body.indexOf('Adam'))
  })

  it('does not 500 on a repeated query key', async () => {
    expect((await get('/users?f_username=a&f_username=b')).statusCode).toBe(200)
  })

  it('ignores an unknown sort key', async () => {
    expect((await get('/users?sort=nonsense')).statusCode).toBe(200)
  })
})

describe('Journey: sortable columns and per-column filters on /tenants', () => {
  it('renders a sort link and a filter row', async () => {
    const res = await get('/tenants')
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('href="/tenants?sort=tenant&amp;dir=asc"')
    expect(res.body).toContain('name="f_tenant"')
    expect(res.body).toMatch(/<tr class="table__filters">\s*<th/)
  })

  it('filters by a column', async () => {
    const res = await get('/tenants?f_tenant=glo')
    const body = res.body.slice(res.body.indexOf('<tbody>'))
    expect(body).toContain('Globex')
    expect(body).not.toContain('Acme')
  })

  it('does not narrow the domain-attach tenant picker when the table is filtered (must-fix 1)', async () => {
    // Regression pin: _manage.ejs's "Attach a custom domain" <select> and the
    // table body used to read the SAME (filtered) `tenants` local. Under that
    // bug, a table filter matching only Globex left this <select> offering
    // Globex alone — an operator could no longer attach a domain to Acme
    // without first clearing the table filter. Fails if `tenants` reverts to
    // the filtered array: the select would then omit 'Acme (acme)'.
    const res = await get('/tenants?f_tenant=glo')
    expect(res.body).toContain('Acme (acme)')
    expect(res.body).toContain('Globex (globex)')
  })

  it('does not claim there are no tenants when a filter simply matches none (must-fix 1)', async () => {
    // Companion pin: under the same bug, `tenants.length === 0` (the local
    // now filtered to nothing) drove BOTH "Create a tenant first." (gating
    // the attach-domain form) and "No tenants yet." (the list's own
    // empty-state) — a deployment full of tenants reporting itself as
    // page-level empty because of an unrelated column filter.
    const res = await get('/tenants?f_tenant=no-such-tenant-anywhere')
    expect(res.statusCode).toBe(200)
    expect(res.body).not.toContain('Create a tenant first.')
    expect(res.body).not.toContain('>No tenants yet.<')
  })

  it('keeps the filter form and a Clear control visible when a filter matches no tenant (must-fix 2)', async () => {
    // Before the fix, /tenants was one of the four tables that wrapped BOTH
    // the filter form and the table in a `tenants.length === 0` branch —
    // filtering to zero hid the filter row itself, stranding the operator
    // with no Clear control short of hand-editing the URL. Fails against
    // that markup: neither the filter input nor a Clear link would render.
    const res = await get('/tenants?f_tenant=no-such-tenant-anywhere')
    expect(res.body).toContain('name="f_tenant"')
    expect(res.body).toContain('No tenants match your filters')
    expect(res.body).toContain('Clear filters')
  })
})

describe('Journey: sortable columns and per-column filters on /identity-providers', () => {
  it('renders a sort link and a filter row', async () => {
    const res = await get('/identity-providers')
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('href="/identity-providers?sort=name&amp;dir=asc"')
    expect(res.body).toContain('name="f_name"')
    expect(res.body).toMatch(/<tr class="table__filters">\s*<th/)
  })

  it('filters by a column', async () => {
    const res = await get('/identity-providers?f_protocol=saml')
    const body = res.body.slice(res.body.indexOf('<tbody>'))
    expect(body).toContain('Corp ADFS')
    expect(body).not.toContain('Okta')
  })

  it('tells a filtered-to-zero result apart from a genuinely empty install (must-fix 2, mild variant)', async () => {
    // Before the fix, the empty <tbody> row always said "No identity
    // providers configured yet." — true for a fresh install, false and
    // confusing when the fixture HAS two providers and a filter simply
    // matched none. Fails against the old markup: the genuinely-empty
    // sentence would render instead of the filter-aware one.
    const res = await get('/identity-providers?f_name=no-such-provider-anywhere')
    expect(res.body).toContain('No identity providers match your filters')
    expect(res.body).not.toContain('No identity providers configured yet.')
  })
})

describe('Journey: sortable columns and per-column filters on /oauth-clients', () => {
  it('renders a sort link and a filter row', async () => {
    const res = await get('/oauth-clients')
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('href="/oauth-clients?sort=issuer&amp;dir=asc"')
    expect(res.body).toContain('name="f_issuer"')
    expect(res.body).toMatch(/<tr class="table__filters">\s*<th/)
  })

  it('filters by a column', async () => {
    const res = await get('/oauth-clients?f_issuer=Partner')
    const body = res.body.slice(res.body.indexOf('<tbody>'))
    expect(body).toContain('Partner Auth0')
    expect(body).not.toContain('Corp Keycloak')
  })

  it('filters Authority by the label rendered on screen, not the raw mode', async () => {
    // Regression pin for the fix-round-1 Critical: the Authority cell renders
    // MODE_LABEL[authorityMode] ('Token decides' for `external`), never the
    // raw enum. A filter keyed on `i.authorityMode` would match the fixture's
    // literal string 'external' — which never appears on the page — and this
    // query would come back empty even though a matching row is right there.
    // Filtering by a fragment that exists ONLY in the label, not the enum,
    // catches that regression; filtering by 'external' would not.
    const res = await get('/oauth-clients?f_authority=decides')
    const body = res.body.slice(res.body.indexOf('<tbody>'))
    expect(body).toContain('Partner Auth0')
    expect(body).not.toContain('Corp Keycloak')
  })

  it('filters Issuer by the issuer URL rendered under the name, not just the name (must-fix 4, THE RULE)', async () => {
    // Regression pin: the Issuer cell (oauth-clients/index.ejs) renders BOTH
    // `i.name` and, in mono underneath it, `i.issuer` — the OIDC issuer URL.
    // 'idp.corp.example' is a fragment of REGISTRY_ISSUER.issuer
    // ('https://idp.corp.example/realms/main') that appears in no row's NAME
    // ('Corp Keycloak' / 'Partner Auth0'). Fails against an accessor reading
    // only `i.name`: this query would come back with zero matching rows even
    // though 'Corp Keycloak' visibly carries that URL on screen.
    const res = await get('/oauth-clients?f_issuer=idp.corp.example')
    const body = res.body.slice(res.body.indexOf('<tbody>'))
    expect(body).toContain('Corp Keycloak')
    expect(body).not.toContain('Partner Auth0')
  })

  it('keeps the filter form and a Clear control visible when a filter matches no issuer (must-fix 2)', async () => {
    // /oauth-clients was one of the four tables that wrapped BOTH the filter
    // form and the table in an `issuers.length === 0` branch — filtering to
    // zero hid the filter row entirely. Fails against that markup: neither
    // the filter input nor a filter-aware message would render.
    const res = await get('/oauth-clients?f_issuer=no-such-issuer-anywhere')
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('name="f_issuer"')
    expect(res.body).toContain('No issuers match your filters')
    // And the genuinely-empty sentence (which names a real deployment state,
    // not a filter result) must not appear alongside it.
    expect(res.body).not.toContain('No issuers registered')
  })
})

describe('Journey: the /tenants filter row is absent inside the setup wizard', () => {
  it('omits the filter row inside the setup wizard', async () => {
    // _manage.ejs is included from the wizard too, where a GET form submitting
    // to /tenants would eject the operator mid-flow.
    const res = await get('/setup/wizard/tenants')
    expect(res.statusCode).toBe(200)
    expect(res.body).not.toContain('name="f_tenant"')
  })
})

describe('Journey: sortable columns and per-column filters on /connect-links', () => {
  it('renders a sort link and a filter row', async () => {
    const res = await get('/connect-links')
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('href="/connect-links?sort=label&amp;dir=asc"')
    expect(res.body).toContain('name="f_label"')
    expect(res.body).toMatch(/<tr class="table__filters">\s*<th/)
  })

  it('sorts by label', async () => {
    const res = await get('/connect-links?sort=label&dir=asc')
    const body = res.body.slice(res.body.indexOf('<tbody>'))
    expect(body.indexOf('Amber onboarding')).toBeLessThan(body.indexOf('Zephyr onboarding'))
  })

  it('filters by label, excluding the non-matching row', async () => {
    const res = await get('/connect-links?f_label=Amber')
    const body = res.body.slice(res.body.indexOf('<tbody>'))
    expect(body).toContain('Amber onboarding')
    expect(body).not.toContain('Zephyr onboarding')
  })

  it('filters the Tenant column by the tenant NAME, not just its id', async () => {
    // Regression pin for THE RULE THAT MATTERS MOST: the Tenant cell (via
    // _tenant.ejs) renders both the resolved name AND the id. 'Traders'
    // appears only in the tenant's name ('Northwind Traders'), never in its
    // id ('t-northwind') or in 'default' — so this only passes if the
    // accessor reads the hoisted tenantLabel, not the bare tenantId.
    const res = await get('/connect-links?f_tenant=Traders')
    const body = res.body.slice(res.body.indexOf('<tbody>'))
    expect(body).toContain('Amber onboarding')
    expect(body).not.toContain('Zephyr onboarding')
  })

  it('filters the Customer column by "anonymous", the cell\'s own fallback text', async () => {
    // Regression pin for the other Task 6 instance: the Customer cell renders
    // '— anonymous' when endUserId is absent. s1 has none; s2's endUserId
    // ('end-user-42') contains no 'anonymous' substring, so this only passes
    // if the accessor falls back to the literal word, not '' or undefined.
    const res = await get('/connect-links?f_customer=anonymous')
    const body = res.body.slice(res.body.indexOf('<tbody>'))
    expect(body).toContain('Zephyr onboarding')
    expect(body).not.toContain('Amber onboarding')
  })

  it('filters Status by the enum value', async () => {
    const res = await get('/connect-links?f_status=consumed')
    const body = res.body.slice(res.body.indexOf('<tbody>'))
    expect(body).toContain('Amber onboarding')
    expect(body).not.toContain('Zephyr onboarding')
  })

  it('keeps the spotlighted link across a sort', async () => {
    const res = await get('/connect-links?link=s1&sort=label&dir=asc')
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('link=s1')
  })

  it('does not raise the deployment-URL warning from a filter that just hides the resolved link (must-fix 7)', async () => {
    // s1 (Zephyr onboarding) is the only ACTIVE session and has a resolved
    // `url`, so the real answer is "no warning needed" regardless of what a
    // table filter narrows the view to. `f_label=Amber` matches only s2
    // (Amber onboarding — consumed, url: null). Computing `active` off the
    // FILTERED rows would see zero active sessions in view and fall back to
    // `!baseUrl` (true here, since this suite's stub answers `getCompanyInfo`
    // with null) — raising a false warning. Fails against that bug.
    const res = await get('/connect-links?f_label=Amber')
    expect(res.statusCode).toBe(200)
    expect(res.body).not.toContain("Set your deployment's public URL")
  })

  it('shows the "Link created" banner for a spotlighted link even when a filter hides its row (must-fix 7)', async () => {
    // `f_label=Amber` matches only s2, hiding s1's row from the table body —
    // but s1 is the link `?link=s1` is spotlighting, freshly "minted".
    // Finding it via `sessions.find(...)` against the FILTERED array would
    // come back null, hiding the whole banner (both the success and
    // no-public-URL variants) even though `justCreatedUrl` was resolved fine.
    // Fails against that bug: neither assertion below would hold.
    const res = await get('/connect-links?link=s1&f_label=Amber')
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('Link created')
    expect(res.body).toContain('value="https://example.com/connect/tok-s1"')
  })

  it('keeps the filter form and a Clear control visible when a filter matches no link (must-fix 2)', async () => {
    // /connect-links was one of the four tables that wrapped BOTH the filter
    // form and the table in a `sessions.length === 0` branch — filtering to
    // zero hid the filter row entirely. Fails against that markup: neither
    // the filter input nor a filter-aware message would render.
    const res = await get('/connect-links?f_label=no-such-link-anywhere')
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('name="f_label"')
    expect(res.body).toContain('No links match your filters')
  })
})

describe('Journey: sortable columns and per-column filters on /connect-link-templates', () => {
  it('renders a sort link and a filter row', async () => {
    const res = await get('/connect-link-templates')
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('href="/connect-link-templates?sort=tenant&amp;dir=asc"')
    expect(res.body).toContain('name="f_tenant"')
    expect(res.body).toMatch(/<tr class="table__filters">\s*<th/)
  })

  it('filters by name, excluding the non-matching row', async () => {
    const res = await get('/connect-link-templates?f_name=Vendor')
    const body = res.body.slice(res.body.indexOf('<tbody>'))
    expect(body).toContain('Vendor onboarding')
    expect(body).not.toContain('Customer self-serve')
  })

  it('filters by tenant id, excluding the non-matching row', async () => {
    const res = await get('/connect-link-templates?f_tenant=globex')
    const body = res.body.slice(res.body.indexOf('<tbody>'))
    expect(body).toContain('Customer self-serve')
    expect(body).not.toContain('Vendor onboarding')
  })

  it('filters Name by a word only in the description (must-fix 6, THE RULE)', async () => {
    // Regression pin: the Name cell (index.ejs:33-40) also renders the
    // description underneath the name. 'finance' appears only in template
    // 1's description ('Onboard finance vendors quickly'), never in either
    // template's name. Fails against an accessor reading bare `t.name`: this
    // query would come back with zero rows even though 'Vendor onboarding'
    // visibly carries that word on screen.
    const res = await get('/connect-link-templates?f_name=finance')
    const body = res.body.slice(res.body.indexOf('<tbody>'))
    expect(body).toContain('Vendor onboarding')
    expect(body).not.toContain('Customer self-serve')
  })

  it('filters Name by the pinned-platform sub-line the cell renders (must-fix 6, THE RULE)', async () => {
    // Companion pin: template 1 is pinned to accounting/fortnox, and the cell
    // renders that as a "accounting/fortnox" sub-line. 'fortnox' appears
    // nowhere in either template's name or description.
    const res = await get('/connect-link-templates?f_name=fortnox')
    const body = res.body.slice(res.body.indexOf('<tbody>'))
    expect(body).toContain('Vendor onboarding')
    expect(body).not.toContain('Customer self-serve')
  })

  it('keeps the filter form and a Clear control visible when a filter matches no template (must-fix 2)', async () => {
    // /connect-link-templates was one of the four tables that wrapped BOTH
    // the filter form and the table in a `templates.length === 0` branch —
    // filtering to zero hid the filter row entirely. Fails against that
    // markup: neither the filter input nor a filter-aware message would
    // render.
    const res = await get('/connect-link-templates?f_name=no-such-template-anywhere')
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('name="f_name"')
    expect(res.body).toContain('No templates match your filters')
  })
})

describe('Journey: sortable columns and per-column filters on /webhooks', () => {
  it('renders a sort link and a filter row', async () => {
    const res = await get('/webhooks')
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('href="/webhooks?sort=label&amp;dir=asc"')
    expect(res.body).toContain('name="f_label"')
    expect(res.body).toMatch(/<tr class="table__filters">\s*<th/)
  })

  it('filters by label, excluding the non-matching row', async () => {
    const res = await get('/webhooks?f_label=Billing')
    const body = res.body.slice(res.body.indexOf('<tbody>'))
    expect(body).toContain('Billing hook')
    expect(body).not.toContain('Shipping hook')
  })

  it('still honours the old ?search= URL on /webhooks', async () => {
    // Bookmarked and documented URLs must not break when the form above the
    // table is absorbed into it.
    const res = await get('/webhooks?search=billing')
    expect(res.statusCode).toBe(200)
    const body = res.body.slice(res.body.indexOf('<tbody>'))
    expect(body).toContain('Billing hook')
    expect(body).not.toContain('Shipping hook')
  })

  it('still matches via the URL when the legacy ?search= term is not in the label', async () => {
    // Fix-round-1, Important 6: the deleted form's one search box matched
    // label OR url; the Label column's own accessor must stay label-only per
    // THE RULE (the explicit f_label box must match only what the Label cell
    // renders), so `search`'s legacy alias hangs off a separate hidden
    // column instead — see webhooksTable()'s doc comment. '/billing' (with
    // the leading slash) is a path fragment present in wh-1's URL but not in
    // its label ('Billing hook' has no slash), so this only passes if the
    // hidden column's combined label+url accessor is what is actually
    // matched, not the Label column's label-only one.
    const res = await get('/webhooks?search=%2Fbilling')
    const body = res.body.slice(res.body.indexOf('<tbody>'))
    expect(body).toContain('Billing hook')
    expect(body).not.toContain('Shipping hook')
  })

  it('carries a hidden column\'s active filter across a plain form submit (fix-round-2, Important A)', async () => {
    // _table-filters-form.ejs previously emitted hidden inputs only for
    // `preserve` keys and sort state. A hidden column (the `search` alias)
    // has no visible control anywhere in the DOM, so nothing associated
    // `f_search` with the filter form — reaching /webhooks?search=/billing
    // and then submitting the form for ANY reason (typing in the Label box,
    // clicking Search) dropped the search filter entirely, silently
    // widening the result set with a lone "Clear" button as the only
    // on-screen evidence anything had been filtered at all. `tableQs` and
    // `sortHref` were fine — this was specifically the form-submit path.
    // No jsdom here (journey-harness.md), so an actual submit cannot be
    // executed; this pins the hidden input the browser would serialise.
    const res = await get('/webhooks?search=%2Fbilling')
    expect(res.body).toContain(
      '<input type="hidden" form="webhooks-filters" name="f_search" value="/billing">',
    )
  })

  it('lets the explicit tenant filter win over the legacy ?tenantId=', async () => {
    // Fix-round-1, Important 3/4: Tenant is now the enum select the deleted
    // form used, so this is where "explicit wins over legacy on the SAME
    // column" is now provable for /webhooks — `search`/`f_label` no longer
    // share a column (see the test above), but `tenantId`/`f_tenant` still do.
    const res = await get('/webhooks?tenantId=default&f_tenant=t-northwind')
    const body = res.body.slice(res.body.indexOf('<tbody>'))
    expect(body).toContain('Shipping hook')
    expect(body).not.toContain('Billing hook')
  })

  it('still honours the old ?tenantId= URL', async () => {
    const res = await get('/webhooks?tenantId=t-northwind')
    const body = res.body.slice(res.body.indexOf('<tbody>'))
    expect(body).toContain('Shipping hook')
    expect(body).not.toContain('Billing hook')
  })

  it('renders Tenant as a <select>, not a text box, matching the control it replaced', async () => {
    // Fix-round-1, Important 3: the deleted above-table form's tenant
    // control was a `<select>` of id/name pairs (webhooks/index.ejs, before
    // Task 7), and the corrections file's rule — "enum columns render a
    // <select> wherever an above-table select existed today" — was applied
    // to /scope-groups but missed here.
    const res = await get('/webhooks')
    expect(res.body).toMatch(/<select[^>]*\bname="f_tenant"/)
    expect(res.body).not.toMatch(/<input[^>]*\bname="f_tenant"/)
    expect(res.body).toContain('Northwind Traders (t-northwind)')
  })

  it('filters Tenant by the exact id the select submits, matching the store\'s exact-match query', async () => {
    // Fix-round-1, Important 4: `listWebhookSubs`'s upstream tenantId filter
    // is an exact match, not a substring. A text box accepting "northwind"
    // (a fragment of the tenant NAME, not its id) would have found zero rows
    // upstream before any client-side filtering ran. The enum select removes
    // that trap: only a real tenant id is ever submitted.
    const res = await get('/webhooks?f_tenant=t-northwind')
    const body = res.body.slice(res.body.indexOf('<tbody>'))
    expect(body).toContain('Shipping hook')
    expect(body).not.toContain('Billing hook')
  })

  it('filters URL directly, a column the old search-only form could not target', async () => {
    const res = await get('/webhooks?f_url=shipping')
    const body = res.body.slice(res.body.indexOf('<tbody>'))
    expect(body).toContain('Shipping hook')
    expect(body).not.toContain('Billing hook')
  })

  it('sorts Delivery by the FORMAT LABEL the cell renders, ascending', async () => {
    // Fix-round-1, Important 5, corrected fix-round-2 (Important B + the
    // fold-in): the "Delivery" column's cell renders FORMAT_LABELS[s.format]
    // — never a delivery status (`s.lastStatus`, a different column's data
    // entirely) and never the raw `s.format` SLUG either (a simplified key is
    // fine for a sort-only column, but not one that visibly disagrees with
    // what's on screen). wh-1 is 'teams' ('Microsoft Teams'); wh-2 has no
    // `format` and falls back to 'opensteward' ('OpenSteward envelope').
    // Slug order puts wh-2 first ('opensteward' < 'teams'); LABEL order puts
    // wh-1 first ('Microsoft Teams' < 'OpenSteward envelope') — a genuine
    // inversion, so this fails against either wrong accessor, not just
    // passes vacuously on `res.statusCode`.
    const res = await get('/webhooks?sort=delivery&dir=asc')
    const body = res.body.slice(res.body.indexOf('<tbody>'))
    expect(body.indexOf('Billing hook')).toBeLessThan(body.indexOf('Shipping hook'))
  })

  it('sorts Delivery by the FORMAT LABEL the cell renders, descending', async () => {
    const res = await get('/webhooks?sort=delivery&dir=desc')
    const body = res.body.slice(res.body.indexOf('<tbody>'))
    expect(body.indexOf('Shipping hook')).toBeLessThan(body.indexOf('Billing hook'))
  })

  it('renders the empty state with a Clear control, not a bare "no webhooks configured", when a filter matches nothing', async () => {
    // Fix-round-1, Critical 2 regression pin (companion to the two restored
    // assertions in wizard-webhooks-parity.test.ts): the filter row and a
    // Clear affordance must survive a filter that empties the table, not
    // just the case where SOME rows still match.
    const res = await get('/webhooks?f_url=no-such-fragment-anywhere')
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('name="f_url"')
    expect(res.body).toContain('empty-state--no-results')
    expect(res.body).toContain('href="/webhooks">Clear filter</a>')
  })
})

describe('Journey: the URL column wraps and offers a copy control on /webhooks', () => {
  // The cell used to be `overflow: hidden; text-overflow: ellipsis` with no
  // `white-space: nowrap` — ellipsis never painted (it requires nowrap), so
  // the hidden overflow just chopped a long endpoint off with nothing to
  // show it had happened. This pins the replacement, `.webhooks-url` (which
  // wraps instead — see style.css for why), and that the old clipping rule
  // does not come back; a plain `statusCode === 200` check would pass
  // whether or not either fix were reverted, since the full URL was always
  // in the server-rendered HTML — only its CSS treatment was wrong.
  it('gives the URL cell the wrapping class and drops the old clip-without-ellipsis rule', async () => {
    const res = await get('/webhooks')
    // Scoped to the URL <td> itself, not the whole response body. /connections
    // already wraps its table in `<div class="card" style="...overflow:
    // hidden">` (views/connections/index.ejs), so a whole-body
    // `not.toContain('overflow: hidden')` would fail the day /webhooks picks
    // up the same card wrapper, for a reason that has nothing to do with what
    // this test actually pins — the URL cell's own CSS treatment.
    const cellStart = res.body.indexOf('class="mono webhooks-url"')
    expect(cellStart).toBeGreaterThan(-1)
    const cell = res.body.slice(cellStart, res.body.indexOf('</td>', cellStart))
    expect(cell).not.toContain('text-overflow: ellipsis')
    expect(cell).not.toContain('overflow: hidden')
    expect(cell).not.toContain('max-width: 400px')
  })

  // data-copy, not an inline onclick: layout.ejs already delegates a global
  // [data-copy] click handler (see webhooks/_secret-once.ejs, which this same
  // page uses for the signing secret), so this table needs no handler of its
  // own — and no-interpolation-in-inline-js.test.ts would reject one anyway.
  it('renders a real Copy button per row carrying the full URL in data-copy', async () => {
    const res = await get('/webhooks')
    expect(res.body).toContain('data-copy="https://hooks.example.com/billing"')
    expect(res.body).toContain('data-copy="https://hooks.example.com/shipping"')
    expect(res.body).toMatch(
      /<button type="button"[^>]*data-copy="https:\/\/hooks\.example\.com\/billing"[^>]*aria-label="Copy webhook URL"/,
    )
  })
})

describe('Journey: sortable columns and per-column filters on /scope-groups', () => {
  it('renders a sort link and a filter row', async () => {
    const res = await get('/scope-groups')
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('href="/scope-groups?sort=name&amp;dir=asc"')
    expect(res.body).toContain('name="f_name"')
    expect(res.body).toMatch(/<tr class="table__filters">\s*<th/)
  })

  it('filters by name, excluding the non-matching row', async () => {
    const res = await get('/scope-groups?f_name=Read-only')
    const body = res.body.slice(res.body.indexOf('<tbody>'))
    expect(body).toContain('Read-only books')
    expect(body).not.toContain('Sales sync')
  })

  it('filters Vertical through the enum select, excluding the non-matching row', async () => {
    const res = await get('/scope-groups?f_vertical=crm')
    const body = res.body.slice(res.body.indexOf('<tbody>'))
    expect(body).toContain('Sales sync')
    expect(body).not.toContain('Read-only books')
  })

  it('filters Platform through the enum select, excluding the non-matching row', async () => {
    const res = await get('/scope-groups?f_platform=nutshell')
    const body = res.body.slice(res.body.indexOf('<tbody>'))
    expect(body).toContain('Sales sync')
    expect(body).not.toContain('Read-only books')
  })

  it('still honours the old ?vertical= and ?platform= URLs', async () => {
    const res = await get('/scope-groups?vertical=crm')
    const body = res.body.slice(res.body.indexOf('<tbody>'))
    expect(body).toContain('Sales sync')
    expect(body).not.toContain('Read-only books')
  })

  it('populates the Platform filter select from the provider catalog and repoints the cascade at it', async () => {
    // No jsdom in this harness (see journey-harness.md), so the cascade
    // script's runtime narrowing cannot be executed here. This pins what it
    // depends on: the platform select is genuinely populated server-side
    // (not the old empty "All platforms"-only shell) with every catalogued
    // platform, the script is repointed at the filter-row controls by
    // name+form rather than the deleted #sg-filter-* ids, and the serialised
    // PROVIDERS payload carries the vertical tag each option is narrowed by.
    const res = await get('/scope-groups')
    expect(res.body).toContain('<option value="fortnox">Fortnox (fortnox)</option>')
    expect(res.body).toContain('<option value="nutshell">Nutshell (nutshell)</option>')
    expect(res.body).toContain('select[name="f_vertical"][form="scope-groups-filters"]')
    expect(res.body).toContain('select[name="f_platform"][form="scope-groups-filters"]')
    expect(res.body).toContain('"vertical":"accounting"')
    expect(res.body).toContain('"vertical":"crm"')
  })

  it('places the cascade script AFTER the select markup it queries for (fix-round-1, Critical 1)', async () => {
    // The prior round's fix greped the script's source text only, which
    // cannot see WHERE in the document it sits — and it sat above the
    // `_table-head` include that renders the selects. A plain synchronous
    // `<script>` runs the instant the parser reaches it, so
    // `document.querySelector('select[name="f_vertical"]...')` found nothing
    // at that position and the `if (!verticalEl || !platformEl) return`
    // guard fired on every load — the cascade never ran. Document ORDER,
    // not merely the script's presence somewhere on the page, is the
    // property that actually matters here.
    const res = await get('/scope-groups')
    const selectMarkupIdx = res.body.indexOf('name="f_platform"')
    const scriptQueryIdx = res.body.indexOf('querySelector(\'select[name="f_platform"]')
    expect(selectMarkupIdx).toBeGreaterThan(-1)
    expect(scriptQueryIdx).toBeGreaterThan(-1)
    expect(scriptQueryIdx).toBeGreaterThan(selectMarkupIdx)
  })

  it('renders the filter row (and the platform select the screenshot spec waits on) even with a post-filter tbody of zero', async () => {
    // Companion to the bare-stub pin in bare-stub-renders-every-page.test.ts
    // (which covers the zero-groups-no-filter shape scripts/screenshots
    // /seed.ts's skippable seedScopeGroup can leave behind). This fixture
    // always has groups upstream, so it covers the sibling shape instead:
    // a filter that narrows the CURRENT view to zero must not take the
    // select down with it — specs.ts's scope-groups-list screenshot waits on
    // `select[name="f_platform"]` regardless of which shape produced the
    // empty table.
    const res = await get('/scope-groups?f_name=matches-nothing-at-all')
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('name="f_platform"')
    expect(res.body).toContain('No scope groups match your filters')
  })

  it('tells a filtered-to-zero result apart from a genuinely empty install', async () => {
    // Fix-round-1 deferred minor: the collapsed single message ("No scope
    // groups match.") told a fresh install with zero groups ever created
    // the same thing it told an operator whose filter matched nothing. This
    // fixture always has groups, so it proves the filtered-empty half; the
    // genuinely-empty half (zero groups, no filter) is pinned separately
    // against the bare stub in bare-stub-renders-every-page.test.ts, since
    // this file's fixture data can't produce that combination.
    const res = await get('/scope-groups?f_name=matches-nothing-at-all')
    expect(res.body).toContain('No scope groups match your filters')
    expect(res.body).not.toContain('No scope groups yet.')
  })
})

describe('Journey: sortable columns and per-column filters on /api-keys', () => {
  it('renders a sort link and a filter row', async () => {
    const res = await get('/api-keys')
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('href="/api-keys?sort=label&amp;dir=asc"')
    expect(res.body).toContain('name="f_label"')
    expect(res.body).toMatch(/<tr class="table__filters">\s*<th/)
  })

  it('filters by label, excluding the non-matching row', async () => {
    const res = await get('/api-keys?f_label=CI')
    const body = res.body.slice(res.body.indexOf('<tbody>'))
    expect(body).toContain('CI runner')
    expect(body).not.toContain('Local dev')
  })

  it('still honours the old ?tenantId= URL', async () => {
    const res = await get('/api-keys?tenantId=t-northwind')
    const body = res.body.slice(res.body.indexOf('<tbody>'))
    expect(body).toContain('Local dev')
    expect(body).not.toContain('CI runner')
  })

  it('lets the explicit tenant filter win over the legacy ?tenantId=', async () => {
    const res = await get('/api-keys?tenantId=default&f_tenant=t-northwind')
    const body = res.body.slice(res.body.indexOf('<tbody>'))
    expect(body).toContain('Local dev')
    expect(body).not.toContain('CI runner')
  })

  it('renders Tenant as a <select>, not a text box (must-fix 5)', async () => {
    // Before the fix, Tenant was `filter: 'text'` — a substring box over a
    // store whose upstream filter is an EXACT match (`where('tenant_id','=',
    // tenantId)`), so a natural substring like "north" for id "t-northwind"
    // returned zero rows before any client-side filtering ran. The fix makes
    // it an enum <select> whose option values are exact tenant ids, same
    // shape as /webhooks' Tenant column. Fails against the reverted `filter:
    // 'text'`: no <select name="f_tenant"> would render, and an <input> would
    // instead.
    const res = await get('/api-keys')
    expect(res.body).toMatch(/<select[^>]*\bname="f_tenant"/)
    expect(res.body).not.toMatch(/<input[^>]*\bname="f_tenant"/)
    expect(res.body).toContain('Northwind Traders (t-northwind)')
  })

  it('filters the Label column by the prefix, the cell\'s own fallback when a key has no label', async () => {
    // Regression pin: the Label cell renders `k.label || k.prefix`. An
    // accessor reading the bare `k.label` field would see `undefined` for
    // this row and exclude it from a filter matching the prefix visibly
    // shown in its place.
    const res = await get('/api-keys?f_label=nolabel3')
    const body = res.body.slice(res.body.indexOf('<tbody>'))
    expect(body).toContain('osk_nolabel3')
    expect(body).not.toContain('CI runner')
    expect(body).not.toContain('Local dev')
  })

  it('filters the Mode column by "live", matching a key with no mode field via the badge\'s own fallback', async () => {
    // Regression pin: the Mode cell renders `k.mode === 'test' ? 'Test' :
    // 'Live'` — anything that is not literally 'test' (including an absent
    // field, on a key minted by an older admin-api) reads as Live.
    const res = await get('/api-keys?f_mode=live')
    const body = res.body.slice(res.body.indexOf('<tbody>'))
    expect(body).toContain('osk_nolabel3')
    expect(body).toContain('CI runner')
    expect(body).not.toContain('Local dev')
  })

  it('keeps the filter row aligned with the header row for a non-admin viewer', async () => {
    // Regression pin for the conditional-Actions-column hazard: a fixed
    // module-level column list would put a filter box under a column that
    // does not exist for operator and viewer roles, misaligning every cell
    // in the row.
    const res = await get('/api-keys', 'operator')
    expect(res.statusCode).toBe(200)
    const headerRow = res.body.match(/<tr class="table__headers[^"]*">([\s\S]*?)<\/tr>/)
    const filterRow = res.body.match(/<tr class="table__filters">([\s\S]*?)<\/tr>/)
    expect(headerRow).not.toBeNull()
    expect(filterRow).not.toBeNull()
    const headerCount = (headerRow![1].match(/<th/g) ?? []).length
    const filterCount = (filterRow![1].match(/<th/g) ?? []).length
    expect(filterCount).toBe(headerCount)
    // And the Actions column itself is absent for this role — the row that
    // would misalign if the spec were built once at module scope.
    expect(res.body).not.toContain('/rotate"')
  })

  it('keeps the header and filter rows aligned for an admin too, now with Actions', async () => {
    const res = await get('/api-keys', 'admin')
    const headerRow = res.body.match(/<tr class="table__headers[^"]*">([\s\S]*?)<\/tr>/)
    const filterRow = res.body.match(/<tr class="table__filters">([\s\S]*?)<\/tr>/)
    const headerCount = (headerRow![1].match(/<th/g) ?? []).length
    const filterCount = (filterRow![1].match(/<th/g) ?? []).length
    expect(filterCount).toBe(headerCount)
  })
})

describe('Journey: sortable columns, filtering and pagination on /platforms (Configure tab)', () => {
  beforeEach(() => {
    // Undo any override an earlier pagination test made — a plain variable,
    // not a vi.fn(), so vi.clearAllMocks() in the file-level afterEach does
    // not reset it.
    platformRowsByVertical = PLATFORM_ROWS_DEFAULT
  })

  it('renders a sort link and a filter row', async () => {
    const res = await get('/platforms?tab=configure&status=all')
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain(
      'href="/platforms?sort=platform&amp;dir=asc&amp;tab=configure&amp;status=all"',
    )
    expect(res.body).toContain('name="f_platform"')
    expect(res.body).toMatch(/<tr class="table__filters">\s*<th/)
    expect(res.body.indexOf('id="platforms-filters"')).toBeLessThan(res.body.indexOf('<table'))
  })

  it('sorts by platform, descending — a direction the fixture\'s row order cannot satisfy by accident', async () => {
    // PLATFORM_ROWS_DEFAULT.accounting is [fortnox, xero], and the route
    // builds `all` in that order — so an ascending assertion here would pass
    // even with sorting reverted entirely (or the sort key silently
    // misspelled so parseTableQuery drops it to null), because the UNSORTED
    // default already puts fortnox before xero. Asserting descending is the
    // only direction the fixture's own order cannot satisfy by accident.
    const res = await get('/platforms?tab=configure&status=all&sort=platform&dir=desc')
    const body = res.body.slice(res.body.indexOf('<tbody>'))
    expect(body.indexOf('xero')).toBeLessThan(body.indexOf('fortnox'))
  })

  it('filters by platform, excluding the non-matching row', async () => {
    const res = await get('/platforms?tab=configure&status=all&f_platform=fortnox')
    const body = res.body.slice(res.body.indexOf('<tbody>'))
    expect(body).toContain('fortnox')
    expect(body).not.toContain('xero')
  })

  it('paginates the configure tab instead of emitting every platform', async () => {
    platformRowsByVertical = { accounting: MANY_PLATFORMS }
    const res = await get('/platforms?tab=configure&status=all')
    expect(res.statusCode).toBe(200)
    // 50 rows + the two header <tr>s, not the fixture's full 60.
    const rows = (res.body.match(/<tr/g) ?? []).length
    expect(rows).toBeLessThan(60)
    expect(res.body).toContain('page=2')
  })

  it('carries the sort, the filter and the tab into the pagination links', async () => {
    // filterQs must include everything: dropping a param silently widens the
    // result set on page 2. (`f_platform=plat` matches all 60 fixture rows,
    // so page 2 still exists after filtering.)
    platformRowsByVertical = { accounting: MANY_PLATFORMS }
    const res = await get(
      '/platforms?tab=configure&status=all&sort=platform&dir=desc&f_platform=plat',
    )
    expect(res.statusCode).toBe(200)
    const pageLink = res.body.match(/href="\/platforms\?([^"]*)"/g)?.find((h) => h.includes('page=2'))
    expect(pageLink).toBeDefined()
    expect(pageLink).toContain('sort=platform')
    expect(pageLink).toContain('dir=desc')
    expect(pageLink).toContain('f_platform=plat')
    expect(pageLink).toContain('tab=configure')
  })

  it('reflects the FILTERED count in the pagination total, not the unfiltered one', async () => {
    platformRowsByVertical = { accounting: MANY_PLATFORMS }
    const resAll = await get('/platforms?tab=configure&status=all')
    expect(resAll.body).toContain('of 60')

    // plat-00..plat-09 — exactly 10 of the 60 rows contain 'plat-0'.
    const resFiltered = await get('/platforms?tab=configure&status=all&f_platform=plat-0')
    expect(resFiltered.body).toContain('of 10')
    expect(resFiltered.body).not.toContain('of 60')
  })

  it('renders the filter row and a Clear control when a filter matches nothing', async () => {
    const res = await get('/platforms?tab=configure&status=all&f_platform=no-such-platform-anywhere')
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('name="f_platform"')
    expect(res.body).toMatch(/<tr class="table__filters">\s*<th/)
    // The exact above-table Clear control, not merely the substring "Clear"
    // — the empty state's own "Clear filters" link (a different, decorative
    // anchor) also contains that substring, so a bare `toContain('Clear')`
    // would still pass if this control were deleted entirely.
    expect(res.body).toContain('<a class="btn btn--ghost btn--sm" href="/platforms?tab=configure">Clear</a>')
  })

  it('serialises the live status <select> after the preserve hidden input, so the operator\'s pick wins', async () => {
    // The whole duplicate-`status=` design (see the Task 8 report) depends
    // on the live <select> at index.ejs coming AFTER the hidden `status`
    // input _table-filters-form.ejs emits from `preserve` — HTML form
    // submission serialises same-name controls in DOM tree order, and
    // table-controls.ts's `one()` takes the LAST value. If a later cleanup
    // moves the visible filter/status row above the (invisible) filter
    // <form>, the stale hidden value would serialise last and win instead —
    // an operator picking "Enabled" would silently get the previous filter
    // back, with no error and no other test noticing.
    const res = await get('/platforms?tab=configure&status=enabled')
    expect(res.body.indexOf('<select class="select select--sm" name="status"')).toBeGreaterThan(
      res.body.indexOf('<input type="hidden" form="platforms-filters" name="status"'),
    )
  })
})

describe('Journey: sortable columns and per-column filters on /connections (Task 3)', () => {
  it('renders a sort link and a filter row', async () => {
    const res = await get('/connections')
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('href="/connections?sort=label&amp;dir=asc"')
    expect(res.body).toContain('name="f_label"')
    expect(res.body).toMatch(/<tr class="table__filters">\s*<th/)
    // Filter-row cells are <th>, never <td> — table-filter-form-placement.test.ts
    // and no-interpolation-in-inline-js.test.ts both police this file's shape,
    // and the form lives OUTSIDE the <table>. The presence check comes first:
    // `indexOf(...).toBeLessThan(...)` alone passes vacuously if the form
    // include were deleted entirely (-1 is less than any real index).
    expect(res.body).toContain('id="connections-filters"')
    expect(res.body.indexOf('id="connections-filters"')).toBeLessThan(res.body.indexOf('<table'))
  })

  /**
   * The highest-value assertion in this file. /connections does NOT call
   * applyTableQuery — admin-api paginates at 50/page, so it alone holds the
   * whole set — the route FORWARDS sort/dir/f_* instead (connections.ts's
   * `connectionsTable` doc comment). A lazy implementation that quietly
   * sorted/filtered the one page already in hand with applyTableQuery would
   * still pass every rendering assertion in this file; only checking what
   * was actually asked of admin-api catches it.
   */
  it('forwards the sort and the filters to admin-api rather than applying them locally', async () => {
    await get('/connections?sort=label&dir=desc&f_status=valid')
    expect(mockListConnectionsPaged).toHaveBeenCalledWith(
      'jwt',
      expect.objectContaining({ sort: 'label', dir: 'desc', f_status: 'valid' }),
    )
  })

  it('a filter narrows the table, excluding the non-matching row', async () => {
    const res = await get('/connections?f_status=valid')
    const body = res.body.slice(res.body.indexOf('<tbody>'))
    expect(body).toContain('Acme Books')
    expect(body).not.toContain('Northwind Shop')
  })

  it('renders rows in the order admin-api returns for a given sort, not a locally re-derived one', async () => {
    // Descending by label: 'Northwind Shop' sorts before 'Acme Books'. The
    // fixture's own row order is Acme-then-Northwind, so this only passes if
    // the view actually renders what the (sort-aware) mock returned, not the
    // unsorted default.
    const res = await get('/connections?sort=label&dir=desc')
    const body = res.body.slice(res.body.indexOf('<tbody>'))
    expect(body.indexOf('Northwind Shop')).toBeLessThan(body.indexOf('Acme Books'))
  })

  it('keeps the filter row and a Clear control visible when a filter matches no connection', async () => {
    const res = await get('/connections?f_label=no-such-connection-anywhere')
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('name="f_label"')
    expect(res.body).toContain('No connection matches')
    expect(res.body).toContain('href="/connections">Clear filters</a>')
  })

  /**
   * Regression pin for the conditional-Actions-column hazard — the actual
   * hazard, not the weaker header-vs-filter-row comparison Plan 1's brief
   * asked for and this suite inherited. `_table-head.ejs` builds BOTH the
   * header row and the filter row from ONE loop over `tableSpec.columns`
   * (lines 10 and 20), so those two counts are equal BY CONSTRUCTION
   * regardless of whether the manifest is built per-request or hoisted to
   * module scope with a fixed Actions column — comparing them catches
   * nothing about the thing this test exists to guard.
   *
   * What would actually break under a hoisted, fixed-column manifest: a
   * viewer gets 8 `<th>` in `<thead>` (Actions included, because the spec no
   * longer varies by role) but each `<tbody>` row still only renders 7
   * `<td>` (the view's own `<% if (canAct) %>` around the Actions cell still
   * gates correctly) — thead and tbody disagree. Comparing the header
   * against the actual rendered ROW is what catches that.
   */
  it('keeps the header row aligned with the actual rendered row for a non-operator viewer', async () => {
    const res = await get('/connections', 'viewer')
    expect(res.statusCode).toBe(200)
    const headerRow = res.body.match(/<tr class="table__headers[^"]*">([\s\S]*?)<\/tr>/)
    const firstBodyRow = res.body.match(/<tbody>[\s\S]*?<tr>([\s\S]*?)<\/tr>/)
    expect(headerRow).not.toBeNull()
    expect(firstBodyRow).not.toBeNull()
    const headerCount = (headerRow![1].match(/<th/g) ?? []).length
    const rowCellCount = (firstBodyRow![1].match(/<td/g) ?? []).length
    expect(rowCellCount).toBe(headerCount)
    // And the Actions column itself is absent for this role.
    expect(res.body).not.toContain('Sync now')
  })

  it('keeps the header row aligned with the actual rendered row for an operator too, now with Actions', async () => {
    const res = await get('/connections', 'operator')
    const headerRow = res.body.match(/<tr class="table__headers[^"]*">([\s\S]*?)<\/tr>/)
    const firstBodyRow = res.body.match(/<tbody>[\s\S]*?<tr>([\s\S]*?)<\/tr>/)
    expect(headerRow).not.toBeNull()
    expect(firstBodyRow).not.toBeNull()
    const headerCount = (headerRow![1].match(/<th/g) ?? []).length
    const rowCellCount = (firstBodyRow![1].match(/<td/g) ?? []).length
    expect(rowCellCount).toBe(headerCount)
    expect(res.body).toContain('Sync now')
  })

  /**
   * fix-round-1, Important 1: Platform is a TEXT box, not an enum — reverted
   * from the original design, which put it in the enum group alongside
   * Tenant/Vertical/Status. `f_platform` is a case-INsensitive SUBSTRING
   * server-side (apps/admin-api's connections.ts), not an exact match, so a
   * `<select>` would promise exact selection while the server matches a
   * fragment — exactly the UI/server divergence an enum exists to prevent.
   * Real prefix-overlapping platform slugs exist in the adapter tree
   * (`fortnox`/none-here-but-`clear`/`clearbooks` elsewhere in accounting),
   * so this also pins that a *narrower* substring still matches: 'fort'
   * finds 'fortnox' the same as the full slug would.
   */
  it('renders Platform as a text box, not a <select> — f_platform is a substring match server-side', async () => {
    const res = await get('/connections')
    expect(res.body).toMatch(/<input[^>]*\bname="f_platform"/)
    expect(res.body).not.toMatch(/<select[^>]*\bname="f_platform"/)
  })

  it('filters Platform by a substring, not just the full slug — matching admin-api\'s own semantics', async () => {
    const res = await get('/connections?f_platform=fort')
    const body = res.body.slice(res.body.indexOf('<tbody>'))
    expect(body).toContain('Acme Books')
    expect(body).not.toContain('Northwind Shop')
  })

  it('renders Tenant, Vertical and Status as <select>s, and Label/Connection id/Platform as text boxes', async () => {
    const res = await get('/connections')
    for (const name of ['f_tenant', 'f_vertical', 'f_status']) {
      expect(res.body).toMatch(new RegExp(`<select[^>]*\\bname="${name}"`))
    }
    for (const name of ['f_label', 'f_id', 'f_platform']) {
      expect(res.body).toMatch(new RegExp(`<input[^>]*\\bname="${name}"`))
      expect(res.body).not.toMatch(new RegExp(`<select[^>]*\\bname="${name}"`))
    }
  })

  it('filters Status through the enum select, excluding the non-matching row', async () => {
    const res = await get('/connections?f_status=expired')
    const body = res.body.slice(res.body.indexOf('<tbody>'))
    expect(body).toContain('Northwind Shop')
    expect(body).not.toContain('Acme Books')
  })

  it('filters Tenant through the enum select, exact id, excluding the non-matching row', async () => {
    const res = await get('/connections?f_tenant=t-northwind')
    const body = res.body.slice(res.body.indexOf('<tbody>'))
    expect(body).toContain('Northwind Shop')
    expect(body).not.toContain('Acme Books')
  })

  it('still honours the old ?status= URL via the Status column\'s legacy alias', async () => {
    const res = await get('/connections?status=expired')
    const body = res.body.slice(res.body.indexOf('<tbody>'))
    expect(body).toContain('Northwind Shop')
    expect(body).not.toContain('Acme Books')
  })

  it('still honours the old ?vertical= URL via the Vertical column\'s legacy alias', async () => {
    const res = await get('/connections?vertical=ecommerce')
    const body = res.body.slice(res.body.indexOf('<tbody>'))
    expect(body).toContain('Northwind Shop')
    expect(body).not.toContain('Acme Books')
  })

  /**
   * fix-round-1, Important 2: the old combined `?search=` (id OR label) must
   * keep WORKING, not merely be accepted without 400ing. admin-api's own
   * `search` param still implements id-or-label (apps/admin-api's
   * connections.ts), so this is a faithful forward through the hidden
   * `search` column — `FILTER_PARAM.search === 'search'`, never `f_search`,
   * which admin-api does not declare and would silently drop. '1111' is a
   * fragment of Acme Books' id only, appearing in neither row's label — so
   * this only passes if the match is genuinely against the id, not a
   * degraded label-only alias (which is what fix-round-1 replaced).
   */
  it('still matches by CONNECTION ID via the legacy ?search=, not just label', async () => {
    const res = await get('/connections?search=1111')
    const body = res.body.slice(res.body.indexOf('<tbody>'))
    expect(body).toContain('Acme Books')
    expect(body).not.toContain('Northwind Shop')
  })

  it('forwards ?search= to admin-api under its own plain `search` param, not f_search', async () => {
    await get('/connections?search=1111')
    const [, filters] = mockListConnectionsPaged.mock.calls[0]!
    expect(filters).toMatchObject({ search: '1111' })
    expect(filters).not.toHaveProperty('f_search')
  })

  /**
   * Task 2 review carry (b): admin-api's LEGACY `?platform=` filter is a
   * case-SENSITIVE substring, while its `?f_platform=` is case-INsensitive —
   * a bookmarked `?platform=Shopify` could behave differently from typing
   * the same text into the (now-text-box) filter row. It does not here,
   * because this route only ever forwards through `f_platform` (never the
   * bare legacy `platform` key, via `FILTER_PARAM`) — so a legacy bookmark
   * and a fresh filter-row submit both always take the case-insensitive
   * path. This is the test that would fail if a future edit reverted to
   * forwarding the raw legacy params, the way the pre-Task-3 route did.
   */
  it('forwards a legacy ?platform= bookmark through the case-insensitive f_platform, never the case-sensitive legacy path', async () => {
    await get('/connections?platform=Shopify')
    const [, filters] = mockListConnectionsPaged.mock.calls[0]!
    expect(filters).toMatchObject({ f_platform: 'Shopify' })
    expect(filters).not.toHaveProperty('platform')
    expect(filters).not.toHaveProperty('vertical')
    expect(filters).not.toHaveProperty('status')
  })

  /**
   * Fix wave: the connection-id Copy button used to be an inline
   * `onclick="(function(b){navigator.clipboard.writeText(b.dataset.id)})(this)"`
   * — no `.then()`, so a failed copy (clipboard permission denied, no secure
   * context) failed silently with no feedback. Commit 398011cde upgraded
   * /webhooks to the global delegated `[data-copy]` handler in layout.ejs
   * (which reports success/failure via `window.oiToast`) for exactly this
   * reason, but commit 6fc43a6b9 rewrote this page afterwards and did not
   * carry the fix across. `data-copy`, not an inline handler: it also sidesteps
   * no-interpolation-in-inline-js.test.ts, which bans EJS output inside an
   * `on*` attribute. Fails against the reverted onclick markup: neither
   * `data-copy` attribute nor the aria-labelled button pattern would be
   * present, and the old onclick string would be back.
   */
  it('renders the connection-id Copy button via the shared data-copy handler, not an inline onclick', async () => {
    const res = await get('/connections')
    expect(res.body).toContain('data-copy="c-fortnox-1111"')
    expect(res.body).toContain('data-copy="c-shopify-2222"')
    expect(res.body).not.toContain(
      'onclick="(function(b){navigator.clipboard.writeText(b.dataset.id)})(this)"',
    )
    expect(res.body).toMatch(
      /<button type="button"[^>]*data-copy="c-fortnox-1111"[^>]*aria-label="Copy connection id"/,
    )
  })
})
