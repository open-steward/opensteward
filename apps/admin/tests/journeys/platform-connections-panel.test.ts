/**
 * The "Active connections" panel on a platform's configuration page.
 *
 * The panel must share what the rest of the admin shares, not hand-roll its
 * own:
 *
 *   - Its links must carry both route params — the route is
 *     `/connections/:vertical/:id`, and a link built as `/connections/:id`
 *     404s while the same connection opens fine from the Connections tab.
 *   - Status must render through the shared `statusPill()` helper, which maps
 *     expired/platform_error to danger and expiring_soon to warning — a
 *     hardcoded `badge--success` shows an expired or errored connection as a
 *     green "healthy" pill.
 */
import type { FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { statusPill } from '../../src/core/views/helpers.js'

const CONNECTIONS = [
  {
    id: 'aaaaaaaa-1111-4aaa-8aaa-aaaaaaaaaaaa',
    vertical: 'accounting',
    platform: 'fortnox',
    status: 'expired',
    label: 'Acme books',
  },
  {
    id: 'bbbbbbbb-2222-4bbb-8bbb-bbbbbbbbbbbb',
    vertical: 'accounting',
    platform: 'fortnox',
    status: 'valid',
    label: null,
  },
]

vi.mock('../../src/core/proxy/admin-api-client', async () => {
  // `await import`: vi.mock is hoisted above this file's imports, but the
  // factory body runs later, so it can import what the top level cannot.
  const { adminApiStub } = await import('../helpers/admin-api-stub')
  return {
    AdminApiClient: adminApiStub({
      getLoginOptions: async () => {
        return { providers: [], localLoginEnabled: true }
      },
      listPlatforms: async () => {
        return [{ slug: 'fortnox', enabled: true, hasConfig: true }]
      },
      getPlatformConfig: async () => {
        return {
          clientId: 'abc',
          redirectUri: null,
          scopes: [],
          hasSecret: true,
          recommendedScopes: [],
          readScopes: null,
        }
      },
      listConnections: async () => {
        return CONNECTIONS
      },
      listScopeGroups: async () => {
        return []
      },
      getCompanyInfo: async () => {
        return null
      },
    }),
  }
})

const { buildServer } = await import('../../src/core/server')

const SESSION_SECRET = 'platform-connections-panel-secret-long'
let fastify: FastifyInstance

function session() {
  return fastify.signCookie(
    JSON.stringify({ id: 'u1', username: 'admin', role: 'admin', token: 'jwt' }),
  )
}

async function platformPage() {
  return fastify.inject({
    method: 'GET',
    url: '/platforms/accounting/fortnox',
    cookies: { session: session() },
  })
}

beforeEach(async () => {
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

describe('Journey: an admin views a platform with existing connections', () => {
  it('links each connection at the route that actually exists', async () => {
    const res = await platformPage()
    expect(res.body).toContain(`href="/connections/accounting/${CONNECTIONS[0]!.id}"`)
  })

  it('does not emit the vertical-less link that 404s', async () => {
    const res = await platformPage()
    expect(res.body).not.toContain(`href="/connections/${CONNECTIONS[0]!.id}"`)
  })

  it('renders status through the same helper as the Connections tab', async () => {
    const res = await platformPage()
    for (const c of CONNECTIONS) expect(res.body).toContain(statusPill(c.status))
  })

  it('never shows an expired connection as healthy', async () => {
    const res = await platformPage()
    // A hardcoded badge--success would paint an expired connection healthy.
    const panel = res.body.slice(res.body.indexOf('Active connections'))
    const upToNextCard = panel.slice(0, panel.indexOf('</section>') + 1 || panel.length)
    expect(upToNextCard).not.toMatch(
      /badge--success[^>]*>\s*<span class="badge__dot"><\/span>expired/,
    )
  })
})
