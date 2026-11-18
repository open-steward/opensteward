/**
 * A new Connect Link can set the sync schedule of the connection it makes.
 * Blank is the deployment default and sends nothing; a one-time link sends
 * no schedule (integration-server makes it `once`).
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
      listScopeGroups: async () => [],
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

const SESSION_SECRET = 'connect-link-sync-schedule-secret-long-enough'
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

const sessionCookie = () =>
  fastify.signCookie(JSON.stringify({ id: 'u1', username: 'admin', role: 'admin', token: 'jwt' }))

async function post(overrides: Record<string, string> = {}) {
  const cookie = sessionCookie()
  const { generateCsrfToken } = await import('../../src/core/auth/csrf')
  return fastify.inject({
    method: 'POST',
    url: '/connect-links',
    cookies: { session: cookie },
    payload: {
      _csrf: generateCsrfToken(cookie, SESSION_SECRET),
      label: 'sync schedule',
      linkMode: 'pinned',
      vertical: 'accounting',
      platform: 'xero',
      tenantId: 'default',
      ...overrides,
    },
  })
}
const sent = () => mockCreateConnectSession.mock.calls[0]![1] as Record<string, unknown>

describe('Journey: a Connect Link sets the connection’s sync schedule', () => {
  it('offers the schedule, defaulting to the deployment schedule', async () => {
    const res = await fastify.inject({
      method: 'GET',
      url: '/connect-links/new',
      cookies: { session: sessionCookie() },
    })
    const select = res.body.match(/<select[^>]*name="syncMode"[\s\S]*?<\/select>/)?.[0] ?? ''
    expect(select).toMatch(/<option value="" selected/)
    for (const v of ['custom', 'trigger_only', 'once']) expect(select).toContain(`value="${v}"`)
  })

  it('sends no schedule for the deployment default', async () => {
    await post()
    expect(sent()).not.toHaveProperty('syncSchedule')
  })

  it('sends trigger only', async () => {
    await post({ syncMode: 'trigger_only' })
    expect(sent()['syncSchedule']).toEqual({ mode: 'trigger_only' })
  })

  it('sends a custom interval in minutes', async () => {
    await post({ syncMode: 'custom', syncIntervalValue: '2', syncIntervalUnit: 'hours' })
    expect(sent()['syncSchedule']).toEqual({ mode: 'custom', intervalMinutes: 120 })
  })

  it('re-renders with the error and the operator’s values on a bad interval', async () => {
    const res = await post({
      syncMode: 'custom',
      syncIntervalValue: '10',
      syncIntervalUnit: 'minutes',
    })
    expect(mockCreateConnectSession).not.toHaveBeenCalled()
    expect(res.body).toContain('The shortest custom interval is 15 minutes.')
    expect(res.body).toMatch(/name="syncIntervalValue"[^>]*value="10"/)
  })

  it('sends no schedule with a one-time link', async () => {
    await post({ oneTimeOnly: 'on', syncMode: 'trigger_only' })
    expect(sent()).not.toHaveProperty('syncSchedule')
    expect(sent()['oneTimeOnly']).toBe(true)
  })

  it('sends an unticked one-time box as false, so the deployment default cannot re-tick it', async () => {
    // With `connect_link.one_time_default` on, an omitted field let the server
    // mint a one-time link anyway — and refuse the schedule chosen with it.
    await post({ syncMode: 'trigger_only' })
    expect(sent()['oneTimeOnly']).toBe(false)
    expect(sent()['syncSchedule']).toEqual({ mode: 'trigger_only' })
  })
})
