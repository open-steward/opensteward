/**
 * Service-to-service authentication for the settings poll.
 *
 * admin-api's `requireAuth` is JWT-only, and integration-server holds no
 * `JWT_SECRET` — deliberately, since that key signs admin user sessions. So
 * its 60-second settings poll had no way to authenticate and 401'd forever.
 *
 * This mirrors the mechanism already going the other way: admin-api calls
 * integration-server's `/admin/*` with `X-Admin-Secret`, checked by
 * `adminGuard` with a constant-time compare. The reverse direction now has an
 * equivalent, keyed on its own secret rather than reusing that one — sharing a
 * single secret across both directions would mean a compromise of either
 * service opened both paths.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import { serviceGuard, jwtOrServiceAuth } from '../../src/core/auth/service-auth'

let fastify: FastifyInstance

async function build(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false })
  app.get('/api/runtime-settings', { preHandler: serviceGuard }, async () => ({ data: ['ok'] }))
  await app.ready()
  return app
}

const call = (app: FastifyInstance, headers: Record<string, string> = {}) =>
  app.inject({ method: 'GET', url: '/api/runtime-settings', headers })

beforeEach(() => {
  vi.stubEnv('SERVICE_SECRET', 'correct-horse-battery-staple-32chars!!')
})

afterEach(async () => {
  await fastify?.close()
  vi.unstubAllEnvs()
})

describe('serviceGuard', () => {
  it('admits a request carrying the configured secret', async () => {
    fastify = await build()
    const res = await call(fastify, { 'x-service-secret': 'correct-horse-battery-staple-32chars!!' })
    expect(res.statusCode).toBe(200)
  })

  it('rejects a wrong secret', async () => {
    fastify = await build()
    const res = await call(fastify, { 'x-service-secret': 'wrong' })
    expect(res.statusCode).toBe(401)
  })

  it('rejects a request with no secret at all', async () => {
    fastify = await build()
    const res = await call(fastify)
    expect(res.statusCode).toBe(401)
  })

  it('refuses every request when no secret is configured — never falls open', async () => {
    // adminGuard serves local dev by allowing through when its secret is unset
    // and NODE_ENV is not production. That is what let a CORS-allowed origin
    // read admin JSON in dev. This guard has no such path in any environment.
    vi.stubEnv('SERVICE_SECRET', '')
    fastify = await build()
    expect((await call(fastify)).statusCode).toBe(401)
    expect((await call(fastify, { 'x-service-secret': 'anything' })).statusCode).toBe(401)
  })

  it('refuses when the secret is configured but empty-ish', async () => {
    vi.stubEnv('SERVICE_SECRET', '   ')
    fastify = await build()
    expect((await call(fastify, { 'x-service-secret': '   ' })).statusCode).toBe(401)
  })
})

describe('jwtOrServiceAuth — the settings list route', () => {
  /** The real route's shape: admin UI reads it with a JWT, services with the secret. */
  async function buildDual(): Promise<FastifyInstance> {
    const jwt = (await import('@fastify/jwt')).default
    const app = Fastify({ logger: false })
    await app.register(jwt, { secret: 'test-jwt-secret-that-is-long-enough' })
    app.get('/api/runtime-settings', { preHandler: jwtOrServiceAuth }, async () => ({ data: [] }))
    await app.ready()
    return app
  }

  it('admits a sibling service presenting the secret, with no JWT', async () => {
    fastify = await buildDual()
    const res = await call(fastify, { 'x-service-secret': 'correct-horse-battery-staple-32chars!!' })
    expect(res.statusCode).toBe(200)
  })

  it('still admits an operator with a valid JWT and no secret', async () => {
    fastify = await buildDual()
    const token = fastify.jwt.sign({ id: 'u1', username: 'admin', role: 'admin' })
    const res = await call(fastify, { authorization: `Bearer ${token}` })
    expect(res.statusCode).toBe(200)
  })

  it('rejects a caller with neither', async () => {
    fastify = await buildDual()
    expect((await call(fastify)).statusCode).toBe(401)
  })

  it('does not let a bad secret bypass the JWT check', async () => {
    fastify = await buildDual()
    const res = await call(fastify, { 'x-service-secret': 'wrong-but-long-enough-to-look-real' })
    expect(res.statusCode).toBe(401)
  })
})
