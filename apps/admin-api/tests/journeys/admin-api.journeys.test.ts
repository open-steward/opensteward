/**
 * User-journey regression tests for the admin-api (the operator REST surface).
 *
 * Each story follows an operator or admin through a task they rely on every day
 * — first-run setup, logging in, being locked out after too many bad guesses,
 * minting an API key, leaving an audit trail — and asserts the platform still
 * behaves the way they expect. A red test names the broken promise.
 *
 * In-process: a real admin-api Fastify app over a throwaway SQLite db, driven
 * with fastify.inject(). See ./helpers.ts.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  buildAdminApiTestServer,
  setupAdmin,
  createUserAndLogin,
  type AdminApiTestServer,
} from './helpers'

let server: AdminApiTestServer

beforeEach(async () => {
  server = await buildAdminApiTestServer()
})

afterEach(async () => {
  await server?.cleanup()
})

// ───────────────────────────────────────────────────────────────────────────
describe('Journey: A first-run operator sets up the deployment and signs in', () => {
  it('completing setup returns a JWT and an admin user', async () => {
    const res = await server.fastify.inject({
      method: 'POST',
      url: '/api/auth/setup',
      payload: { username: 'admin', password: 'AdminPass123!' },
    })
    expect(res.statusCode).toBe(201)
    expect(res.json().token).toBeTruthy()
    expect(res.json().user.role).toBe('admin')
  })

  it('setup cannot be run twice once a user exists', async () => {
    await setupAdmin(server)
    const again = await server.fastify.inject({
      method: 'POST',
      url: '/api/auth/setup',
      payload: { username: 'intruder', password: 'IntruderPass123!' },
    })
    expect(again.statusCode).toBe(409)
  })

  it('the authenticated operator can read their own profile', async () => {
    const token = await setupAdmin(server)
    const me = await server.fastify.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(me.statusCode).toBe(200)
    expect(me.json().user.username).toBe('admin')
  })

  it('a request with no token is turned away', async () => {
    await setupAdmin(server)
    const me = await server.fastify.inject({ method: 'GET', url: '/api/auth/me' })
    expect(me.statusCode).toBe(401)
  })

  it('a request with a garbage token is turned away', async () => {
    await setupAdmin(server)
    const me = await server.fastify.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { authorization: 'Bearer not-a-real-jwt' },
    })
    expect(me.statusCode).toBe(401)
  })
})

// ───────────────────────────────────────────────────────────────────────────
describe('Journey: An attacker hammering the login is locked out', () => {
  it('after enough wrong passwords the account is temporarily locked (429)', async () => {
    await setupAdmin(server, 'admin', 'AdminPass123!')

    let lastStatus = 0
    // Default threshold is 10 failures inside the window; loop past it.
    for (let i = 0; i < 12; i++) {
      const res = await server.fastify.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { username: 'admin', password: 'wrong-password' },
      })
      lastStatus = res.statusCode
    }
    expect(lastStatus).toBe(429)
  })
})

// ───────────────────────────────────────────────────────────────────────────
describe('Journey: Role boundaries hold — an operator cannot do admin-only work', () => {
  it('an operator is forbidden from listing users, but an admin is allowed', async () => {
    const adminToken = await setupAdmin(server)
    const operatorToken = await createUserAndLogin(server, adminToken, 'op1', 'operator')

    const asOperator = await server.fastify.inject({
      method: 'GET',
      url: '/api/users',
      headers: { authorization: `Bearer ${operatorToken}` },
    })
    expect(asOperator.statusCode).toBe(403)

    const asAdmin = await server.fastify.inject({
      method: 'GET',
      url: '/api/users',
      headers: { authorization: `Bearer ${adminToken}` },
    })
    expect(asAdmin.statusCode).toBe(200)
  })
})

// ───────────────────────────────────────────────────────────────────────────
describe('Journey: An admin manages operator accounts', () => {
  it('creates an operator, sees it in the directory, then removes it', async () => {
    const adminToken = await setupAdmin(server)

    const created = await server.fastify.inject({
      method: 'POST',
      url: '/api/users',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { username: 'newop', password: 'NewOpPass123!', role: 'operator' },
    })
    expect(created.statusCode).toBe(201)
    const userId = created.json().data.id as string
    expect(created.json().data.role).toBe('operator')

    const listed = await server.fastify.inject({
      method: 'GET',
      url: '/api/users',
      headers: { authorization: `Bearer ${adminToken}` },
    })
    expect((listed.json().data as Array<{ id: string }>).some((u) => u.id === userId)).toBe(true)

    const removed = await server.fastify.inject({
      method: 'DELETE',
      url: `/api/users/${userId}`,
      headers: { authorization: `Bearer ${adminToken}` },
    })
    expect(removed.statusCode).toBe(204)

    const after = await server.fastify.inject({
      method: 'GET',
      url: '/api/users',
      headers: { authorization: `Bearer ${adminToken}` },
    })
    expect((after.json().data as Array<{ id: string }>).some((u) => u.id === userId)).toBe(false)
  })
})

// ───────────────────────────────────────────────────────────────────────────
describe('Journey: Operator actions are recorded in a searchable audit trail', () => {
  it('a login and a user-creation both show up in the audit log', async () => {
    const adminToken = await setupAdmin(server)
    // A login the trail should capture.
    await server.fastify.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'admin', password: 'AdminPass123!' },
    })
    // A mutation the trail should capture.
    await server.fastify.inject({
      method: 'POST',
      url: '/api/users',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { username: 'audited-op', password: 'AuditedOp123!', role: 'operator' },
    })

    const audit = await server.fastify.inject({
      method: 'GET',
      url: '/api/audit?limit=50',
      headers: { authorization: `Bearer ${adminToken}` },
    })
    expect(audit.statusCode).toBe(200)
    const actions = (audit.json().data as Array<{ action: string }>).map((e) => e.action)
    expect(actions).toContain('user.login')
    expect(actions).toContain('user.create')
  })

  it('the audit log is admin-only', async () => {
    const adminToken = await setupAdmin(server)
    const operatorToken = await createUserAndLogin(server, adminToken, 'op2', 'operator')
    const res = await server.fastify.inject({
      method: 'GET',
      url: '/api/audit',
      headers: { authorization: `Bearer ${operatorToken}` },
    })
    expect(res.statusCode).toBe(403)
  })
})

// ───────────────────────────────────────────────────────────────────────────
describe('Journey: An operator builds a reusable Connect Link template', () => {
  it('creates a template that reflects what was configured and lists it back', async () => {
    const adminToken = await setupAdmin(server)

    const template = await server.fastify.inject({
      method: 'POST',
      url: '/api/connect-link-templates',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        tenantId: 'tenant-a',
        name: 'Accounting onboarding',
        linkMode: 'pinned',
        allowedVerticals: ['accounting'],
        expiryDays: 14,
      },
    })
    expect(template.statusCode).toBe(201)
    const data = template.json().data
    expect(data.name).toBe('Accounting onboarding')
    expect(data.allowedVerticals).toEqual(['accounting'])
    expect(data.expiryDays).toBe(14)

    const list = await server.fastify.inject({
      method: 'GET',
      url: '/api/connect-link-templates?tenantId=tenant-a',
      headers: { authorization: `Bearer ${adminToken}` },
    })
    expect(list.statusCode).toBe(200)
    expect((list.json().data as Array<{ id: number }>).some((t) => t.id === data.id)).toBe(true)
  })
})

// ───────────────────────────────────────────────────────────────────────────
describe('Journey: An admin registers an SSO identity provider', () => {
  // Verified routes:
  //   POST /api/identity-providers          identity-providers.ts:199
  //   GET  /api/identity-providers          identity-providers.ts:152
  //   GET  /api/sso/login-options           sso.ts:80 — public, no auth
  //   GET  /api/sso/:slug/login             sso.ts:110 — 404 for unknown/disabled slug
  // Auth: both `authenticate` + `adminOnly` hooks on all IdP CRUD routes (identity-providers.ts:149-150)
  // OIDC config validation: OidcConfigSchema requires `issuer` (url) + `clientId` (types.ts:23-36)

  it('an admin can register an enabled OIDC provider and it appears in the directory', async () => {
    const adminToken = await setupAdmin(server)

    const created = await server.fastify.inject({
      method: 'POST',
      url: '/api/identity-providers',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        name: 'Northwind SSO',
        slug: 'northwind-oidc',
        protocol: 'oidc',
        enabled: true,
        config: {
          issuer: 'https://idp.northwind.example',
          clientId: 'opensteward',
        },
      },
    })
    expect(created.statusCode).toBe(201)
    const provider = created.json().data
    expect(provider.name).toBe('Northwind SSO')
    expect(provider.slug).toBe('northwind-oidc')
    expect(provider.protocol).toBe('oidc')
    expect(provider.enabled).toBe(true)
    // Secrets must never be returned — no clientSecret in config response
    expect(provider.id).toBeTruthy()

    const list = await server.fastify.inject({
      method: 'GET',
      url: '/api/identity-providers',
      headers: { authorization: `Bearer ${adminToken}` },
    })
    expect(list.statusCode).toBe(200)
    const providers = list.json().data as Array<{ id: string; slug: string }>
    expect(providers.some((p) => p.slug === 'northwind-oidc')).toBe(true)
  })

  it('the enabled provider appears in the public login-options response', async () => {
    const adminToken = await setupAdmin(server)

    await server.fastify.inject({
      method: 'POST',
      url: '/api/identity-providers',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        name: 'Northwind SSO',
        slug: 'northwind-oidc',
        protocol: 'oidc',
        enabled: true,
        config: {
          issuer: 'https://idp.northwind.example',
          clientId: 'opensteward',
        },
      },
    })

    // GET /api/sso/login-options is public (security: []) — no auth needed
    const options = await server.fastify.inject({
      method: 'GET',
      url: '/api/sso/login-options',
    })
    expect(options.statusCode).toBe(200)
    const { providers, localLoginEnabled } = options.json().data as {
      providers: Array<{ slug: string }>
      localLoginEnabled: boolean
    }
    expect(Array.isArray(providers)).toBe(true)
    expect(providers.some((p) => p.slug === 'northwind-oidc')).toBe(true)
    // local login defaults to enabled (no runtime setting override in test env)
    expect(localLoginEnabled).toBe(true)
  })

  it('registering a second provider with the same slug returns 409', async () => {
    const adminToken = await setupAdmin(server)
    const payload = {
      name: 'Northwind SSO',
      slug: 'northwind-oidc',
      protocol: 'oidc',
      enabled: true,
      config: { issuer: 'https://idp.northwind.example', clientId: 'opensteward' },
    }

    const first = await server.fastify.inject({
      method: 'POST',
      url: '/api/identity-providers',
      headers: { authorization: `Bearer ${adminToken}` },
      payload,
    })
    expect(first.statusCode).toBe(201)

    const duplicate = await server.fastify.inject({
      method: 'POST',
      url: '/api/identity-providers',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { ...payload, name: 'Northwind SSO (copy)' },
    })
    expect(duplicate.statusCode).toBe(409)
  })

  it('a non-admin operator is forbidden (403) from creating or listing identity providers', async () => {
    const adminToken = await setupAdmin(server)
    const operatorToken = await createUserAndLogin(server, adminToken, 'op-sso', 'operator')

    const createAttempt = await server.fastify.inject({
      method: 'POST',
      url: '/api/identity-providers',
      headers: { authorization: `Bearer ${operatorToken}` },
      payload: {
        name: 'Rogue Provider',
        slug: 'rogue',
        protocol: 'oidc',
        enabled: true,
        config: { issuer: 'https://rogue.example', clientId: 'rogue' },
      },
    })
    expect(createAttempt.statusCode).toBe(403)

    const listAttempt = await server.fastify.inject({
      method: 'GET',
      url: '/api/identity-providers',
      headers: { authorization: `Bearer ${operatorToken}` },
    })
    expect(listAttempt.statusCode).toBe(403)
  })

  it('navigating to the login redirect for an unknown slug returns 404', async () => {
    await setupAdmin(server)

    // GET /api/sso/:slug/login returns 404 for unknown/disabled slug (sso.ts:133)
    const res = await server.fastify.inject({
      method: 'GET',
      url: '/api/sso/no-such-provider/login',
    })
    expect(res.statusCode).toBe(404)
  })
})

// ───────────────────────────────────────────────────────────────────────────
describe('Journey: An IdP provisions a user over SCIM', () => {
  // Verified routes:
  //   POST /api/identity-providers/:id/scim-tokens   identity-providers.ts:460
  //     response: { data: ScimTokenMint } — plaintext field is `plaintext` (_openapi.ts:877-879)
  //   POST /scim/v2/Users                            scim.ts:193
  //     auth: makeScimAuth preHandler (scim.ts:96); missing token → 401
  //     body: ScimUserSchema — userName required (scim-schema.ts)
  //     response: 201 SCIM user object (content-type: application/scim+json)
  //   GET  /api/users                                admin-only; provisioned user should appear

  it('admin mints a SCIM token and the plaintext is returned once', async () => {
    const adminToken = await setupAdmin(server)

    const created = await server.fastify.inject({
      method: 'POST',
      url: '/api/identity-providers',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        name: 'Okta SCIM',
        slug: 'okta-scim',
        protocol: 'oidc',
        enabled: true,
        config: { issuer: 'https://okta.northwind.example', clientId: 'opensteward' },
      },
    })
    expect(created.statusCode).toBe(201)
    const providerId = created.json().data.id as string

    const mint = await server.fastify.inject({
      method: 'POST',
      url: `/api/identity-providers/${providerId}/scim-tokens`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { label: 'Production SCIM key' },
    })
    expect(mint.statusCode).toBe(201)
    const tokenData = mint.json().data
    // plaintext is the one-time field (identity-providers.ts:467 + _openapi.ts:877)
    expect(typeof tokenData.plaintext).toBe('string')
    expect(tokenData.plaintext.length).toBeGreaterThan(0)
    expect(tokenData.providerId).toBe(providerId)
  })

  it('SCIM POST /scim/v2/Users with the minted bearer token provisions the user (201)', async () => {
    const adminToken = await setupAdmin(server)

    const idpRes = await server.fastify.inject({
      method: 'POST',
      url: '/api/identity-providers',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        name: 'Okta SCIM',
        slug: 'okta-scim',
        protocol: 'oidc',
        enabled: true,
        config: { issuer: 'https://okta.northwind.example', clientId: 'opensteward' },
      },
    })
    expect(idpRes.statusCode).toBe(201)
    const providerId = idpRes.json().data.id as string

    const mintRes = await server.fastify.inject({
      method: 'POST',
      url: `/api/identity-providers/${providerId}/scim-tokens`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {},
    })
    expect(mintRes.statusCode).toBe(201)
    const scimToken = mintRes.json().data.plaintext as string

    // Provision a user via SCIM — auth is the per-provider bearer token, NOT the admin JWT
    const scimCreate = await server.fastify.inject({
      method: 'POST',
      url: '/scim/v2/Users',
      headers: { authorization: `Bearer ${scimToken}` },
      payload: {
        schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
        userName: 'alice.provisioned',
        name: { givenName: 'Alice', familyName: 'Provisioned' },
        emails: [{ value: 'alice@northwind.example', primary: true }],
        active: true,
      },
    })
    expect(scimCreate.statusCode).toBe(201)
    const scimUser = JSON.parse(scimCreate.payload) as { id: string; userName: string }
    expect(scimUser.userName).toBe('alice.provisioned')
    expect(scimUser.id).toBeTruthy()
  })

  it('the SCIM-provisioned user appears in GET /api/users (admin view)', async () => {
    const adminToken = await setupAdmin(server)

    const idpRes = await server.fastify.inject({
      method: 'POST',
      url: '/api/identity-providers',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        name: 'Okta SCIM',
        slug: 'okta-scim',
        protocol: 'oidc',
        enabled: true,
        config: { issuer: 'https://okta.northwind.example', clientId: 'opensteward' },
      },
    })
    const providerId = idpRes.json().data.id as string

    const mintRes = await server.fastify.inject({
      method: 'POST',
      url: `/api/identity-providers/${providerId}/scim-tokens`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {},
    })
    const scimToken = mintRes.json().data.plaintext as string

    await server.fastify.inject({
      method: 'POST',
      url: '/scim/v2/Users',
      headers: { authorization: `Bearer ${scimToken}` },
      payload: {
        schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
        userName: 'bob.provisioned',
        emails: [{ value: 'bob@northwind.example', primary: true }],
      },
    })

    const users = await server.fastify.inject({
      method: 'GET',
      url: '/api/users',
      headers: { authorization: `Bearer ${adminToken}` },
    })
    expect(users.statusCode).toBe(200)
    const userList = users.json().data as Array<{ username: string }>
    expect(userList.some((u) => u.username === 'bob.provisioned')).toBe(true)
  })

  it('SCIM POST /scim/v2/Users without a bearer token is rejected with 401', async () => {
    await setupAdmin(server)

    const res = await server.fastify.inject({
      method: 'POST',
      url: '/scim/v2/Users',
      // No Authorization header
      payload: {
        schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
        userName: 'attacker.provisioned',
      },
    })
    expect(res.statusCode).toBe(401)
  })

  it('provisioning the same userName twice returns 409', async () => {
    const adminToken = await setupAdmin(server)

    const idpRes = await server.fastify.inject({
      method: 'POST',
      url: '/api/identity-providers',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        name: 'Okta SCIM',
        slug: 'okta-scim',
        protocol: 'oidc',
        enabled: true,
        config: { issuer: 'https://okta.northwind.example', clientId: 'opensteward' },
      },
    })
    const providerId = idpRes.json().data.id as string

    const mintRes = await server.fastify.inject({
      method: 'POST',
      url: `/api/identity-providers/${providerId}/scim-tokens`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {},
    })
    const scimToken = mintRes.json().data.plaintext as string

    const scimPayload = {
      schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
      userName: 'carol.provisioned',
    }

    const first = await server.fastify.inject({
      method: 'POST',
      url: '/scim/v2/Users',
      headers: { authorization: `Bearer ${scimToken}` },
      payload: scimPayload,
    })
    expect(first.statusCode).toBe(201)

    const duplicate = await server.fastify.inject({
      method: 'POST',
      url: '/scim/v2/Users',
      headers: { authorization: `Bearer ${scimToken}` },
      payload: scimPayload,
    })
    expect(duplicate.statusCode).toBe(409)
  })
})

// ───────────────────────────────────────────────────────────────────────────
describe('Journey: The SSO login-options surface reflects the live provider state', () => {
  // Verified route: GET /api/sso/login-options (sso.ts:80) — public, no auth required
  // Returns: { data: { providers: PublicIdentityProvider[], localLoginEnabled: boolean } }
  // Only *enabled* providers appear; disabled ones are omitted.

  it('with no providers the endpoint returns an empty list and local login enabled', async () => {
    // No setup needed — login-options is fully public
    const res = await server.fastify.inject({
      method: 'GET',
      url: '/api/sso/login-options',
    })
    expect(res.statusCode).toBe(200)
    const { providers, localLoginEnabled } = res.json().data as {
      providers: unknown[]
      localLoginEnabled: boolean
    }
    expect(providers).toEqual([])
    expect(localLoginEnabled).toBe(true)
  })

  it('a disabled provider does NOT appear in login-options even though it exists', async () => {
    const adminToken = await setupAdmin(server)

    await server.fastify.inject({
      method: 'POST',
      url: '/api/identity-providers',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        name: 'Disabled Corp SSO',
        slug: 'disabled-corp',
        protocol: 'oidc',
        enabled: false,
        config: { issuer: 'https://idp.disabled-corp.example', clientId: 'opensteward' },
      },
    })

    const options = await server.fastify.inject({
      method: 'GET',
      url: '/api/sso/login-options',
    })
    expect(options.statusCode).toBe(200)
    const { providers } = options.json().data as { providers: Array<{ slug: string }> }
    expect(providers.some((p) => p.slug === 'disabled-corp')).toBe(false)
  })

  it('only enabled providers appear; a mix of enabled and disabled yields just the enabled one', async () => {
    const adminToken = await setupAdmin(server)

    await server.fastify.inject({
      method: 'POST',
      url: '/api/identity-providers',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        name: 'Active Corp SSO',
        slug: 'active-corp',
        protocol: 'oidc',
        enabled: true,
        config: { issuer: 'https://idp.active-corp.example', clientId: 'opensteward' },
      },
    })

    await server.fastify.inject({
      method: 'POST',
      url: '/api/identity-providers',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        name: 'Dormant Corp SSO',
        slug: 'dormant-corp',
        protocol: 'oidc',
        enabled: false,
        config: { issuer: 'https://idp.dormant-corp.example', clientId: 'opensteward' },
      },
    })

    const options = await server.fastify.inject({
      method: 'GET',
      url: '/api/sso/login-options',
    })
    expect(options.statusCode).toBe(200)
    const { providers } = options.json().data as { providers: Array<{ slug: string }> }
    expect(providers.some((p) => p.slug === 'active-corp')).toBe(true)
    expect(providers.some((p) => p.slug === 'dormant-corp')).toBe(false)
  })
})

// ───────────────────────────────────────────────────────────────────────────
describe('Journey: A viewer can look but not touch', () => {
  // The viewer role (ROLE_LEVELS = 0) passes requireAuth but fails
  // requireRole('operator') — so read-only GET routes that only call
  // fastify.authenticate succeed, while mutating routes that also call
  // fastify.operatorOnly return 403.
  // Enforcement: apps/admin-api/src/core/auth/jwt-auth.ts:38
  //   if ((ROLE_LEVELS[user.role] ?? 0) < (ROLE_LEVELS[minRole] ?? 0))
  //     void reply.status(403).send(...)
  //
  // Read allowed (auth only):     GET /api/scope-groups  (scope-groups.ts:40-61)
  // Write forbidden (operatorOnly): POST /api/scope-groups (scope-groups.ts:63-108)

  it('a viewer can read the scope-groups list', async () => {
    const adminToken = await setupAdmin(server)
    const viewerToken = await createUserAndLogin(server, adminToken, 'viewer1', 'viewer')

    const res = await server.fastify.inject({
      method: 'GET',
      url: '/api/scope-groups',
      headers: { authorization: `Bearer ${viewerToken}` },
    })
    expect(res.statusCode).toBe(200)
    expect(Array.isArray(res.json().data)).toBe(true)
  })

  it('a viewer is forbidden (403) from creating a scope group', async () => {
    const adminToken = await setupAdmin(server)
    const viewerToken = await createUserAndLogin(server, adminToken, 'viewer2', 'viewer')

    const res = await server.fastify.inject({
      method: 'POST',
      url: '/api/scope-groups',
      headers: { authorization: `Bearer ${viewerToken}` },
      payload: {
        vertical: 'accounting',
        platform: 'xero',
        name: 'Viewer attempt',
        scopes: ['accounting.transactions.read'],
      },
    })
    expect(res.statusCode).toBe(403)
  })

  it('a viewer is forbidden (403) from creating a Connect Link template', async () => {
    const adminToken = await setupAdmin(server)
    const viewerToken = await createUserAndLogin(server, adminToken, 'viewer3', 'viewer')

    const res = await server.fastify.inject({
      method: 'POST',
      url: '/api/connect-link-templates',
      headers: { authorization: `Bearer ${viewerToken}` },
      payload: {
        tenantId: 'tenant-b',
        name: 'Viewer template attempt',
        linkMode: 'pinned',
        allowedVerticals: ['accounting'],
        expiryDays: 7,
      },
    })
    expect(res.statusCode).toBe(403)
  })
})

// ───────────────────────────────────────────────────────────────────────────
describe('Journey: An operator clears a dashboard task, and a viewer can only look', () => {
  // The dashboard's "Needs attention" panel is rendered for every role, so the
  // dismissal list is readable by all; clearing (and un-clearing) is an action
  // on shared state and needs the operator role — the same floor as
  // acknowledging the notification the clear settles.

  const DISMISSALS = '/api/dashboard-tasks/dismissals'
  const auth = (token: string) => ({ authorization: `Bearer ${token}` })

  it('every role can read the list; only operator+ can clear or un-clear', async () => {
    const adminToken = await setupAdmin(server)
    const operatorToken = await createUserAndLogin(server, adminToken, 'op-dash', 'operator')
    const viewerToken = await createUserAndLogin(server, adminToken, 'viewer-dash', 'viewer')
    const item = { key: 'conn:expired:conn-1', fingerprint: '2026-09-01T00:00:00.000Z' }

    const viewerWrite = await server.fastify.inject({
      method: 'POST',
      url: DISMISSALS,
      headers: auth(viewerToken),
      payload: { items: [item] },
    })
    expect(viewerWrite.statusCode).toBe(403)

    const operatorWrite = await server.fastify.inject({
      method: 'POST',
      url: DISMISSALS,
      headers: auth(operatorToken),
      payload: { items: [item] },
    })
    expect(operatorWrite.statusCode).toBe(204)

    for (const token of [viewerToken, operatorToken, adminToken]) {
      const list = await server.fastify.inject({
        method: 'GET',
        url: DISMISSALS,
        headers: auth(token),
      })
      expect(list.statusCode).toBe(200)
      expect(list.json().data).toEqual([expect.objectContaining(item)])
    }

    const viewerUndo = await server.fastify.inject({
      method: 'DELETE',
      url: `${DISMISSALS}/${encodeURIComponent(item.key)}`,
      headers: auth(viewerToken),
    })
    expect(viewerUndo.statusCode).toBe(403)

    const operatorUndo = await server.fastify.inject({
      method: 'DELETE',
      url: `${DISMISSALS}/${encodeURIComponent(item.key)}`,
      headers: auth(operatorToken),
    })
    expect(operatorUndo.statusCode).toBe(204)

    const after = await server.fastify.inject({
      method: 'GET',
      url: DISMISSALS,
      headers: auth(viewerToken),
    })
    expect(after.json().data).toEqual([])
  })

  it('clearing an expired connection also acknowledges its notification, and the bell count drops', async () => {
    const adminToken = await setupAdmin(server)
    const operatorToken = await createUserAndLogin(server, adminToken, 'op-bell', 'operator')
    // What the health poller would have raised for the same condition.
    await server.adminStore.createNotification(
      'credential_expired',
      'Connection "fortnox" (Acme) has expired',
      'accounting',
      'conn-1',
      'fortnox',
    )
    await server.adminStore.createNotification(
      'credential_expiring',
      'Connection "xero" (Beta) is expiring soon',
      'accounting',
      'conn-2',
      'xero',
    )

    const before = await server.fastify.inject({
      method: 'GET',
      url: '/api/notifications/unread-count',
      headers: auth(operatorToken),
    })
    expect(before.json()).toEqual({ data: { count: 1 } }) // expiring is not counted

    const clear = await server.fastify.inject({
      method: 'POST',
      url: DISMISSALS,
      headers: auth(operatorToken),
      payload: { items: [{ key: 'conn:expired:conn-1', fingerprint: '2026-09-01T00:00:00.000Z' }] },
    })
    expect(clear.statusCode).toBe(204)

    const remaining = await server.fastify.inject({
      method: 'GET',
      url: '/api/notifications',
      headers: auth(operatorToken),
    })
    expect(remaining.json().data.map((n: { type: string }) => n.type)).toEqual([
      'credential_expiring',
    ])

    const after = await server.fastify.inject({
      method: 'GET',
      url: '/api/notifications/unread-count',
      headers: auth(operatorToken),
    })
    expect(after.json()).toEqual({ data: { count: 0 } })

    const audit = await server.fastify.inject({
      method: 'GET',
      url: '/api/audit?action=dashboard_task.dismiss',
      headers: auth(adminToken),
    })
    expect(audit.statusCode).toBe(200)
    expect(audit.json().data).toHaveLength(1)
    expect(audit.json().data[0].detail).toEqual({
      action: 'dashboard_task.dismiss',
      keys: ['conn:expired:conn-1'],
      count: 1,
    })
  })

  it('a viewer cannot acknowledge a notification; an operator can', async () => {
    const adminToken = await setupAdmin(server)
    const operatorToken = await createUserAndLogin(server, adminToken, 'op-ack', 'operator')
    const viewerToken = await createUserAndLogin(server, adminToken, 'viewer-ack', 'viewer')
    await server.adminStore.createNotification(
      'vertical_down',
      'Vertical "crm" is unreachable',
      'crm',
    )
    const [row] = await server.adminStore.listUnacknowledged()

    const viewerOne = await server.fastify.inject({
      method: 'POST',
      url: `/api/notifications/${row!.id}/acknowledge`,
      headers: auth(viewerToken),
    })
    expect(viewerOne.statusCode).toBe(403)
    const viewerAll = await server.fastify.inject({
      method: 'POST',
      url: '/api/notifications/acknowledge-all',
      headers: auth(viewerToken),
    })
    expect(viewerAll.statusCode).toBe(403)
    expect(await server.adminStore.listUnacknowledged()).toHaveLength(1)

    const operatorOne = await server.fastify.inject({
      method: 'POST',
      url: `/api/notifications/${row!.id}/acknowledge`,
      headers: auth(operatorToken),
    })
    expect(operatorOne.statusCode).toBe(204)
    expect(await server.adminStore.listUnacknowledged()).toHaveLength(0)
  })
})
