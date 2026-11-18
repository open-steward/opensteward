/**
 * The Copy button on the Connect links table.
 *
 * It did not copy a link. It rebuilt one, as
 * `companyInfo.baseUrl + '/connect/' + token`, and with no company base URL
 * configured that is the string `/connect/<token>` — which an operator pastes
 * into an email believing it works. It does not: relative to the admin's own
 * origin, it is not even the right service, let alone the right host.
 *
 * The same reconstruction also cannot know about a tenant on its own domain,
 * so it hands out the wrong host even when it has a base to work from.
 *
 * The file two dozen lines above already stated the rule, for the banner shown
 * after minting: "a bare /connect/<token> path would read like a link but
 * resolve against the ADMIN's origin … Better to show what to configure than
 * something copy-pasteable and wrong." The table simply did not follow it.
 *
 * So the row copies `s.url` — the address integration-server resolved for that
 * link — and when there is none, offers nothing to copy.
 */
import type { FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockListConnectSessions = vi.fn()
const mockGetCompanyInfo = vi.fn()

vi.mock('../../src/core/proxy/admin-api-client', async () => {
  const { adminApiStub } = await import('../helpers/admin-api-stub')
  return {
    AdminApiClient: adminApiStub({
      listConnectSessions: mockListConnectSessions,
      getCompanyInfo: mockGetCompanyInfo,
      getLoginOptions: async () => ({ providers: [], localLoginEnabled: true }),
      listConnectLinkTemplates: async () => [],
      listScopeGroups: async () => [],
      listPlatforms: async () => [],
      getVerticals: async () => [],
      listEndUsers: async () => [],
    }),
  }
})

const { buildServer } = await import('../../src/core/server')

const SESSION_SECRET = 'connect-link-copy-session-secret-long-enough'
const TOKEN = 'ce0501ba3a759d0af0c0535d30c7f58debebd30da2613c01d6036ee693f112eb'

function link(overrides: Record<string, unknown> = {}) {
  return {
    id: 's1',
    token: TOKEN,
    status: 'active',
    tenantId: 'default',
    label: 'Acme',
    allowedPlatforms: [],
    allowedVerticals: [],
    createdAt: '2026-08-20T09:00:00Z',
    expiresAt: '2026-12-20T09:00:00Z',
    ...overrides,
  }
}

let fastify: FastifyInstance

beforeEach(async () => {
  mockGetCompanyInfo.mockReset().mockResolvedValue(null)
  mockListConnectSessions.mockReset().mockResolvedValue([link()])
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

function page() {
  const cookie = fastify.signCookie(
    JSON.stringify({ id: 'u1', username: 'admin', role: 'admin', token: 'jwt' }),
  )
  return fastify.inject({ method: 'GET', url: '/connect-links', cookies: { session: cookie } })
}

describe('Journey: copying an active Connect link', () => {
  it('copies the resolved absolute URL', async () => {
    mockListConnectSessions.mockResolvedValue([
      link({ url: `https://acme.example/connect/${TOKEN}` }),
    ])
    const res = await page()
    expect(res.body).toContain(`data-url="https://acme.example/connect/${TOKEN}"`)
  })

  it('honours a tenant’s own domain, which the admin could never reconstruct', async () => {
    mockGetCompanyInfo.mockResolvedValue({ baseUrl: 'https://acme.example' })
    mockListConnectSessions.mockResolvedValue([
      link({ url: `https://links.customer.example/connect/${TOKEN}` }),
    ])
    const res = await page()
    expect(res.body).toContain(`data-url="https://links.customer.example/connect/${TOKEN}"`)
    expect(res.body).not.toContain(`data-url="https://acme.example/connect/${TOKEN}"`)
  })

  it('never emits the bare token path that was being copied', async () => {
    const res = await page()
    expect(res.body).not.toContain(`"/connect/${TOKEN}"`)
  })

  it('offers no Copy at all when the link has no address', async () => {
    // `data-url` is the row button's own marker — the layout carries a global
    // clipboard helper on every page, so asserting on `clipboard.writeText`
    // would pass for the wrong reason.
    const res = await page()
    expect(res.body).not.toContain('data-url=')
  })

  it('says why there is nothing to copy, rather than leaving a blank cell', async () => {
    const res = await page()
    expect(res.body).toContain('No public URL')
  })

  it('warns about the missing public URL when a live link has no address', async () => {
    const res = await page()
    expect(res.body).toContain("Set your deployment's public URL")
  })

  it('does not warn when every live link resolves, even with no companyInfo.baseUrl', async () => {
    // PUBLIC_BASE_URL on integration-server is the other way to configure this,
    // and the admin cannot see it — the resolved URLs are the evidence.
    mockListConnectSessions.mockResolvedValue([
      link({ url: `https://connect.acme.example/connect/${TOKEN}` }),
    ])
    const res = await page()
    expect(res.body).not.toContain("Set your deployment's public URL")
  })

  it('offers nothing to copy for a used link, which cannot be reopened', async () => {
    mockListConnectSessions.mockResolvedValue([
      link({ status: 'consumed', url: `https://acme.example/connect/${TOKEN}` }),
    ])
    const res = await page()
    expect(res.body).not.toContain('data-url=')
  })
})
