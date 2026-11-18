/**
 * The scope-group form's preset logic lives in /public/js/scope-group-presets.js
 * (tested in tests/unit/scope-group-presets.test.ts). This pins the half that
 * file cannot see: the page actually loads it, before the inline script that
 * calls into it, and carries the hint the logic reports into.
 *
 * Without the script tag the inline handler throws on the first preset change
 * and the form silently stops responding — which would look exactly like the
 * bug the extraction fixed.
 */
import type { FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../src/core/proxy/admin-api-client', async () => {
  const { adminApiStub } = await import('../helpers/admin-api-stub')
  return {
    AdminApiClient: adminApiStub({
      listScopeGroups: async () => [],
      listCatalog: async () => [{ vertical: 'accounting', slug: 'fortnox', name: 'Fortnox' }],
      listAllPlatformRows: async () => [
        { vertical: 'accounting', slug: 'fortnox', enabled: true, hasConfig: true },
      ],
      getLoginOptions: async () => ({ providers: [], localLoginEnabled: true }),
    }),
  }
})

const { buildServer } = await import('../../src/core/server')

const SESSION_SECRET = 'scope-group-presets-wired-secret-long-enough'
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

const session = () =>
  fastify.signCookie(JSON.stringify({ id: 'u1', username: 'admin', role: 'admin', token: 'jwt' }))

describe('the scope-group form is wired to the preset module', () => {
  it('loads the module before the inline script that uses it', async () => {
    const res = await fastify.inject({
      method: 'GET',
      url: '/scope-groups/new',
      cookies: { session: session() },
    })
    expect(res.statusCode).toBe(200)
    const tag = res.body.indexOf('<script src="/public/js/scope-group-presets.js"></script>')
    const use = res.body.indexOf('__scopeGroupPresets.applyPresetTo')
    expect(tag).toBeGreaterThan(-1)
    expect(use).toBeGreaterThan(tag)
    // Not deferred — a deferred script would run after the inline one.
    expect(res.body).not.toContain('scope-group-presets.js" defer')
  })

  it('serves the module', async () => {
    const res = await fastify.inject({ method: 'GET', url: '/public/js/scope-group-presets.js' })
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('__scopeGroupPresets')
  })

  it('carries the hint shown when Read-only has no catalogued set to tick', async () => {
    const res = await fastify.inject({
      method: 'GET',
      url: '/scope-groups/new',
      cookies: { session: session() },
    })
    expect(res.body).toContain('id="scope-hint-no-read"')
    expect(res.body).toContain('no catalogued read-only scopes')
  })
})
