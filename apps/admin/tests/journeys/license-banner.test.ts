/**
 * The admin-only license banner: every signed-in admin page warns while the
 * license needs attention. One deployment-wide read of admin-api's GET
 * /api/license, cached 60 s after an answer and 15 s after an outage; a 401/403
 * belongs to one session and is never cached. A failure costs the banner, never
 * the page.
 */
import type { FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { COMMUNITY, licenseRecord } from '../helpers/license'

const mockGetLicense = vi.fn()

vi.mock('../../src/core/version-info', async () => {
  const actual = await vi.importActual<typeof import('../../src/core/version-info')>(
    '../../src/core/version-info',
  )
  const entry = (name: string) => ({
    name,
    version: '1.0.0',
    release: '0.1.0',
    gitSha: '3d0378c60aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    buildTime: '2026-10-06T12:00:00Z',
  })
  const info = {
    admin: entry('admin'),
    'admin-api': entry('admin-api'),
    'integration-server': entry('integration-server'),
    'docs-server': entry('docs-server'),
    'webhook-gateway': entry('webhook-gateway'),
  }
  return { ...actual, createVersionInfoCollector: () => async () => info }
})

const mockAcknowledgeAll = vi.fn()

vi.mock('../../src/core/proxy/admin-api-client', async () => {
  const { adminApiStub } = await import('../helpers/admin-api-stub')
  return {
    AdminApiClient: adminApiStub({
      getLicense: mockGetLicense,
      acknowledgeAll: mockAcknowledgeAll,
    }),
  }
})

const { buildServer } = await import('../../src/core/server')
const { generateCsrfToken } = await import('../../src/core/auth/csrf')

const SESSION_SECRET = 'license-banner-session-secret-long-enough'
let fastify: FastifyInstance

function sessionCookie(role: 'viewer' | 'operator' | 'admin' = 'admin') {
  return fastify.signCookie(JSON.stringify({ id: 'u1', username: role, role, token: 'jwt' }))
}
function get(url: string, role: 'viewer' | 'operator' | 'admin' = 'admin') {
  return fastify.inject({ method: 'GET', url, cookies: { session: sessionCookie(role) } })
}
const upstream = (status: number) =>
  Object.assign(new Error(`Request failed with status code ${status}`), {
    response: { status, data: {} },
  })
const advance = (ms: number) => vi.setSystemTime(Date.now() + ms)
const MISSING = licenseRecord({ state: 'MISSING', source: 'none', ...COMMUNITY })

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-09T12:00:00Z'))
  mockGetLicense.mockReset().mockResolvedValue(null)
  mockAcknowledgeAll.mockReset().mockResolvedValue(undefined)
  const built = await buildServer({
    server: { port: 0, host: '127.0.0.1' },
    session: { secret: SESSION_SECRET },
    admin_api: { url: 'http://localhost:3001' },
    docs_server: { url: 'http://docs.example.test' },
    sso: { publicBaseUrl: 'http://localhost:3000' },
  })
  fastify = built.fastify
  await fastify.ready()
})

afterEach(async () => {
  await fastify?.close()
  vi.useRealTimers()
})

describe('license banner', () => {
  it('warns an admin on every page while the license is expiring', async () => {
    mockGetLicense.mockResolvedValue(
      licenseRecord({
        state: 'EXPIRING',
        daysRemaining: 12,
        expiresAt: '2026-10-21T17:00:00.000Z',
      }),
    )
    for (const url of ['/notifications', '/tenants', '/settings']) {
      const res = await get(url)
      expect(res.statusCode, url).toBe(200)
      expect(res.body, url).toContain(
        '<div class="alert alert--warning" role="status" data-license-banner="EXPIRING"',
      )
      expect(res.body, url).toContain('The license expires in 12 days')
      expect(res.body, url).toContain('>License details</a>')
    }
  })

  it('MISSING: community mode and the signup link', async () => {
    mockGetLicense.mockResolvedValue(MISSING)
    const body = (await get('/notifications')).body
    expect(body).toContain('data-license-banner="MISSING"')
    expect(body).toContain('No license is installed.')
    expect(body).toContain('Running in community mode')
    expect(body).toContain('>Get a free license</a>')
    expect(body).toContain('href="https://opensteward.dev/license"')
  })

  it('quiet while VALID', async () => {
    mockGetLicense.mockResolvedValue(licenseRecord())
    expect((await get('/notifications')).body).not.toContain('data-license-banner')
  })

  it('admins only: operators and viewers neither see it nor cause the read', async () => {
    mockGetLicense.mockResolvedValue(MISSING)
    for (const role of ['operator', 'viewer'] as const) {
      expect((await get('/notifications', role)).body).not.toContain('data-license-banner')
    }
    expect(mockGetLicense).not.toHaveBeenCalled()
  })

  it('a failure costs the banner, never the page', async () => {
    mockGetLicense.mockRejectedValue(upstream(503))
    const res = await get('/notifications')
    expect(res.statusCode).toBe(200)
    expect(res.body).not.toContain('data-license-banner')
  })

  it('one read a minute, not one per page: read again only after 60 s', async () => {
    mockGetLicense.mockResolvedValue(licenseRecord({ state: 'GRACE' }))
    for (let i = 0; i < 3; i++) await get('/notifications')
    expect(mockGetLicense).toHaveBeenCalledTimes(1)
    advance(59_999)
    await get('/notifications')
    expect(mockGetLicense).toHaveBeenCalledTimes(1)
    advance(2) // 60,001 ms after the first read
    await get('/notifications')
    expect(mockGetLicense).toHaveBeenCalledTimes(2)
  })

  it('after an outage, asks again 15 s later and not before', async () => {
    mockGetLicense.mockRejectedValue(upstream(503))
    await get('/notifications')
    advance(14_999)
    await get('/notifications')
    expect(mockGetLicense).toHaveBeenCalledTimes(1)
    mockGetLicense.mockResolvedValue(MISSING)
    advance(2)
    const body = (await get('/notifications')).body
    expect(mockGetLicense).toHaveBeenCalledTimes(2)
    expect(body).toContain('data-license-banner="MISSING"')
  })

  it.each([401, 403])(
    'a %i belongs to one session: never cached, so it never hides the banner from other admins',
    async (status) => {
      mockGetLicense.mockRejectedValueOnce(upstream(status)).mockResolvedValue(MISSING)
      expect((await get('/notifications')).body).not.toContain('data-license-banner')
      expect((await get('/notifications')).body).toContain('data-license-banner="MISSING"')
      expect(mockGetLicense).toHaveBeenCalledTimes(2)
    },
  )

  it('a status this console cannot read costs the banner, never the page, on every page', async () => {
    // Version skew: a 200 in a community state whose record lacks the limits the alert reads.
    const { limits: _limits, ...partial } = MISSING
    mockGetLicense.mockResolvedValue(partial)
    for (const url of ['/notifications', '/tenants', '/notifications']) {
      const res = await get(url)
      expect(res.statusCode, url).toBe(200)
      expect(res.body, url).not.toContain('data-license-banner')
    }
  })

  it('non-GET requests never ask: a POST renders no shell', async () => {
    const cookie = sessionCookie()
    const res = await fastify.inject({
      method: 'POST',
      url: '/notifications/acknowledge-all',
      cookies: { session: cookie },
      payload: { _csrf: generateCsrfToken(cookie, SESSION_SECRET) },
    })
    expect(res.statusCode).toBe(302)
    expect(mockAcknowledgeAll).toHaveBeenCalledTimes(1)
    expect(mockGetLicense).not.toHaveBeenCalled()
  })

  it('the System page keeps its own alert, not a second banner', async () => {
    mockGetLicense.mockResolvedValue(
      licenseRecord({ state: 'GRACE', daysRemaining: -3, expiresAt: '2026-10-06T17:00:00.000Z' }),
    )
    const body = (await get('/settings/system')).body
    expect(body).not.toContain('data-license-banner')
    expect(body).toContain('data-license-alert="GRACE"')
  })

  it('JSON endpoints never ask', async () => {
    // /api/schema-status is an admin GET with the shell data hooks running (unlike
    // /api/version-info, which skipsShellData() already skips): only the hook's own
    // /api/ rule keeps it from asking.
    expect((await get('/api/schema-status')).statusCode).toBe(200)
    expect(mockGetLicense).not.toHaveBeenCalled()
  })
})
