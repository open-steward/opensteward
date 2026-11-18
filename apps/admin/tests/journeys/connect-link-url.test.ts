/**
 * What the operator is shown after minting a Connect Link.
 *
 * integration-server withholds the URL when it cannot resolve a
 * browser-reachable base (the admin's create call reaches it over the compose
 * network, so the request's own Host is `integration-server`). The banner must
 * then say what to configure — never paste an internal hostname as the link to
 * email a customer, and never fall back to a bare `/connect/<token>` path,
 * which reads like a working link but is relative to the admin's own origin,
 * not the integration-server's.
 */
import type { FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockCreateConnectSession = vi.fn()
const mockGetConnectSession = vi.fn()
const mockGetCompanyInfo = vi.fn(async () => null as unknown)

vi.mock('../../src/core/proxy/admin-api-client', async () => {
  // `await import`: vi.mock is hoisted above this file's imports, but the
  // factory body runs later, so it can import what the top level cannot.
  const { adminApiStub } = await import('../helpers/admin-api-stub')
  return {
    AdminApiClient: adminApiStub({
      createConnectSession: mockCreateConnectSession,
      // The mint redirects and the GET re-resolves the link from its session
      // id, so this — not the create response — is where the banner's URL
      // comes from now.
      getConnectSession: mockGetConnectSession,
      getCompanyInfo: mockGetCompanyInfo,
      getLoginOptions: async () => {
        return { providers: [], localLoginEnabled: true }
      },
      listConnectSessions: async () => {
        return [
          {
            id: 's1',
            token: 'abc123',
            status: 'active',
            tenantId: 'default',
            label: 'Acme',
            allowedPlatforms: [],
            allowedVerticals: [],
            createdAt: '2026-08-20T09:00:00Z',
            expiresAt: null,
          },
        ]
      },
      listConnectLinkTemplates: async () => {
        return []
      },
      listScopeGroups: async () => {
        return []
      },
      listPlatforms: async () => {
        return []
      },
      getVerticals: async () => {
        return []
      },
      listEndUsers: async () => {
        return []
      },
    }),
  }
})

const { buildServer } = await import('../../src/core/server')

const SESSION_SECRET = 'connect-link-url-session-secret-long-enough'
let fastify: FastifyInstance

function session() {
  return fastify.signCookie(
    JSON.stringify({ id: 'u1', username: 'admin', role: 'admin', token: 'jwt' }),
  )
}

/** Where the mint redirected to — i.e. what the address bar ends up holding. */
let lastMintRedirect = ''

/**
 * Mint a link and get the page the operator ends on.
 *
 * The POST answers with a redirect and the GET renders (so a refresh is a
 * plain GET — `connect-link-refresh.test.ts`), but the invariant is unchanged:
 * the link embeds a connect token and `req.url` is not redacted from the
 * request log, so only the session id may ride in that redirect. The hop is
 * kept in `lastMintRedirect` for the case that checks it. Driving the real
 * flow is also a stronger test than hand-feeding the banner its inputs.
 */
async function mintLink(url: string | null) {
  const record = { id: 's1', token: 'abc123', ...(url ? { url } : {}) }
  mockCreateConnectSession.mockResolvedValue(record)
  mockGetConnectSession.mockResolvedValue(record)
  const cookie = session()
  const { generateCsrfToken } = await import('../../src/core/auth/csrf')
  const created = await fastify.inject({
    method: 'POST',
    url: '/connect-links',
    cookies: { session: cookie },
    payload: {
      _csrf: generateCsrfToken(cookie, SESSION_SECRET),
      label: 'Acme',
      linkMode: 'customer-picks-adapter',
      tenantId: 'default',
    },
  })
  lastMintRedirect = String(created.headers.location ?? '')
  if (created.statusCode < 300 || created.statusCode >= 400) return created
  return fastify.inject({
    method: 'GET',
    url: lastMintRedirect,
    cookies: { session: cookie },
  })
}

beforeEach(async () => {
  lastMintRedirect = ''
  mockGetCompanyInfo.mockResolvedValue(null)
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
  vi.clearAllMocks()
})

describe('Journey: an operator mints a Connect Link', () => {
  it('shows the absolute URL when one could be resolved', async () => {
    const res = await mintLink('https://acme.example/connect/abc123')
    expect(res.body).toContain('https://acme.example/connect/abc123')
  })

  it('never puts the connect token in the address bar or the logs', async () => {
    const res = await mintLink('https://acme.example/connect/abc123')
    // The token is document content, not a URL parameter. `req.url` is logged
    // unredacted, so a redirect carrying it writes a live credential to stdout.
    expect(res.statusCode).toBe(200)
    expect(String(res.headers.location ?? '')).not.toContain('abc123')
    // The redirect between the two, which is the address the browser keeps.
    expect(lastMintRedirect).not.toContain('abc123')
    expect(decodeURIComponent(lastMintRedirect)).not.toContain('abc123')
  })

  it('never presents an internal hostname as the link', async () => {
    const res = await mintLink(null)
    expect(res.body).not.toContain('integration-server/connect/')
  })

  it('tells the operator what to set when no URL could be resolved', async () => {
    const res = await mintLink(null)
    expect(res.body).toContain('PUBLIC_BASE_URL')
  })

  it('does not offer a bare token path as if it were the link', async () => {
    // '/connect/abc123' relative to the admin origin goes nowhere useful.
    const res = await mintLink(null)
    expect(res.body).not.toContain('value="/connect/abc123"')
  })
})
