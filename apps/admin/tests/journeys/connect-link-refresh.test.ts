/**
 * Minting a Connect Link has to survive a refresh.
 *
 * The mint used to answer the POST by rendering the list, so the browser's
 * current URL stayed on the POST: F5 offered "Confirm Form Resubmission", and
 * an OK re-ran the mint and issued a second live link. POST-Redirect-GET is
 * what makes the reload a plain GET.
 *
 * The reason that render existed still holds, and is the other half of this
 * file. The link embeds a connect token — a live credential — and `req.url` is
 * logged unredacted, so the redirect may carry only the session id (a
 * randomUUID that authenticates nothing; `/connect/:token` is what the
 * customer's link is keyed on) and never the token itself. See
 * `connect-link-url.test.ts` for the invariant this must not undo.
 */
import type { FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const TOKEN = 'abc123'
const LINK_URL = `https://acme.example/connect/${TOKEN}`

const mockCreateConnectSession = vi.fn()
const mockGetConnectSession = vi.fn()

vi.mock('../../src/core/proxy/admin-api-client', async () => {
  // `await import`: vi.mock is hoisted above this file's imports, but the
  // factory body runs later, so it can import what the top level cannot.
  const { adminApiStub } = await import('../helpers/admin-api-stub')
  return {
    AdminApiClient: adminApiStub({
      createConnectSession: mockCreateConnectSession,
      getConnectSession: mockGetConnectSession,
      getLoginOptions: async () => {
        return { providers: [], localLoginEnabled: true }
      },
      getCompanyInfo: async () => {
        return null
      },
      listConnectSessions: async () => {
        return [
          {
            id: 's1',
            token: TOKEN,
            status: 'active',
            tenantId: 'default',
            label: 'Acme',
            allowedPlatforms: [],
            allowedVerticals: [],
            createdAt: '2026-08-20T09:00:00Z',
            expiresAt: null,
            url: LINK_URL,
          },
        ]
      },
      listConnectLinkTemplates: async () => {
        return []
      },
      listScopeGroups: async () => {
        return []
      },
      listEndUsers: async () => {
        return []
      },
    }),
  }
})

const { buildServer } = await import('../../src/core/server')

const SESSION_SECRET = 'connect-link-refresh-session-secret-long-enough'
let fastify: FastifyInstance

function session() {
  return fastify.signCookie(
    JSON.stringify({ id: 'u1', username: 'admin', role: 'admin', token: 'jwt' }),
  )
}

/** POST the mint form, exactly as the browser does. */
async function mint() {
  const cookie = session()
  const { generateCsrfToken } = await import('../../src/core/auth/csrf')
  return fastify.inject({
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
}

const get = (url: string) => fastify.inject({ method: 'GET', url, cookies: { session: session() } })

beforeEach(async () => {
  mockCreateConnectSession.mockResolvedValue({ id: 's1', token: TOKEN, url: LINK_URL })
  mockGetConnectSession.mockResolvedValue({ id: 's1', token: TOKEN, url: LINK_URL })
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

describe('Journey: refreshing the page after minting a Connect Link', () => {
  it('answers the mint with a redirect, so the browser lands on a GET', async () => {
    const res = await mint()
    // Rendering the POST leaves the address bar on the POST — the reload then
    // re-submits the form and mints a second live link.
    expect(res.statusCode).toBe(302)
    expect(String(res.headers.location ?? '')).toMatch(/^\/connect-links(\?|$)/)
  })

  it('carries the session id and never the token in the redirect', async () => {
    const res = await mint()
    const location = String(res.headers.location ?? '')
    // `req.url` is logged unredacted, so anything here reaches stdout and
    // browser history. The id is a lookup key; the token is a credential.
    expect(location).not.toContain(TOKEN)
    expect(decodeURIComponent(location)).not.toContain(TOKEN)
    // `?link=` names a row to spotlight, like `?customer=` on the new-link
    // form. Not `?created=`, which `one-feedback-mechanism.test.ts` bans: a
    // message key in a URL replays on Back for something that did not just
    // happen.
    expect(location).toMatch(/^\/connect-links\?link=s1$/)
  })

  it('still shows the link to copy on the page it redirects to', async () => {
    const location = String((await mint()).headers.location ?? '')
    const page = await get(location)
    expect(page.statusCode).toBe(200)
    expect(page.body).toContain(LINK_URL)
  })

  it('mints nothing when that page is reloaded', async () => {
    const location = String((await mint()).headers.location ?? '')
    await get(location)
    await get(location)
    // The whole point: the reload is a read.
    expect(mockCreateConnectSession).toHaveBeenCalledTimes(1)
  })
})
