/**
 * User-journey regression test for the admin frontend (the operator web UI).
 *
 * The admin app is a thin rendering layer over admin-api, so this is a focused
 * smoke: an operator reaches the login page unauthenticated, and — once they
 * hold a session — the dashboard renders with data fetched from the (mocked)
 * admin-api. Deeper data behaviour is covered by the admin-api journeys; here we
 * guard that the pages still render and the session boundary still holds.
 *
 * In-process: boots the real admin Fastify app with AdminApiClient mocked so no
 * upstream admin-api is needed.
 */
import type { FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createHmac } from 'crypto'

// Mock the admin-api proxy so the app needs no live backend. Every method the
// login + dashboard paths touch returns canned data. Methods that need per-test
// control are exposed as vi.fn() so individual suites can override them.
const mockHasUsers = vi.fn(async () => true)
const mockLogin = vi.fn(async () => ({
  user: { id: 'u1', username: 'admin', role: 'admin' },
  token: 'jwt-token',
}))
const mockListIdentityProviders = vi.fn(async () => [])
const mockListUsers = vi.fn(async () => [
  { id: 'u1', username: 'admin', role: 'admin', createdAt: '2024-01-01T00:00:00Z' },
])

vi.mock('../../src/core/proxy/admin-api-client', async () => {
  // `await import`: vi.mock is hoisted above this file's imports, but the
  // factory body runs later, so it can import what the top level cannot.
  const { adminApiStub } = await import('../helpers/admin-api-stub')
  return {
    AdminApiClient: adminApiStub({
      hasUsers: mockHasUsers,
      login: mockLogin,
      listIdentityProviders: mockListIdentityProviders,
      listUsers: mockListUsers,
      getLoginOptions: async () => {
        return { providers: [], localLoginEnabled: true }
      },
      getCompanyInfo: async () => {
        return null
      },
      getVerticals: async () => {
        return [{ name: 'accounting', adapters: 1 }]
      },
      listConnections: async () => {
        return [{ id: 'c1', vertical: 'accounting', platform: 'fortnox', status: 'valid' }]
      },
      getDataStoreMetrics: async () => {
        return null
      },
    }),
  }
})

const { buildServer } = await import('../../src/core/server')

const SESSION_SECRET = 'admin-journey-session-secret-must-be-long'
let fastify: FastifyInstance

/** Forge a signed session cookie for the given user payload. */
function makeSession(user: { id: string; username: string; role: string; token: string }) {
  return fastify.signCookie(JSON.stringify(user))
}

/**
 * Derive the CSRF token for a given raw signed cookie value.
 * Mirrors generateCsrfToken() in src/core/auth/csrf.ts — HMAC-SHA256 of the
 * raw cookie string, first 32 hex chars.
 */
function csrfToken(rawSignedCookie: string): string {
  return createHmac('sha256', SESSION_SECRET).update(rawSignedCookie).digest('hex').slice(0, 32)
}

beforeEach(async () => {
  // Reset per-test overrides back to the happy-path defaults before each test.
  mockHasUsers.mockResolvedValue(true)
  mockLogin.mockResolvedValue({
    user: { id: 'u1', username: 'admin', role: 'admin' },
    token: 'jwt-token',
  })
  mockListIdentityProviders.mockResolvedValue([])
  mockListUsers.mockResolvedValue([
    { id: 'u1', username: 'admin', role: 'admin', createdAt: '2024-01-01T00:00:00Z' },
  ])

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
  vi.unstubAllEnvs()
})

describe('Journey: An operator signs in through the admin UI', () => {
  it('the login page renders for an unauthenticated visitor', async () => {
    const res = await fastify.inject({ method: 'GET', url: '/login' })
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toContain('text/html')
    // The local login form must be present.
    expect(res.body.toLowerCase()).toContain('password')
  })

  it('an unauthenticated visit to the dashboard is redirected to login', async () => {
    const res = await fastify.inject({ method: 'GET', url: '/' })
    expect(res.statusCode).toBe(302)
    expect(res.headers.location).toBe('/login')
  })

  it('with a valid session, the dashboard renders with upstream data', async () => {
    const sessionCookie = fastify.signCookie(
      JSON.stringify({ id: 'u1', username: 'admin', role: 'admin', token: 'jwt-token' }),
    )
    const res = await fastify.inject({
      method: 'GET',
      url: '/',
      cookies: { session: sessionCookie },
    })
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toContain('text/html')
    // Dashboard reflects the mocked upstream data — one connection was returned.
    expect(res.body).toContain('Connections (1)')
  })
})

describe('Journey: A bad password is rejected at the admin sign-in', () => {
  // login.ts line 40-47: when apiClient.login() throws, the handler catches and
  // re-renders login.ejs with "Invalid username or password" (status 200).
  it('re-renders the login page with an error when credentials are wrong', async () => {
    mockLogin.mockRejectedValueOnce(new Error('Unauthorized'))

    const res = await fastify.inject({
      method: 'POST',
      url: '/login',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: 'username=admin&password=wrongpassword',
    })

    // Handler re-renders (200) with an error message — no redirect on failure.
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toContain('text/html')
    expect(res.body.toLowerCase()).toContain('invalid username or password')
  })

  it('re-renders the login page when username or password is missing', async () => {
    // login.ts line 18-20: missing fields → re-render with validation message.
    const res = await fastify.inject({
      method: 'POST',
      url: '/login',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: 'username=admin',
    })

    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toContain('text/html')
    expect(res.body.toLowerCase()).toContain('username and password are required')
  })

  it('a 403 from the admin-api surfaces a disabled-login message', async () => {
    // login.ts line 43-45: HTTP 403 from the upstream → "Local login is disabled."
    const err: Record<string, unknown> = new Error('Forbidden') as unknown as Record<
      string,
      unknown
    >
    err.response = { status: 403, data: { error: 'Local login is disabled. Please use SSO.' } }
    mockLogin.mockRejectedValueOnce(err)

    const res = await fastify.inject({
      method: 'POST',
      url: '/login',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: 'username=admin&password=any',
    })

    expect(res.statusCode).toBe(200)
    expect(res.body.toLowerCase()).toContain('local login is disabled')
  })
})

describe('Journey: Signing out clears the operator session', () => {
  // login.ts line 50-53: POST /logout clears the session cookie and redirects to /login.
  // /logout is CSRF-exempt (csrf.ts line 45).
  it('logout clears the session cookie and redirects to /login', async () => {
    const sessionCookie = makeSession({
      id: 'u1',
      username: 'admin',
      role: 'admin',
      token: 'jwt-token',
    })

    const res = await fastify.inject({
      method: 'POST',
      url: '/logout',
      cookies: { session: sessionCookie },
    })

    expect(res.statusCode).toBe(302)
    expect(res.headers.location).toBe('/login')

    // The Set-Cookie header must clear the session cookie (max-age=0 / expires in past).
    const setCookie = [res.headers['set-cookie']].flat().join('; ')
    expect(setCookie).toMatch(/session=;/i)
  })

  it('after logout a follow-up visit to / redirects to /login', async () => {
    // Send logout first, then check that an unauthenticated / redirects to /login.
    const sessionCookie = makeSession({
      id: 'u1',
      username: 'admin',
      role: 'admin',
      token: 'jwt-token',
    })

    await fastify.inject({ method: 'POST', url: '/logout', cookies: { session: sessionCookie } })

    // No cookie on the follow-up — simulates a cleared-cookie browser.
    const followUp = await fastify.inject({ method: 'GET', url: '/' })
    expect(followUp.statusCode).toBe(302)
    expect(followUp.headers.location).toBe('/login')
  })
})

describe('Journey: A fresh deployment sends the operator to the setup wizard', () => {
  // server.ts line 158-170: the global preHandler hook calls hasUsers(); when it
  // returns false every non-/setup URL is redirected to /setup/init.
  it('visiting / on a fresh install redirects to /setup/init', async () => {
    mockHasUsers.mockResolvedValue(false)

    // Rebuild the server so the preHandler captures the new mockHasUsers return value.
    await fastify.close()
    const built = await buildServer({
      server: { port: 0, host: '127.0.0.1' },
      session: { secret: SESSION_SECRET },
      admin_api: { url: 'http://localhost:3001' },
      docs_server: { url: 'http://localhost:3003' },
      sso: { publicBaseUrl: 'http://localhost:3000' },
    })
    fastify = built.fastify
    await fastify.ready()

    const res = await fastify.inject({ method: 'GET', url: '/' })
    expect(res.statusCode).toBe(302)
    expect(res.headers.location).toBe('/setup/init')
  })

  it('/setup/init renders the setup form when no users exist', async () => {
    mockHasUsers.mockResolvedValue(false)

    await fastify.close()
    const built = await buildServer({
      server: { port: 0, host: '127.0.0.1' },
      session: { secret: SESSION_SECRET },
      admin_api: { url: 'http://localhost:3001' },
      docs_server: { url: 'http://localhost:3003' },
      sso: { publicBaseUrl: 'http://localhost:3000' },
    })
    fastify = built.fastify
    await fastify.ready()

    // setup.ts line 12: when hasUsers() returns false, /setup/init renders the form.
    const res = await fastify.inject({ method: 'GET', url: '/setup/init' })
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toContain('text/html')
  })

  it('/setup/init redirects to /login when users already exist', async () => {
    // setup.ts line 9: if hasUsers() returns true → redirect to /login.
    const res = await fastify.inject({ method: 'GET', url: '/setup/init' })
    expect(res.statusCode).toBe(302)
    expect(res.headers.location).toBe('/login')
  })
})

describe('Journey: An operator manages SSO providers and users', () => {
  // identity-providers.ts: requireRole('admin') preHandler — unauthenticated
  // requests are redirected to /login by requireAuth (middleware.ts line 13-19).
  it('unauthenticated GET /identity-providers redirects to /login', async () => {
    const res = await fastify.inject({ method: 'GET', url: '/identity-providers' })
    expect(res.statusCode).toBe(302)
    expect(res.headers.location).toBe('/login')
  })

  it('authenticated admin GET /identity-providers renders the provider list', async () => {
    mockListIdentityProviders.mockResolvedValue([
      {
        id: 'idp-1',
        name: 'Acme SSO',
        slug: 'acme-sso',
        protocol: 'oidc',
        enabled: true,
        config: {},
        jitEnabled: true,
        defaultRole: 'viewer',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        createdBy: null,
        hasSecret: false,
      },
    ])

    const sessionCookie = makeSession({
      id: 'u1',
      username: 'admin',
      role: 'admin',
      token: 'jwt-token',
    })
    const res = await fastify.inject({
      method: 'GET',
      url: '/identity-providers',
      cookies: { session: sessionCookie },
    })

    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toContain('text/html')
    // The mocked provider name must appear in the rendered page.
    expect(res.body).toContain('Acme SSO')
  })

  it('unauthenticated GET /users redirects to /login', async () => {
    // users.ts: requireRole('admin') → unauthenticated → /login.
    const res = await fastify.inject({ method: 'GET', url: '/users' })
    expect(res.statusCode).toBe(302)
    expect(res.headers.location).toBe('/login')
  })

  it('authenticated admin GET /users renders the user list', async () => {
    mockListUsers.mockResolvedValue([
      { id: 'u1', username: 'admin', role: 'admin', createdAt: '2024-01-01T00:00:00Z' },
      { id: 'u2', username: 'ops', role: 'operator', createdAt: '2024-01-02T00:00:00Z' },
    ])

    const sessionCookie = makeSession({
      id: 'u1',
      username: 'admin',
      role: 'admin',
      token: 'jwt-token',
    })
    const res = await fastify.inject({
      method: 'GET',
      url: '/users',
      cookies: { session: sessionCookie },
    })

    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toContain('text/html')
    // Both users must appear in the rendered page.
    expect(res.body).toContain('admin')
    expect(res.body).toContain('ops')
  })
})
