/**
 * The configure page only offers an integration guide that exists.
 *
 * `_credentials-form.ejs` renders its "Integration guide" card — a prominent,
 * book-icon call to action at the very top of the form, linking to
 * `docs-server/guides/integrate/<vertical>/<slug>.md` — only when `has_guide`
 * is true in the generated catalogue. Only 80 of the 1,545 platforms have that
 * file; accounting, CRM, logistics and projects have none at all. Rendering
 * the card unconditionally would point every platform in four whole verticals
 * — Fortnox, the accounting reference adapter, included — at a 404 while the
 * operator is mid-way through entering OAuth credentials.
 *
 * `has_guide` is the same flag the public Browse cards gate their "Guide" link
 * on, so the two surfaces agree about which platforms have one.
 */
import type { FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const getPlatformConfig = vi.fn()

vi.mock('../../src/core/proxy/admin-api-client', async () => {
  const { adminApiStub } = await import('../helpers/admin-api-stub')
  return {
    AdminApiClient: adminApiStub({
      getPlatformConfig,
      // The route 404s a slug the vertical does not know, so the stub has to
      // agree with the platforms each test asks for.
      listPlatforms: async (_token: string, vertical: string) =>
        (
          ({
            accounting: ['fortnox'],
            payments: ['stripe', 'paypal', 'not-a-real-platform'],
          })[vertical] ?? []
        ).map((slug) => ({ slug, enabled: true, hasConfig: true })),
      listConnections: async () => [],
      getCompanyInfo: async () => null,
      getLoginOptions: async () => ({ providers: [], localLoginEnabled: true }),
    }),
  }
})

const { buildServer } = await import('../../src/core/server')

const SESSION_SECRET = 'platform-guide-link-secret-long-enough-x'
let fastify: FastifyInstance

beforeEach(async () => {
  getPlatformConfig.mockReset().mockResolvedValue(null)
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

const configure = (vertical: string, slug: string) =>
  fastify.inject({
    method: 'GET',
    url: `/platforms/${vertical}/${slug}`,
    cookies: { session: session() },
  })

describe('a platform with no guide', () => {
  it('does not offer one for fortnox', async () => {
    // The concrete case: docs/integrate/accounting/fortnox.md does not exist,
    // and neither does any other accounting guide.
    const res = await configure('accounting', 'fortnox')
    expect(res.statusCode).toBe(200)
    expect(res.body).not.toContain('Integration guide')
    expect(res.body).not.toContain('/guides/integrate/accounting/fortnox.md')
  })

  it('still renders the credentials form it was sitting above', async () => {
    // Hiding the card must not take the form with it.
    const res = await configure('accounting', 'fortnox')
    expect(res.body).toContain('name="clientId"')
    expect(res.body).toContain('name="clientSecret"')
  })
})

describe('a platform that has one', () => {
  it('offers it for stripe, on the docs-server origin', async () => {
    // docs/integrate/payments/stripe.md exists. The link must carry the
    // configured docs-server URL — admin and docs-server are different origins.
    const res = await configure('payments', 'stripe')
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('Integration guide')
    expect(res.body).toContain('http://localhost:3003/guides/integrate/payments/stripe.md')
  })
})

describe('the catalogue is the authority, not the vertical', () => {
  it('offers nothing for a payments platform without a guide', async () => {
    // Not "payments has guides, so show one" — the flag is per platform.
    // paypal has one; a platform beside it in the same vertical may not.
    const withGuide = await configure('payments', 'paypal')
    const without = await configure('payments', 'not-a-real-platform')
    expect(withGuide.body).toContain('Integration guide')
    expect(without.body).not.toContain('Integration guide')
  })
})
