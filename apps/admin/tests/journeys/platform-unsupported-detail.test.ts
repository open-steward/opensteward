/**
 * A platform marked `unsupported` (packages/shared's `UnsupportedPlatform`,
 * forwarded through `apiClient.listPlatforms()`'s rows) stays listed and
 * viewable but can never be enabled or connected.
 *
 * The detail page must show why (a banner with the reason and, when set, a
 * tracking-issue link) and must never offer the credentials Save/Enable
 * form. The POST handler is a second, server-side gate: even if a stale page
 * or a hand-crafted request submits the form, it must never call
 * `enablePlatform` (or save credentials) for an unsupported platform — it
 * re-renders the page with an inline error instead. A 400
 * `PLATFORM_UNSUPPORTED` the API answers regardless (e.g. a platform marked
 * unsupported between the page load and the submit) must show its reason
 * too, not a generic failure.
 */
import type { FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const REASON = 'Weebly retired its developer API; there is no supported way to connect an account.'
const ISSUE_URL = 'https://github.com/open-steward/opensteward/issues/500'

const mockSetPlatformConfig = vi.fn(async () => undefined)
const mockEnablePlatform = vi.fn(async () => undefined)

const UNSUPPORTED_ROW = {
  slug: 'weebly',
  enabled: false,
  hasConfig: false,
  unsupported: { reason: REASON, issueUrl: ISSUE_URL },
}

let platformsRow: Record<string, unknown> = UNSUPPORTED_ROW

vi.mock('../../src/core/proxy/admin-api-client', async () => {
  // `await import`: vi.mock is hoisted above this file's imports, but the
  // factory body runs later, so it can import what the top level cannot.
  const { adminApiStub } = await import('../helpers/admin-api-stub')
  return {
    AdminApiClient: adminApiStub({
      getLoginOptions: async () => ({ providers: [], localLoginEnabled: true }),
      listPlatforms: async () => [platformsRow],
      getPlatformConfig: async () => null,
      listConnections: async () => [],
      listScopeGroups: async () => [],
      getCompanyInfo: async () => null,
      setPlatformConfig: mockSetPlatformConfig,
      enablePlatform: mockEnablePlatform,
    }),
  }
})

const { buildServer } = await import('../../src/core/server')

const SESSION_SECRET = 'platform-unsupported-detail-secret-long-enough'
let fastify: FastifyInstance

function session() {
  return fastify.signCookie(
    JSON.stringify({ id: 'u1', username: 'admin', role: 'admin', token: 'jwt' }),
  )
}

async function getDetailPage() {
  return fastify.inject({
    method: 'GET',
    url: '/platforms/ecommerce/weebly',
    cookies: { session: session() },
  })
}

/**
 * Generates the CSRF token directly rather than scraping it off the
 * rendered page: an unsupported-and-disabled platform's detail page renders
 * no form at all, so there is no hidden `_csrf` field to scrape — exactly
 * the "stale page / hand-crafted request" scenario the POST handler's
 * server-side gate defends, so the token still has to be valid for the
 * session.
 */
async function postSave(overrides: Record<string, unknown> = {}) {
  const { generateCsrfToken } = await import('../../src/core/auth/csrf.js')
  const cookie = session()
  return fastify.inject({
    method: 'POST',
    url: '/platforms/ecommerce/weebly',
    cookies: { session: cookie },
    payload: {
      _csrf: generateCsrfToken(cookie, SESSION_SECRET),
      clientId: 'abc',
      clientSecret: 'shh',
      ...overrides,
    },
  })
}

beforeEach(async () => {
  platformsRow = UNSUPPORTED_ROW
  mockSetPlatformConfig.mockClear()
  mockEnablePlatform.mockClear()
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

describe('Journey: an admin views an unsupported platform', () => {
  it('shows a banner with the reason', async () => {
    const res = await getDetailPage()
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain(REASON)
  })

  it('links the tracking issue', async () => {
    const res = await getDetailPage()
    expect(res.body).toContain(`href="${ISSUE_URL}"`)
  })

  it('never renders the credentials Save/Enable form', async () => {
    const res = await getDetailPage()
    expect(res.body).not.toContain('id="clientId"')
    expect(res.body).not.toContain('id="clientSecret"')
  })

  it('still offers Disable when the platform is currently enabled', async () => {
    platformsRow = { ...UNSUPPORTED_ROW, enabled: true }
    const res = await getDetailPage()
    expect(res.body).toContain('/platforms/ecommerce/weebly/disable')
  })
})

describe('Journey: the Configure tab lists an unsupported platform', () => {
  it('shows a warning badge on its row', async () => {
    const res = await fastify.inject({
      method: 'GET',
      url: '/platforms?tab=configure&status=all',
      cookies: { session: session() },
    })
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('badge--warning')
    expect(res.body).toContain('Unsupported')
  })
})

describe('Journey: an admin tries to save/enable an unsupported platform', () => {
  it('never calls setPlatformConfig or enablePlatform', async () => {
    await postSave()
    expect(mockSetPlatformConfig).not.toHaveBeenCalled()
    expect(mockEnablePlatform).not.toHaveBeenCalled()
  })

  it('re-renders the page with an inline error naming the reason', async () => {
    const res = await postSave()
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain(REASON)
  })

  it('shows a graceful message when the API itself refuses with PLATFORM_UNSUPPORTED', async () => {
    // Simulates a platform that became unsupported after the page was
    // fetched but before the operator submitted — the row admin's own
    // pre-check saw was still "supported", so the request reaches
    // enablePlatform, which the upstream now refuses.
    platformsRow = { slug: 'weebly', enabled: false, hasConfig: false }
    mockSetPlatformConfig.mockResolvedValueOnce(undefined)
    mockEnablePlatform.mockRejectedValueOnce(
      Object.assign(new Error('Request failed with status code 400'), {
        response: {
          status: 400,
          data: {
            error: {
              code: 'PLATFORM_UNSUPPORTED',
              message: `Weebly is not supported: ${REASON}`,
              reason: REASON,
              issueUrl: ISSUE_URL,
            },
          },
        },
      }),
    )
    const res = await postSave()
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain(REASON)
    expect(res.body).not.toContain('Failed to save platform config.')
  })
})
