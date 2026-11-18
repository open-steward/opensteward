/**
 * `GET /openapi/server-variables` — public endpoint that resolves
 * compiled defaults < config.yml < admin-DB (runtime_settings json rows)
 * into a single shape the docs-server feeds straight into
 * buildServersBlock.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { buildTestServer, type TestServer } from './helpers'

describe('GET /openapi/server-variables', () => {
  let server: TestServer | null = null
  afterEach(async () => {
    await server?.cleanup()
    server = null
  })

  it('returns compiled defaults when no overrides are configured', async () => {
    server = await buildTestServer()
    const res = await server.fastify.inject({ method: 'GET', url: '/openapi/server-variables' })
    expect(res.statusCode).toBe(200)
    const body = res.json() as Record<string, { default: string; enum?: string[] }>
    expect(body.scheme.default).toBe('http')
    expect(body.scheme.enum).toEqual(['http', 'https'])
    expect(body.host.default).toBe('localhost')
    expect(body.port.default).toBe('3010')
  })

  it('is unauthenticated — no Bearer header required', async () => {
    server = await buildTestServer()
    const res = await server.fastify.inject({ method: 'GET', url: '/openapi/server-variables' })
    expect(res.statusCode).toBe(200)
  })
})
