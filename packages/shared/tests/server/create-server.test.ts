import { describe, it, expect } from 'vitest'
import {
  buildLoggerConfig,
  createBaseServer,
  LOG_REDACT_PATHS,
} from '../../src/server/create-server'

describe('buildLoggerConfig', () => {
  it('disables logging when input is false', () => {
    expect(buildLoggerConfig(false)).toBe(false)
  })

  it('applies redact when input is undefined', () => {
    const cfg = buildLoggerConfig(undefined)
    expect(cfg).not.toBe(false)
    if (typeof cfg === 'object' && cfg) {
      expect(cfg.redact.paths).toEqual(LOG_REDACT_PATHS)
      expect(cfg.redact.censor).toBe('[Redacted]')
    }
  })

  it('applies redact when input is true', () => {
    const cfg = buildLoggerConfig(true)
    if (typeof cfg === 'object' && cfg) {
      expect(cfg.redact.paths).toEqual(LOG_REDACT_PATHS)
    }
  })

  it('preserves user-supplied level and adds redact', () => {
    const cfg = buildLoggerConfig({ level: 'debug' })
    if (typeof cfg === 'object' && cfg) {
      expect(cfg.level).toBe('debug')
      expect(cfg.redact.paths).toContain('req.headers.authorization')
    }
  })

  it('includes the expected sensitive header paths', () => {
    expect(LOG_REDACT_PATHS).toEqual(
      expect.arrayContaining([
        'req.headers.authorization',
        'req.headers.cookie',
        'req.headers["x-admin-secret"]',
        'req.headers["x-api-key"]',
        'req.headers["x-bootstrap-token"]',
        'res.headers["set-cookie"]',
      ]),
    )
  })

  it('redacts an email address a log line names, at the top level or one down', async () => {
    const { default: Fastify } = await import('fastify')
    const lines: string[] = []
    const stream = { write: (s: string) => void lines.push(s) }
    const fastify = Fastify({ logger: { ...(buildLoggerConfig(true) as object), stream } })
    fastify.get('/probe', async (request) => {
      request.log.info({ email: 'olivia@northwind.example' }, 'top level')
      request.log.info({ user: { id: 'u1', email: 'olivia@northwind.example' } }, 'nested')
      return { ok: true }
    })
    await fastify.inject({ method: 'GET', url: '/probe' })
    await fastify.close()
    const logs = lines.join('')
    expect(logs).toContain('top level')
    expect(logs).toContain('"id":"u1"')
    expect(logs).not.toContain('olivia@northwind.example')
  })
})

/**
 * CORS is off unless a deployment names the origins it trusts.
 *
 * The developer API authenticates with a Bearer key, so the danger of getting
 * this wrong is a hostile page in a victim's browser reading responses it
 * should not — which is why the default stays `false` and why nothing here
 * enables `credentials`.
 */
describe('createBaseServer — CORS', () => {
  async function preflight(corsOrigin: boolean | string | string[] | undefined, origin: string) {
    const fastify = await createBaseServer(corsOrigin === undefined ? { logger: false } : { logger: false, corsOrigin })
    fastify.get('/v1/customers', async () => ({ data: [] }))
    await fastify.ready()
    const res = await fastify.inject({
      method: 'OPTIONS',
      url: '/v1/customers',
      headers: {
        origin,
        'access-control-request-method': 'GET',
        'access-control-request-headers': 'authorization',
      },
    })
    await fastify.close()
    return res
  }

  it('sends no allow-origin header by default', async () => {
    const res = await preflight(undefined, 'http://localhost:3003')
    expect(res.headers['access-control-allow-origin']).toBeUndefined()
  })

  it('answers a preflight from an allowed origin', async () => {
    const res = await preflight(['http://localhost:3003'], 'http://localhost:3003')
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:3003')
  })

  it('permits the Authorization header the console has to send', async () => {
    const res = await preflight(['http://localhost:3003'], 'http://localhost:3003')
    expect(String(res.headers['access-control-allow-headers']).toLowerCase()).toContain('authorization')
  })

  it('refuses an origin that was not named', async () => {
    const res = await preflight(['http://localhost:3003'], 'https://evil.example')
    expect(res.headers['access-control-allow-origin']).toBeUndefined()
  })

  it('advertises the write methods, or the console can only ever read', async () => {
    // @fastify/cors defaults to GET,HEAD,POST. A browser will not send PATCH,
    // PUT or DELETE unless the preflight names it, so every update and delete
    // from a cross-origin console failed as a CORS error while the server
    // happily answered the preflight 204.
    const fastify = await createBaseServer({ logger: false, corsOrigin: ['http://localhost:3003'] })
    fastify.patch('/v1/crm/contacts/:id', async () => ({ ok: true }))
    await fastify.ready()
    const res = await fastify.inject({
      method: 'OPTIONS',
      url: '/v1/crm/contacts/abc',
      headers: { origin: 'http://localhost:3003', 'access-control-request-method': 'PATCH' },
    })
    await fastify.close()
    const allowed = String(res.headers['access-control-allow-methods'])
    for (const m of ['PATCH', 'PUT', 'DELETE']) expect(allowed).toContain(m)
  })

  it('leaves /admin/* outside the CORS boundary entirely', async () => {
    // Admin routes are the operator's server-to-server surface, gated by
    // X-Admin-Secret. No browser client exists for them, and in local dev
    // adminGuard falls through open when ADMIN_SECRET is unset — so script on
    // an allowed origin could otherwise read admin JSON.
    const fastify = await createBaseServer({ logger: false, corsOrigin: ['http://localhost:3003'] })
    fastify.get('/admin/api-keys', async () => ({ data: [] }))
    await fastify.ready()
    const res = await fastify.inject({
      method: 'OPTIONS',
      url: '/admin/api-keys',
      headers: { origin: 'http://localhost:3003', 'access-control-request-method': 'GET' },
    })
    await fastify.close()
    expect(res.headers['access-control-allow-origin']).toBeUndefined()
  })

  it('never allows credentials — the API is Bearer-authenticated, not cookie-authenticated', async () => {
    // With credentials enabled, a named origin could ride a victim's cookies.
    const res = await preflight(['http://localhost:3003'], 'http://localhost:3003')
    expect(res.headers['access-control-allow-credentials']).toBeUndefined()
  })
})
