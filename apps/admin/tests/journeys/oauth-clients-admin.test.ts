/**
 * Configuring OIDC bearer auth from the admin UI.
 *
 * The page has to carry one uncomfortable fact honestly: which authority mode
 * the operator picks decides whether a leaked token can be revoked at all.
 * `registry` and `intersect` consult the client row on every request, so
 * deleting it cuts a live token off; `external` reads authority out of the
 * token, so nothing stops it before it expires. The mode selector is the most
 * consequential control on the form, and these tests pin that the page says so
 * where the choice is made rather than burying it in docs.
 *
 * Also pinned: reads are operator+, every write is admin-only, and the
 * readiness banner degrades rather than taking the page down when the
 * integration-server cannot be reached.
 */
import { createHmac } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const REGISTRY_ISSUER = {
  id: 'iss_1',
  name: 'Corp Keycloak',
  preset: 'keycloak',
  issuer: 'https://idp.corp.example/realms/main',
  jwksUri: 'https://idp.corp.example/realms/main/protocol/openid-connect/certs',
  audience: 'https://opensteward.corp.internal',
  subjectClaim: 'azp',
  scopeClaim: 'realm_access.roles',
  algorithms: ['RS256'],
  authorityMode: 'registry' as const,
  tenantClaim: null,
  allowedTenants: [],
  maxTokenLifetimeS: 3600,
  enabled: true,
  lastVerifiedAt: '2026-08-29T10:00:00.000Z',
  createdAt: '2026-08-01T09:00:00.000Z',
  updatedAt: '2026-08-01T09:00:00.000Z',
}

const EXTERNAL_ISSUER = {
  ...REGISTRY_ISSUER,
  id: 'iss_2',
  name: 'Partner Auth0',
  authorityMode: 'external' as const,
  tenantClaim: 'https://opensteward/tenant',
  allowedTenants: ['acme'],
  lastVerifiedAt: null,
}

const CLIENT = {
  id: 'cli_1',
  issuerId: 'iss_1',
  subject: 'billing-service',
  tenantId: 'acme',
  label: 'Billing service',
  scopes: ['customers:read', 'vertical:read'],
  createdAt: '2026-08-01T09:00:00.000Z',
  lastUsedAt: '2026-08-29T10:00:00.000Z',
  revokedAt: null,
}

const listOAuthIssuers = vi.fn()
const getOAuthIssuer = vi.fn()
const getOAuthReadiness = vi.fn()
const createOAuthIssuer = vi.fn()
const revokeOAuthClient = vi.fn()
const listTenants = vi.fn()
const createOAuthClient = vi.fn()

vi.mock('../../src/core/proxy/admin-api-client', async () => {
  const { adminApiStub } = await import('../helpers/admin-api-stub')
  return {
    AdminApiClient: adminApiStub({
      listOAuthIssuers,
      getOAuthIssuer,
      getOAuthReadiness,
      createOAuthIssuer,
      revokeOAuthClient,
      listTenants,
      createOAuthClient,
      listOAuthPresets: async () => [
        {
          id: 'generic',
          label: 'Generic OIDC',
          issuerHint: 'https://…',
          subjectClaim: 'sub',
          scopeClaim: 'scope',
        },
        {
          id: 'entra-id',
          label: 'Microsoft Entra ID',
          issuerHint: 'https://login.microsoftonline.com/{tenantId}/v2.0',
          subjectClaim: 'azp',
          scopeClaim: 'roles',
          note: 'A v1.0 token carries iss=https://sts.windows.net/{tenantId}/ and will be rejected.',
        },
      ],
      getLoginOptions: async () => ({ providers: [], localLoginEnabled: true }),
    }),
  }
})

const { buildServer } = await import('../../src/core/server')

const SESSION_SECRET = 'oauth-clients-admin-secret-long-enough-x'
let fastify: FastifyInstance

beforeEach(async () => {
  listOAuthIssuers.mockReset().mockResolvedValue([REGISTRY_ISSUER])
  getOAuthIssuer
    .mockReset()
    .mockResolvedValue({ issuer: REGISTRY_ISSUER, clients: [CLIENT], rules: [] })
  getOAuthReadiness
    .mockReset()
    .mockResolvedValue({
      ready: true,
      reason: 'Corp Keycloak is configured and has verified a token.',
    })
  createOAuthIssuer.mockReset().mockResolvedValue({ ...REGISTRY_ISSUER })
  revokeOAuthClient.mockReset().mockResolvedValue(undefined)
  listTenants.mockReset().mockResolvedValue([
    { id: 'default', name: 'Default' },
    { id: 'acme', name: 'Acme' },
  ])
  createOAuthClient.mockReset().mockResolvedValue({ ...CLIENT, id: 'cli_new' })

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

const session = (role = 'admin') =>
  fastify.signCookie(JSON.stringify({ id: 'u1', username: 'admin', role, token: 'jwt' }))

const get = (url: string, role = 'admin') =>
  fastify.inject({ method: 'GET', url, cookies: { session: session(role) } })

/** The synchroniser token the forms carry; a POST without it is refused. */
const csrf = (cookie: string) =>
  createHmac('sha256', SESSION_SECRET).update(cookie).digest('hex').slice(0, 32)

const post = (url: string, role = 'admin', payload: Record<string, string> = {}) => {
  const cookie = session(role)
  return fastify.inject({
    method: 'POST',
    url,
    cookies: { session: cookie },
    payload: { _csrf: csrf(cookie), ...payload },
  })
}

describe('the issuer list', () => {
  it('lists what is registered and how tokens from it are trusted', async () => {
    const res = await get('/oauth-clients')
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('Corp Keycloak')
    expect(res.body).toContain('href="/oauth-clients/iss_1"')
  })

  it('says whether OAuth could actually admit anybody', async () => {
    // The same fact that decides whether disabling API keys is allowed. An
    // operator should be able to see it before they try.
    const res = await get('/oauth-clients')
    expect(res.body).toContain('OIDC bearer auth is usable')
    expect(res.body).toContain('has verified a token')
  })

  it('warns instead of claiming readiness when it cannot be checked', async () => {
    getOAuthReadiness.mockRejectedValue(new Error('ECONNREFUSED'))
    const res = await get('/oauth-clients')
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('Not usable yet')
    expect(res.body).not.toContain('OIDC bearer auth is usable')
  })

  it('explains the empty state rather than showing a bare table', async () => {
    listOAuthIssuers.mockResolvedValue([])
    const res = await get('/oauth-clients')
    expect(res.body).toContain('No issuers registered')
    expect(res.body).toContain('OAUTH_DISABLED')
  })
})

/**
 * Multi-tenancy on a page with no tenant control of its own. An issuer is
 * registered once for the whole deployment; the tenant is decided per token,
 * by the issuer's authority mode. The list has to say so, and say per issuer
 * which tenants it can act for, or an operator reads the page as
 * single-tenant and goes looking for a picker that does not exist.
 */
describe('where the tenant comes from', () => {
  it('explains that the tenant is decided per token, not per issuer', async () => {
    const res = await get('/oauth-clients')
    expect(res.body).toContain('Where the tenant comes from')
    expect(res.body).toContain('belongs to no tenant')
    expect(res.body).toContain('service accounts')
    expect(res.body).toContain('tenant claim')
    expect(res.body).toContain('allowed tenants')
  })

  it('shows the tenants a registry issuer serves, read from its service accounts', async () => {
    const res = await get('/oauth-clients')
    // The header is now a sort link inside the <th>, not bare text.
    expect(res.body).toContain('href="/oauth-clients?sort=tenants&amp;dir=asc"')
    expect(res.body).toContain('>Tenants<')
    expect(res.body).toContain('acme')
    expect(res.body).toContain('1 service account')
  })

  it('counts only live service accounts, and their distinct tenants', async () => {
    getOAuthIssuer.mockResolvedValue({
      issuer: REGISTRY_ISSUER,
      clients: [
        CLIENT,
        { ...CLIENT, id: 'cli_2', subject: 'ops-bot', tenantId: 'globex' },
        {
          ...CLIENT,
          id: 'cli_3',
          subject: 'old-bot',
          tenantId: 'zeta',
          revokedAt: '2026-08-30T00:00:00.000Z',
        },
      ],
      rules: [],
    })
    const res = await get('/oauth-clients')
    expect(res.body).toContain('acme, globex')
    expect(res.body).not.toContain('zeta')
    expect(res.body).toContain('2 service accounts')
  })

  it('says a registry issuer with no service accounts refuses every token', async () => {
    getOAuthIssuer.mockResolvedValue({ issuer: REGISTRY_ISSUER, clients: [], rules: [] })
    const res = await get('/oauth-clients')
    expect(res.body).toContain('no service accounts')
    expect(res.body).toContain('every token from this issuer is refused')
  })

  it('shows the allow-list, and the claim it applies to, for a token-decides issuer', async () => {
    listOAuthIssuers.mockResolvedValue([EXTERNAL_ISSUER])
    const res = await get('/oauth-clients')
    expect(res.body).toContain('acme')
    expect(res.body).toContain('https://opensteward/tenant')
    // No detail fetch needed: the allow-list is on the issuer row itself.
    expect(getOAuthIssuer).not.toHaveBeenCalled()
  })

  it('warns that a token-decides issuer with an empty allow-list admits nobody', async () => {
    listOAuthIssuers.mockResolvedValue([{ ...EXTERNAL_ISSUER, allowedTenants: [] }])
    const res = await get('/oauth-clients')
    expect(res.body).toContain('none allowed')
    expect(res.body).toContain('admits nobody')
  })

  it('still renders the list when an issuer detail cannot be fetched', async () => {
    getOAuthIssuer.mockRejectedValue(new Error('ECONNREFUSED'))
    const res = await get('/oauth-clients')
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('Corp Keycloak')
  })
})

describe('who can do what', () => {
  it('lets an operator read the list', async () => {
    expect((await get('/oauth-clients', 'operator')).statusCode).toBe(200)
  })

  it('does not offer an operator the register button', async () => {
    const res = await get('/oauth-clients', 'operator')
    expect(res.body).not.toContain('href="/oauth-clients/new"')
  })

  it('refuses an operator the register form outright', async () => {
    // Not just hiding the link: the route itself is admin-only.
    expect((await get('/oauth-clients/new', 'operator')).statusCode).toBe(403)
  })

  it('refuses an operator a write', async () => {
    const res = await post('/oauth-clients', 'operator', { name: 'x' })
    expect(res.statusCode).toBe(403)
    expect(createOAuthIssuer).not.toHaveBeenCalled()
  })

  it('refuses a viewer everything here', async () => {
    expect((await get('/oauth-clients', 'viewer')).statusCode).toBe(403)
  })
})

describe('the register form', () => {
  it('says why the audience is required rather than just marking it so', async () => {
    // A blank audience is the most common real-world resource-server hole: it
    // accepts every token the IdP ever minted, for any application.
    const res = await get('/oauth-clients/new')
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('every token the issuer ever minted')
  })

  it('names the trade-off on the mode the operator is choosing', async () => {
    const res = await get('/oauth-clients/new')
    expect(res.body).toContain('stays valid until it expires')
    expect(res.body).toContain('still-valid token immediately')
  })

  it('carries the CSRF token', async () => {
    const res = await get('/oauth-clients/new')
    expect(res.body).toContain('name="_csrf"')
  })

  it('surfaces a vendor caveat as data, not as an inline handler', async () => {
    // The Entra v1.0-vs-v2.0 issuer mismatch is the most common setup failure,
    // so the note travels with the preset. It must be a data- attribute: EJS
    // interpolation inside an on* attribute is HTML-decoded before the JS
    // parser sees it, and an apostrophe would end the literal.
    const res = await get('/oauth-clients/new')
    expect(res.body).toContain('data-note="A v1.0 token carries')
  })

  it('keeps what the operator typed when the server refuses', async () => {
    createOAuthIssuer.mockRejectedValue({
      response: { data: { error: { message: 'Issuer must use https.' } } },
    })
    const res = await post('/oauth-clients', 'admin', {
      name: 'Corp',
      issuer: 'http://idp.corp.example/realms/main',
      jwksUri: 'http://idp.corp.example/jwks',
      audience: 'https://opensteward.corp.internal',
    })
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('Issuer must use https.')
    // Not an empty form: the values come back.
    expect(res.body).toContain('value="http://idp.corp.example/realms/main"')
  })

  it('refuses a blank audience before the request leaves the admin', async () => {
    const res = await post('/oauth-clients', 'admin', {
      name: 'Corp',
      issuer: 'https://idp.corp.example/realms/main',
      jwksUri: 'https://idp.corp.example/jwks',
      audience: '  ',
    })
    expect(res.body).toContain('Audience is required')
    expect(createOAuthIssuer).not.toHaveBeenCalled()
  })
})

describe('one issuer', () => {
  it('shows its service accounts and offers to revoke one', async () => {
    const res = await get('/oauth-clients/iss_1')
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('billing-service')
    expect(res.body).toContain('action="/oauth-clients/clients/cli_1/revoke"')
  })

  it('renders the sections from the SAVED mode, with no script needed', async () => {
    getOAuthIssuer.mockResolvedValue({ issuer: EXTERNAL_ISSUER, clients: [], rules: [] })
    const res = await get('/oauth-clients/iss_2')
    // External mode has no client rows to show, and saying "none registered"
    // there would read as a misconfiguration rather than the design.
    expect(res.body).not.toContain('Register service account')
    expect(res.body).toContain("This issuer's tokens carry their own authority")
    expect(res.body).toContain('stays valid until it expires')
  })

  it('flags an issuer that has never verified a token', async () => {
    getOAuthIssuer.mockResolvedValue({ issuer: EXTERNAL_ISSUER, clients: [], rules: [] })
    const res = await get('/oauth-clients/iss_2')
    expect(res.body).toContain('Never')
    expect(res.body).toContain('present a real token before relying on this')
  })

  it('explains what no scope rules means, rather than showing an empty table', async () => {
    const res = await get('/oauth-clients/iss_1')
    expect(res.body).toContain('passes through verbatim')
  })

  it('404s on an issuer that is not there', async () => {
    getOAuthIssuer.mockResolvedValue(null)
    expect((await get('/oauth-clients/nope')).statusCode).toBe(404)
  })

  it('shows an operator the page without the write forms', async () => {
    const res = await get('/oauth-clients/iss_1', 'operator')
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('billing-service')
    expect(res.body).not.toContain('/oauth-clients/clients/cli_1/revoke')
    expect(res.body).not.toContain('/oauth-clients/iss_1/delete')
  })
})

describe('revoking a service account', () => {
  it('returns to the issuer it belonged to', async () => {
    const res = await post('/oauth-clients/clients/cli_1/revoke', 'admin', {
      issuerId: 'iss_1',
      subject: 'billing-service',
    })
    expect(res.statusCode).toBe(302)
    expect(res.headers.location).toBe('/oauth-clients/iss_1')
    expect(revokeOAuthClient).toHaveBeenCalledWith('jwt', 'cli_1', 'billing-service')
  })
})

/**
 * The service-account tenant is a select, as on /webhooks/new and
 * /api-keys/new. It used to be a free-text id pre-filled with `default`: the
 * tenant a service account acts for is exactly what a token from that
 * subject may reach, so a mistyped id scoped the account to a tenant that
 * does not exist and every call it made was refused — with nothing on the
 * page saying why.
 */
describe('registering a service account into a chosen tenant', () => {
  /** The tenant ids the page lets an operator pick without typing. */
  function offeredTenantIds(body: string): string[] {
    const select = body.match(/<select\b[^>]*\bname="tenantId"[^>]*>([\s\S]*?)<\/select>/)
    if (select) return [...select[1].matchAll(/<option\b[^>]*\bvalue="([^"]*)"/g)].map((m) => m[1])
    const input = body.match(/<input\b[^>]*\bname="tenantId"[^>]*>/)
    const current = input?.[0].match(/\bvalue="([^"]*)"/)?.[1] ?? ''
    return current ? [current] : []
  }

  it('offers every registered tenant, starting on the default', async () => {
    const res = await get('/oauth-clients/iss_1')
    expect(res.statusCode).toBe(200)
    expect(offeredTenantIds(res.body).sort()).toEqual(['acme', 'default'])
    expect(res.body).toMatch(/<select\b[^>]*\bname="tenantId"[^>]*\brequired\b/)
    // Scoped to the tenant select: the issuer form above it has a selected
    // authority-mode option of its own.
    const tenantSelect = res.body.match(
      /<select\b[^>]*\bname="tenantId"[^>]*>([\s\S]*?)<\/select>/,
    )![1]
    const selected = tenantSelect.match(/<option\b[^>]*\bvalue="([^"]*)"[^>]* selected/)?.[1]
    expect(selected).toBe('default')
  })

  it('registers the account into the tenant that was chosen', async () => {
    await post('/oauth-clients/iss_1/clients', 'admin', {
      subject: 'ops-bot',
      tenantId: 'acme',
      scopes: 'customers:read',
    })
    expect(createOAuthClient).toHaveBeenCalledWith(
      'jwt',
      'iss_1',
      expect.objectContaining({ subject: 'ops-bot', tenantId: 'acme' }),
    )
  })

  it('falls back to a typeable id, and says why, when the tenant list cannot be loaded', async () => {
    listTenants.mockRejectedValue(new Error('admin-api down'))
    const res = await get('/oauth-clients/iss_1')
    expect(res.statusCode).toBe(200)
    expect(offeredTenantIds(res.body)).toEqual(['default'])
    expect(res.body).toContain('could not be loaded')
  })
})
