/**
 * What a viewer can and cannot do.
 *
 * The rule these tests hold the code to: a viewer reads everything and changes
 * nothing. Both halves matter — reads must be open to viewers (a nav link that
 * answers `{"error":"Forbidden — insufficient role"}` is raw JSON, no
 * navigation, no explanation), and every write must be independently gated,
 * because there is deliberately no plugin-wide role hook covering them.
 */
import type { FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createHmac } from 'crypto'

/**
 * Which upstream calls a page actually made. Used to prove the customer detail
 * page does NOT ask for the operator-only MCP-token list when a viewer opens
 * it — see the test at the bottom of this file.
 */
const calls = vi.hoisted(() => [] as string[])

vi.mock('../../src/core/proxy/admin-api-client', async () => {
  // `await import`: vi.mock is hoisted above this file's imports, but the
  // factory body runs later, so it can import what the top level cannot.
  const { adminApiStub } = await import('../helpers/admin-api-stub')
  const PAGE = { data: [], meta: { page: 1, limit: 50, total: 0 } }
  return {
    AdminApiClient: adminApiStub({
      getEndUser: async () => ({ id: 'cu-1', tenantId: 'default', email: 'a@b.co' }),
      getLoginOptions: async () => ({ providers: [], localLoginEnabled: true }),
      // Paged readers answer an envelope, not an array — the list default would
      // be the wrong shape and the pages would render against `undefined`.
      listEndUsersPaged: async () => PAGE,
      listSyncJobsPaged: async () => PAGE,
      listConnectionsPaged: async () => PAGE,
      // `get*` defaults to null, but this one is a list. Left explicit rather
      // than renamed, since the real client's name is what it is.
      getVerticals: async () => [],
      // Explicitly empty: this file's subject is what a viewer sees, not how
      // many tenants there are.
      listTenants: async () => [],
      // Writes have no default by design; this file needs them to succeed.
      acknowledgeNotification: async () => undefined,
      acknowledgeAll: async () => undefined,
      revokeConnectSession: async () => undefined,
      listEndUserTokens: async () => {
        // What admin-api really answers a viewer's JWT here: the route is
        // [authenticate, operatorOnly]. Recorded and thrown so a route that asks
        // as a viewer fails this file loudly instead of quietly 403ing in prod.
        calls.push('listEndUserTokens')
        throw Object.assign(new Error('Forbidden — insufficient role'), {
          isAxiosError: true,
          response: { status: 403, data: { error: 'Forbidden — insufficient role' } },
        })
      },
    }),
  }
})

const { buildServer } = await import('../../src/core/server')

const SESSION_SECRET = 'viewer-role-session-secret-long-enough'
let fastify: FastifyInstance

function session(role: 'viewer' | 'operator' | 'admin') {
  return fastify.signCookie(JSON.stringify({ id: 'u1', username: role, role, token: 'jwt' }))
}
function csrf(cookie: string) {
  return createHmac('sha256', SESSION_SECRET).update(cookie).digest('hex').slice(0, 32)
}
function get(url: string, role: 'viewer' | 'operator' | 'admin' = 'viewer') {
  return fastify.inject({ method: 'GET', url, cookies: { session: session(role) } })
}
function post(url: string, role: 'viewer' | 'operator' | 'admin' = 'viewer') {
  const c = session(role)
  return fastify.inject({
    method: 'POST',
    url,
    cookies: { session: c },
    payload: { _csrf: csrf(c) },
  })
}

beforeEach(async () => {
  calls.length = 0
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

/** Every page in the nav a viewer is offered. */
const READABLE = [
  '/',
  '/connections',
  '/notifications',
  '/connect-links',
  '/connect-link-templates',
  '/customers',
  '/sync-jobs',
  '/scope-groups',
  '/tenants',
]

describe('Journey: a viewer reads the admin', () => {
  for (const url of READABLE) {
    it(`can open ${url}`, async () => {
      const res = await get(url)
      expect(res.statusCode, `${url} refused a viewer`).toBe(200)
    })
  }

  it('opens a customer without asking for the operator-only MCP-token list', async () => {
    // admin-api gates GET /api/end-user-tokens behind `operatorOnly`, so a
    // viewer must not ask at all: a swallowed 403 (`.catch(() => [])`) would
    // hide a live token behind "no active tokens", and a propagated one loses
    // every viewer the whole page.
    const res = await get('/customers/cu-1')
    expect(res.statusCode, 'a viewer was refused a customer detail page').toBe(200)
    expect(calls).not.toContain('listEndUserTokens')
    // And the section must not claim there are none — it says why it is blank.
    expect(res.body).not.toContain('No active tokens for this customer.')
    expect(res.body).toContain('needs the operator role')
  })

  it('gets the data sub-routes the pages fetch, not a 403', async () => {
    // Client-side JS calls these; a 403 leaves the page half-rendered.
    expect((await get('/customers/search.json?q=ac')).statusCode).toBe(200)
  })
})

describe('Journey: a viewer changes nothing', () => {
  const WRITES = [
    '/connect-links',
    '/connect-links/abc/revoke',
    '/connect-link-templates',
    '/customers',
    '/sync-jobs/job_1/cancel',
    '/scope-groups',
    '/tenants',
    '/notifications/1/acknowledge',
    '/notifications/acknowledge-all',
    '/dashboard/tasks/dismiss',
    '/dashboard/tasks/undismiss',
    '/dashboard/setup/skip',
  ]
  for (const url of WRITES) {
    it(`is refused POST ${url}`, async () => {
      const res = await post(url)
      expect(res.statusCode, `${url} let a viewer write`).toBe(403)
    })
  }

  it('is refused the creation forms, which exist only to create', async () => {
    for (const url of ['/connect-links/new', '/customers/new', '/scope-groups/new']) {
      expect((await get(url)).statusCode, url).toBe(403)
    }
  })

  it('is told which role it needs, on a real page rather than raw JSON', async () => {
    const res = await get('/customers/new')
    expect(res.headers['content-type']).toContain('text/html')
    expect(res.body).toContain('operator')
    expect(res.body).not.toContain('{"error"')
  })

  it('sees no action buttons on the pages it can read', async () => {
    const body = (await get('/connect-links')).body
    expect(body).not.toContain('New link')
    expect(body).not.toContain('/revoke')
  })
})

describe('Journey: operators keep everything they had', () => {
  it('still sees the actions', async () => {
    const body = (await get('/connect-links', 'operator')).body
    expect(body).toContain('New link')
  })

  it('can still reach the creation forms', async () => {
    expect((await get('/customers/new', 'operator')).statusCode).toBe(200)
  })

  it('still asks for the MCP-token list, which only they may read', async () => {
    // The positive control for the viewer test above: the skip is scoped to
    // viewers, not a blanket removal of the call. The mock refuses everyone, so
    // an operator asking is visible as the recorded call plus the propagated
    // 403 — the failure staying visible is the property under test.
    const res = await get('/customers/cu-1', 'operator')
    expect(calls).toContain('listEndUserTokens')
    expect(res.statusCode).toBe(403)
  })
})
