/**
 * A pinned Connect Link must actually name an adapter.
 *
 * "Pinned" means the operator knows the customer AND the adapter: the customer
 * opens the link, skips the picker, and goes straight to that platform's OAuth.
 * The form says so — `Vertical *` and `Adapter *`, asterisks applied by
 * `applyMode()` whenever the mode is pinned — but the browser is not the
 * authority: both selects lead with `<option value="">Any</option>`, so the
 * route must reject a pinned submit that names no vertical or adapter.
 * Otherwise it mints a link with no `allowedVerticals` and no
 * `allowedPlatforms`: an adapter-unrestricted link, minted silently, from a
 * form that had just claimed those fields were required.
 *
 * The other two modes deliberately leave the adapter open — `customer-picks-adapter`
 * and `self-register` exist precisely so the customer chooses — so the rule is
 * scoped to pinned.
 */
import type { FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createHmac } from 'crypto'

const mockCreateConnectSession = vi.fn(async () => ({ id: 's1', token: 'tok', url: null }))

vi.mock('../../src/core/proxy/admin-api-client', async () => {
  // `await import`: vi.mock is hoisted above this file's imports, but the
  // factory body runs later, so it can import what the top level cannot.
  const { adminApiStub } = await import('../helpers/admin-api-stub')
  return {
    AdminApiClient: adminApiStub({
      createConnectSession: mockCreateConnectSession,
      getLoginOptions: async () => {
        return { providers: [], localLoginEnabled: true }
      },
      getCompanyInfo: async () => {
        return null
      },
      listConnectSessions: async () => {
        return []
      },
      listConnectLinkTemplates: async () => {
        return []
      },
      listScopeGroups: async () => {
        return []
      },
      listAllPlatformRows: async () => {
        return [{ vertical: 'accounting', slug: 'fortnox', enabled: true, hasConfig: true }]
      },
      listCatalog: async () => {
        return [{ vertical: 'accounting', slug: 'fortnox', name: 'Fortnox' }]
      },
      listEndUsers: async () => {
        return []
      },
    }),
  }
})

const { buildServer } = await import('../../src/core/server')

const SESSION_SECRET = 'pinned-connect-link-session-secret-long-enough'
let fastify: FastifyInstance

function sessionCookie(): string {
  return fastify.signCookie(
    JSON.stringify({ id: 'u1', username: 'admin', role: 'admin', token: 'jwt' }),
  )
}

function csrf(cookie: string): string {
  return createHmac('sha256', SESSION_SECRET).update(cookie).digest('hex').slice(0, 32)
}

async function mint(fields: Record<string, string>) {
  const cookie = sessionCookie()
  return fastify.inject({
    method: 'POST',
    url: '/connect-links',
    cookies: { session: cookie },
    payload: { _csrf: csrf(cookie), label: 'Acme onboarding', ...fields },
  })
}

beforeEach(async () => {
  mockCreateConnectSession.mockClear()
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

describe('Journey: minting a pinned Connect Link', () => {
  it('refuses a pinned link with no vertical, and says why', async () => {
    const res = await mint({ linkMode: 'pinned', vertical: '', platform: '' })
    expect(mockCreateConnectSession).not.toHaveBeenCalled()
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toContain('text/html')
    expect(res.body.toLowerCase()).toMatch(/adapter|vertical/)
  })

  it('refuses a pinned link that names a vertical but no adapter', async () => {
    const res = await mint({ linkMode: 'pinned', vertical: 'accounting', platform: '' })
    expect(mockCreateConnectSession).not.toHaveBeenCalled()
    expect(res.statusCode).toBe(200)
  })

  it('mints a pinned link that names both', async () => {
    const res = await mint({ linkMode: 'pinned', vertical: 'accounting', platform: 'fortnox' })
    expect(mockCreateConnectSession).toHaveBeenCalledTimes(1)
    // Redirects, so a refresh is a plain GET — but carrying only the session
    // id: the link embeds a connect token and `req.url` is logged unredacted.
    expect(res.statusCode).toBe(302)
    expect(String(res.headers.location ?? '')).toMatch(/^\/connect-links\?link=/)
    expect(String(res.headers.location ?? '')).not.toContain('tok')
  })

  it('still allows customer-picks-adapter with no adapter — that is its purpose', async () => {
    const res = await mint({ linkMode: 'customer-picks-adapter', vertical: '', platform: '' })
    expect(mockCreateConnectSession).toHaveBeenCalledTimes(1)
    // Redirects, so a refresh is a plain GET — but carrying only the session
    // id: the link embeds a connect token and `req.url` is logged unredacted.
    expect(res.statusCode).toBe(302)
    expect(String(res.headers.location ?? '')).toMatch(/^\/connect-links\?link=/)
    expect(String(res.headers.location ?? '')).not.toContain('tok')
  })

  it('still allows self-register with no adapter', async () => {
    const res = await mint({ linkMode: 'self-register', vertical: '', platform: '' })
    expect(mockCreateConnectSession).toHaveBeenCalledTimes(1)
    // Redirects, so a refresh is a plain GET — but carrying only the session
    // id: the link embeds a connect token and `req.url` is logged unredacted.
    expect(res.statusCode).toBe(302)
    expect(String(res.headers.location ?? '')).toMatch(/^\/connect-links\?link=/)
    expect(String(res.headers.location ?? '')).not.toContain('tok')
  })
})
