/**
 * Journey: the admin UI's side of an SSO sign-in.
 *
 * admin-api owns the protocol (see its `sso-oidc-login` journey); the UI's
 * part is three hops that this file pins down — the login page offers the
 * provider, "Sign in with …" sends the browser to admin-api's initiation
 * endpoint, and the return trip's one-time handoff code becomes the same
 * session cookie a password login sets, so every page after it reads
 * `request.sessionUser` unchanged.
 */
import type { FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockExchange = vi.fn()

vi.mock('../../src/core/proxy/admin-api-client', async () => {
  const { adminApiStub } = await import('../helpers/admin-api-stub')
  return {
    AdminApiClient: adminApiStub({
      getLoginOptions: async () => ({
        providers: [{ slug: 'dev', name: 'Dev IdP', protocol: 'oidc' }],
        localLoginEnabled: true,
      }),
      exchangeSsoHandoff: mockExchange,
    }),
  }
})

const { buildServer } = await import('../../src/core/server')

const SESSION_SECRET = 'sso-login-journey-secret-long-enough-for-hmac'
const ADMIN_API = 'http://localhost:3001'
let fastify: FastifyInstance

beforeEach(async () => {
  mockExchange.mockReset().mockResolvedValue({
    user: { id: 'u-alice', username: 'alice@example.test', role: 'admin' },
    token: 'jwt-from-sso',
  })
  const built = await buildServer({
    server: { port: 0, host: '127.0.0.1' },
    session: { secret: SESSION_SECRET },
    admin_api: { url: ADMIN_API },
    docs_server: { url: 'http://localhost:3003' },
    sso: { publicBaseUrl: ADMIN_API },
  })
  fastify = built.fastify
  await fastify.ready()
})

afterEach(async () => {
  await fastify?.close()
})

/** The `session` cookie a response set, decoded the way the UI reads it. */
function sessionFrom(res: {
  cookies: Array<{ name: string; value: string }>
}): Record<string, string> | null {
  const raw = res.cookies.find((c) => c.name === 'session')
  if (!raw || !raw.value) return null
  const unsigned = fastify.unsignCookie(raw.value)
  if (!unsigned.valid || !unsigned.value) return null
  return JSON.parse(unsigned.value) as Record<string, string>
}

describe('Journey: an operator signs in with SSO from the login page', () => {
  it('the login page offers the provider as a sign-in button', async () => {
    const res = await fastify.inject({ method: 'GET', url: '/login' })
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('Sign in with Dev IdP')
    expect(res.body).toContain('href="/login/sso/dev"')
  })

  it('"Sign in with …" hands the browser to admin-api, carrying where to return to', async () => {
    const res = await fastify.inject({
      method: 'GET',
      url: '/login/sso/dev?return_to=/connections',
    })
    expect(res.statusCode).toBe(302)
    const location = new URL(res.headers['location'] as string)
    expect(`${location.origin}${location.pathname}`).toBe(`${ADMIN_API}/api/sso/dev/login`)
    expect(location.searchParams.get('return_to')).toBe('/connections')
  })

  it('the return trip exchanges the handoff code for a session cookie and lands where the operator was going', async () => {
    const res = await fastify.inject({
      method: 'GET',
      url: '/login/sso/complete?code=hand-1&return_to=/connections',
    })
    expect(mockExchange).toHaveBeenCalledWith('hand-1')
    expect(res.statusCode).toBe(302)
    expect(res.headers['location']).toBe('/connections')
    expect(sessionFrom(res)).toEqual({
      id: 'u-alice',
      username: 'alice@example.test',
      role: 'admin',
      token: 'jwt-from-sso',
    })
  })

  it('that cookie is a real session: the next page no longer bounces to /login', async () => {
    const complete = await fastify.inject({ method: 'GET', url: '/login/sso/complete?code=hand-1' })
    const cookie = complete.cookies.find((c) => c.name === 'session')!
    const page = await fastify.inject({
      method: 'GET',
      url: '/',
      cookies: { session: cookie.value },
    })
    expect(page.statusCode).not.toBe(302)
  })

  it('a return trip without a code shows the login page with the reason, and sets no cookie', async () => {
    const res = await fastify.inject({ method: 'GET', url: '/login/sso/complete' })
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('Missing SSO handoff code')
    expect(sessionFrom(res)).toBeNull()
    expect(mockExchange).not.toHaveBeenCalled()
  })

  it('an expired or reused handoff code shows the login page with the reason, and sets no cookie', async () => {
    mockExchange.mockRejectedValue(new Error('400 Invalid or expired handoff code'))
    const res = await fastify.inject({ method: 'GET', url: '/login/sso/complete?code=stale' })
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('SSO sign-in failed or expired')
    expect(sessionFrom(res)).toBeNull()
  })
})
