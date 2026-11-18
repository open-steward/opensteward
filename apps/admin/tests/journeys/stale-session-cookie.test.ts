/**
 * A stale `session` cookie must not be able to poison the login page.
 *
 * The CSRF token is an HMAC over the raw `session` cookie value
 * (`core/auth/csrf.ts`). A browser holding a cookie this server cannot verify —
 * signed under a rotated SESSION_SECRET, or by a container that has since been
 * replaced — used to keep sending it forever: the server ignored it silently
 * and never told the browser to drop it. An operator then saw
 * `{"error":"Invalid or missing CSRF token"}` on login until they cleared the
 * cookie by hand (2026-09-12, after a full-stack redeploy).
 *
 * Two rules pinned here:
 *   1. A `session` cookie that fails signature (or is not JSON) is cleared on
 *      the response, with the same attributes the login route sets it with, so
 *      the browser actually deletes it. A valid cookie is left alone.
 *   2. Every `/login` response is `Cache-Control: no-store`, so a cached copy
 *      of the page cannot resubmit a token minted for a cookie that no longer
 *      exists.
 */
import type { FastifyInstance } from 'fastify'
import { sign } from '@fastify/cookie'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../src/core/proxy/admin-api-client', async () => {
  const { adminApiStub } = await import('../helpers/admin-api-stub')
  return {
    AdminApiClient: adminApiStub({
      getLoginOptions: async () => ({ providers: [], localLoginEnabled: true }),
      // The write-that-throws default is what the failure branch needs.
    }),
  }
})

const { buildServer } = await import('../../src/core/server')

const SESSION_SECRET = 'stale-session-cookie-secret-long-enough-32'
let fastify: FastifyInstance

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
})

const USER = JSON.stringify({ id: 'u1', username: 'admin', role: 'admin', token: 'jwt' })

function setCookies(res: { headers: Record<string, unknown> }): string[] {
  const h = res.headers['set-cookie']
  return Array.isArray(h) ? h : typeof h === 'string' ? [h] : []
}

/** The Set-Cookie that deletes `session`, if any. */
function sessionClear(res: { headers: Record<string, unknown> }): string | undefined {
  return setCookies(res).find((c) => /^session=;/.test(c))
}

function csrfOf(html: string): string {
  const m = html.match(/name="_csrf" value="([0-9a-f]{32})"/)
  if (!m) throw new Error('login page carries no CSRF token')
  return m[1]
}

describe('a session cookie this server cannot verify', () => {
  it('is cleared when it was signed under another secret', async () => {
    const rotated = sign(USER, 'the-secret-the-previous-container-had-32chars')
    const res = await fastify.inject({ method: 'GET', url: '/login', cookies: { session: rotated } })
    expect(res.statusCode).toBe(200)
    const clear = sessionClear(res)
    expect(clear, 'no Set-Cookie deleting session').toBeDefined()
    // Same identity the login route sets it with, or the browser keeps the old one.
    expect(clear).toMatch(/Path=\//)
    expect(clear).toMatch(/Expires=Thu, 01 Jan 1970|Max-Age=0/)
    expect(clear).toMatch(/HttpOnly/)
    expect(clear).toMatch(/SameSite=Strict/)
  })

  it('is cleared when it is not even signed JSON', async () => {
    const res = await fastify.inject({ method: 'GET', url: '/', cookies: { session: 'garbage' } })
    expect(sessionClear(res)).toBeDefined()
  })

  it('the login POST that follows still passes CSRF whether or not the browser dropped it', async () => {
    const rotated = sign(USER, 'the-secret-the-previous-container-had-32chars')
    const page = await fastify.inject({ method: 'GET', url: '/login', cookies: { session: rotated } })
    const token = csrfOf(page.body)

    // Browser honoured the clear: no cookie on the POST.
    const dropped = await fastify.inject({
      method: 'POST',
      url: '/login',
      payload: { _csrf: token, username: 'admin', password: 'wrong' },
    })
    expect(dropped.statusCode).not.toBe(403)

    // Browser ignored the clear: stale cookie still on the POST.
    const kept = await fastify.inject({
      method: 'POST',
      url: '/login',
      cookies: { session: rotated },
      payload: { _csrf: token, username: 'admin', password: 'wrong' },
    })
    expect(kept.statusCode).not.toBe(403)
  })
})

describe('a session cookie this server can verify', () => {
  it('is left alone — clearing it would log the operator out', async () => {
    const valid = fastify.signCookie(USER)
    const res = await fastify.inject({ method: 'GET', url: '/login', cookies: { session: valid } })
    // Logged-in users are bounced off the login page; either way, no clear.
    expect(sessionClear(res)).toBeUndefined()
  })
})

describe('the login page is never served from cache', () => {
  it('GET /login is no-store', async () => {
    const res = await fastify.inject({ method: 'GET', url: '/login' })
    expect(res.statusCode).toBe(200)
    expect(res.headers['cache-control']).toBe('no-store')
  })

  it('a failed POST /login re-render is no-store too', async () => {
    const page = await fastify.inject({ method: 'GET', url: '/login' })
    const res = await fastify.inject({
      method: 'POST',
      url: '/login',
      payload: { _csrf: csrfOf(page.body), username: 'admin', password: 'wrong' },
    })
    expect(res.statusCode).toBe(200)
    expect(res.headers['cache-control']).toBe('no-store')
  })

  it('an unrelated page is not forced to no-store by this rule', async () => {
    const res = await fastify.inject({ method: 'GET', url: '/health' })
    expect(res.headers['cache-control']).not.toBe('no-store')
  })
})
