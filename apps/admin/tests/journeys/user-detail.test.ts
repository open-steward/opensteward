/**
 * Journey: an admin opens a user's detail page.
 *
 * Two things this page exists for. The uuid — otherwise only seen as an
 * unexplained value in the Settings break-glass field. And the IdP subject
 * each account maps to — usually a work email — which is hidden until asked
 * for, so that looking at it leaves a trace.
 */
import type { FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const USER_ID = 'usr_01HQ8ZKX7M2P4R6T8V0W'
const EXTERNAL_ID = 'olivia@northwind.example'

let account: Record<string, unknown> | null
const mockGetUser = vi.fn(async (_t: string, _id: string, opts?: { includeIdentity?: boolean }) => {
  if (!account) return null
  const links = (account.links as Array<Record<string, unknown>>) ?? []
  return {
    ...account,
    links: links.map((l) => ({ ...l, externalId: opts?.includeIdentity ? l.externalId : null })),
  }
})

vi.mock('../../src/core/proxy/admin-api-client', async () => {
  // `await import`: vi.mock is hoisted above this file's imports, but the
  // factory body runs later, so it can import what the top level cannot.
  const { adminApiStub } = await import('../helpers/admin-api-stub')
  return {
    AdminApiClient: adminApiStub({
      getUser: mockGetUser,
      listAudit: async () => {
        return {
          data: [
            { id: 1, action: 'user.login', targetId: null, createdAt: '2026-08-27T09:00:00.000Z' },
          ],
          meta: { page: 1, limit: 10, total: 1 },
        }
      },
      hasUsers: async () => {
        return true
      },
      getCompanyInfo: async () => {
        return null
      },
      getLoginOptions: async () => {
        return { providers: [], localLoginEnabled: true }
      },
      listUsers: async () => {
        return []
      },
    }),
  }
})

const { buildServer } = await import('../../src/core/server')

const SESSION_SECRET = 'admin-user-detail-secret-long-enough'
let fastify: FastifyInstance

function session(role = 'admin') {
  return fastify.signCookie(JSON.stringify({ id: 'u1', username: 'admin', role, token: 'jwt' }))
}

const open = (qs = '', role = 'admin') =>
  fastify.inject({
    method: 'GET',
    url: `/users/${USER_ID}${qs}`,
    cookies: { session: session(role) },
  })

beforeEach(async () => {
  account = {
    id: USER_ID,
    username: 'olivia',
    role: 'admin',
    createdAt: '2026-01-04T10:00:00.000Z',
    updatedAt: '2026-02-11T16:30:00.000Z',
    links: [
      {
        providerId: 'idp_okta',
        providerName: 'Okta',
        externalId: EXTERNAL_ID,
        lastLoginAt: '2026-08-27T09:14:00.000Z',
        scimManaged: true,
      },
    ],
    ssoOnly: true,
    isLocalAdmin: false,
    isPinnedBreakGlass: false,
  }
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

describe('Journey: an admin opens a user detail page', () => {
  it('shows the uuid, and makes it copyable', async () => {
    const res = await open()
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain(USER_ID)
    // The Settings break-glass box shows a bare uuid; this page is how you
    // find out whose it is.
    expect(res.body).toContain(`data-copy="${USER_ID}"`)
  })

  it('hides the IdP subject until it is asked for', async () => {
    const res = await open()
    expect(res.body).not.toContain(EXTERNAL_ID)
    expect(mockGetUser).toHaveBeenCalledWith('jwt', USER_ID, { includeIdentity: false })
    expect(res.body).toContain('Reveal')
  })

  it('shows it once revealed, and says it was recorded', async () => {
    const res = await open('?reveal=true')
    expect(res.body).toContain(EXTERNAL_ID)
    expect(mockGetUser).toHaveBeenCalledWith('jwt', USER_ID, { includeIdentity: true })
    // The reveal's whole purpose is the trail, so the page points at it.
    expect(res.body).toContain('audit log')
  })

  it('does not offer a reveal it cannot perform', async () => {
    // The customers page shows operators a Reveal link that always 403s and
    // costs them the whole page. /users is admin-only so this cannot happen
    // today; the guard keeps it true if that ever changes.
    const res = await open('', 'operator')
    expect(res.statusCode).toBe(403)
  })

  it('reads a local-password account as such', async () => {
    account = { ...account, links: [], ssoOnly: false, isLocalAdmin: true }
    const res = await open()
    expect(res.body).toContain('Local password')
    expect(res.body).toContain('No identity links')
  })

  it('warns when a pinned break-glass account cannot use a password', async () => {
    // Pinning an SSO-only account locks everyone out the moment local login is
    // disabled, and nothing else in the admin surfaces it.
    account = { ...account, isPinnedBreakGlass: true, isLocalAdmin: false }
    const res = await open()
    expect(res.body).toContain('pinned for break-glass but cannot use a password')
    expect(res.body).toContain('alert--danger')
  })

  it('does not warn when the pinned account is a local admin', async () => {
    account = {
      ...account,
      links: [],
      ssoOnly: false,
      isPinnedBreakGlass: true,
      isLocalAdmin: true,
    }
    const res = await open()
    expect(res.body).not.toContain('cannot use a password')
  })

  it('lists recent activity and links to the rest', async () => {
    const res = await open()
    expect(res.body).toContain('user.login')
    expect(res.body).toContain('/audit?user_id=olivia')
  })

  it('404s an unknown account without breaking the page', async () => {
    account = null
    const res = await open()
    expect(res.statusCode).toBe(404)
    expect(res.body).toContain('User not found')
    expect(res.body).toContain('Back to users')
  })

  it('keeps the Users nav entry marked', async () => {
    const res = await open()
    expect(res.body).toContain(
      '<a class="sidebar__link sidebar__link--active" aria-current="page" href="/users">',
    )
  })
})
