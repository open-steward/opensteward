/**
 * Reflected-XSS guard for `/scope-groups?platform=…`. Reflecting the raw
 * query param into `const SELECTED = <%- JSON.stringify(...) %>` inside an
 * inline <script> is a reflected XSS: `<%-` is unescaped and JSON.stringify
 * does not neutralize `</script>`, so a crafted link opened by a logged-in
 * operator would run script in the admin origin (→ account takeover, since it
 * can read the DOM _csrf token). Every in-script value must therefore go
 * through `jsonForScript`.
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

const SESSION_SECRET = 'scope-groups-xss-secret-long-enough-32ch'
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

const session = (role = 'admin') =>
  fastify.signCookie(JSON.stringify({ id: 'u1', username: 'admin', role, token: 'jwt' }))

describe('scope-groups reflected XSS', () => {
  it('escapes a </script> breakout in the ?platform= query param', async () => {
    const payload = '</script><script>window.__xss=1</script>'
    const res = await fastify.inject({
      method: 'GET',
      url: `/scope-groups?platform=${encodeURIComponent(payload)}`,
      cookies: { session: session() },
    })
    expect(res.statusCode).toBe(200)
    // The injected element must never appear as live markup...
    expect(res.body).not.toContain('<script>window.__xss')
    // ...and the payload survives only as escaped data.
    expect(res.body).toContain('\\u003c/script\\u003e')
  })
})
