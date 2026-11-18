/**
 * The admin UI's error handler must actually run.
 *
 * Fastify copies the parent's error handler into each child context at
 * registration time, so `setErrorHandler` must run before the route plugins
 * are registered — a handler set afterwards never applies to any of those
 * routes, and every upstream failure falls through to Fastify's default
 * handler as raw JSON:
 *
 *   {"statusCode":500,"code":"ERR_BAD_RESPONSE","error":"Internal Server Error",
 *    "message":"Request failed with status code 429"}
 *
 * That is what an operator would see after creating a Connect Link when
 * integration-server's rate limiter answers 429 — a 500 with an axios string
 * and no error page — and an expired session would render JSON instead of
 * sending the operator to log in again.
 *
 * These tests pin the two behaviours the handler exists for: upstream
 * failures render the error page, and a 401 redirects to /login.
 */
import type { FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockListConnectSessions = vi.fn()

vi.mock('../../src/core/proxy/admin-api-client', async () => {
  // `await import`: vi.mock is hoisted above this file's imports, but the
  // factory body runs later, so it can import what the top level cannot.
  const { adminApiStub } = await import('../helpers/admin-api-stub')
  return {
    AdminApiClient: adminApiStub({
      listConnectSessions: mockListConnectSessions,
      getLoginOptions: async () => {
        return { providers: [], localLoginEnabled: true }
      },
      listConnectLinkTemplates: async () => {
        return []
      },
      getCompanyInfo: async () => {
        return null
      },
    }),
  }
})

const { buildServer } = await import('../../src/core/server')

const SESSION_SECRET = 'admin-error-handler-session-secret-long-enough'
let fastify: FastifyInstance

/** An error shaped like the one axios throws when an upstream call fails. */
function upstreamError(status: number, message: string): Error {
  return Object.assign(new Error(message), {
    name: 'AxiosError',
    isAxiosError: true,
    code: status >= 500 ? 'ERR_BAD_RESPONSE' : 'ERR_BAD_REQUEST',
    response: { status, data: { error: message } },
  })
}

beforeEach(async () => {
  mockListConnectSessions.mockReset()
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

function getConnectLinks() {
  const sessionCookie = fastify.signCookie(
    JSON.stringify({ id: 'u1', username: 'admin', role: 'admin', token: 'jwt-token' }),
  )
  return fastify.inject({
    method: 'GET',
    url: '/connect-links',
    cookies: { session: sessionCookie },
  })
}

describe('Journey: an upstream failure while loading an admin page', () => {
  it('renders the error page carrying the upstream status, not raw JSON', async () => {
    mockListConnectSessions.mockRejectedValue(
      upstreamError(429, 'Request failed with status code 429'),
    )
    const res = await getConnectLinks()
    expect(res.statusCode).toBe(429)
    expect(res.headers['content-type']).toContain('text/html')
    expect(res.body).not.toContain('ERR_BAD_RESPONSE')
  })

  it('sends the operator to /login when the session is no longer accepted', async () => {
    mockListConnectSessions.mockRejectedValue(upstreamError(401, 'Unauthorized'))
    const res = await getConnectLinks()
    expect(res.statusCode).toBe(302)
    expect(res.headers.location).toBe('/login')
  })
})
