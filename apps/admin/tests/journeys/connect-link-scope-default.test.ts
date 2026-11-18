/**
 * The new-link form defaults to "Use platform default", not read-only.
 *
 * A read-only link asks only for the platform's curated read scopes, so an
 * operator who wanted the scopes configured on the platform's OAuth app had
 * to remember to change the selector on every link. The admin console now
 * leads with the platform default. Read-only stays one choice away, and a
 * scope group that can no longer be found still falls back to read-only:
 * the least a deliberate choice could have meant.
 */
import type { FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockCreateConnectSession = vi.fn()

vi.mock('../../src/core/proxy/admin-api-client', async () => {
  const { adminApiStub } = await import('../helpers/admin-api-stub')
  return {
    AdminApiClient: adminApiStub({
      listConnections: async () => [],
      createConnectSession: mockCreateConnectSession,
      listTenants: async () => [{ id: 'default', name: 'Default' }],
      getLoginOptions: async () => ({ providers: [], localLoginEnabled: true }),
      getCompanyInfo: async () => null,
      listConnectSessions: async () => [],
      listConnectLinkTemplates: async () => [],
      listScopeGroups: async () => [
        {
          id: 7,
          name: 'Invoices only',
          vertical: 'accounting',
          platform: 'xero',
          scopes: ['accounting.transactions'],
        },
      ],
      listPlatforms: async () => [{ slug: 'xero', enabled: true, hasConfig: true }],
      getVerticals: async () => [{ name: 'accounting' }],
      listAllPlatformRows: async () => [
        { vertical: 'accounting', slug: 'xero', enabled: true, hasConfig: true },
      ],
      listCatalog: async () => [
        { vertical: 'accounting', slug: 'xero', name: 'Xero', authType: 'oauth2' },
      ],
      listEndUsers: async () => [],
    }),
  }
})

const { buildServer } = await import('../../src/core/server')

const SESSION_SECRET = 'connect-link-scope-default-secret-long-enough'

let fastify: FastifyInstance

beforeEach(async () => {
  mockCreateConnectSession.mockReset().mockResolvedValue({ id: 's1', token: 'abc123' })
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

function sessionCookie(): string {
  return fastify.signCookie(
    JSON.stringify({ id: 'u1', username: 'admin', role: 'admin', token: 'jwt' }),
  )
}

async function mint(overrides: Record<string, string> = {}) {
  const cookie = sessionCookie()
  const { generateCsrfToken } = await import('../../src/core/auth/csrf')
  await fastify.inject({
    method: 'POST',
    url: '/connect-links',
    cookies: { session: cookie },
    payload: {
      _csrf: generateCsrfToken(cookie, SESSION_SECRET),
      label: 'scope default',
      linkMode: 'pinned',
      vertical: 'accounting',
      platform: 'xero',
      tenantId: 'default',
      ...overrides,
    },
  })
  expect(mockCreateConnectSession).toHaveBeenCalledTimes(1)
  return mockCreateConnectSession.mock.calls[0][1] as Record<string, unknown>
}

describe('Journey: a new Connect Link uses the platform default scopes unless told otherwise', () => {
  it('renders "Use platform default" first and selected', async () => {
    const res = await fastify.inject({
      method: 'GET',
      url: '/connect-links/new',
      cookies: { session: sessionCookie() },
    })
    expect(res.statusCode).toBe(200)
    const select = res.body.match(/<select[^>]*name="scopeGroupId"[\s\S]*?<\/select>/)?.[0] ?? ''
    const options = [...select.matchAll(/<option value="([^"]+)"( selected)?/g)]
    expect(options[0]?.[1]).toBe('platform-default')
    expect(options[0]?.[2]).toBe(' selected')
    expect(options.filter((o) => o[2]).map((o) => o[1])).toEqual(['platform-default'])
    expect(select).not.toContain('(recommended)')
  })

  it('mints platform_default when the selector is absent', async () => {
    const payload = await mint()
    expect(payload['scopePolicy']).toBe('platform_default')
    expect(payload).not.toHaveProperty('scopes')
  })

  it('mints platform_default when it is chosen', async () => {
    expect((await mint({ scopeGroupId: 'platform-default' }))['scopePolicy']).toBe(
      'platform_default',
    )
  })

  it('still mints read_only when read-only is chosen', async () => {
    expect((await mint({ scopeGroupId: 'read-only' }))['scopePolicy']).toBe('read_only')
  })

  it('mints the chosen scope group as custom', async () => {
    const payload = await mint({ scopeGroupId: '7' })
    expect(payload['scopePolicy']).toBe('custom')
    expect(payload['scopes']).toEqual(['accounting.transactions'])
  })

  it('falls back to read_only for a scope group that no longer exists', async () => {
    expect((await mint({ scopeGroupId: '999' }))['scopePolicy']).toBe('read_only')
  })
})
