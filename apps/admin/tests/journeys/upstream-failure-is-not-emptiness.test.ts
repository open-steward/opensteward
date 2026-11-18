/**
 * An admin-api that is down must never render as "there is nothing here".
 *
 * The failure class has one shape: a catch turns a failed upstream call into
 * the value that means the opposite fact, and the operator reads that value
 * as truth.
 *
 *   - a `rotateWebhookSubSecret` that swallows a 415 leaves only the sentence
 *     "Failed to rotate secret." — which names no cause at all.
 *   - a `getApiKey` that catches and returns null renders as "key not found"
 *     — an unreachable admin-api telling the operator their key has been
 *     deleted.
 *   - a refresh worker that maps an OAuth error to a status drops the error.
 *
 * Every case below is the same question asked of one page: if admin-api were
 * down right now, what would this page tell the operator? The answer must
 * never be "it does not exist", "there are none", or a redirect that reads as
 * success. Each `describe` pairs the outage case with the genuine-absence case,
 * because the requirement is to keep the two distinguishable — not to stop saying
 * "not found" at all.
 */
import type { FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { LightMyRequestResponse } from 'light-my-request'
import { flashOf } from '../helpers/flash'
import { createHmac } from 'crypto'

/** Every admin-api method these pages touch, as one mock surface. */
const m = {
  getConnection: vi.fn(),
  deleteConnection: vi.fn(),
  listConnections: vi.fn(),
  getSyncJob: vi.fn(),
  cancelSyncJob: vi.fn(),
  getEndUser: vi.fn(),
  listEndUserTokens: vi.fn(),
  revokeEndUserToken: vi.fn(),
  listScopeGroups: vi.fn(),
  deleteScopeGroup: vi.fn(),
  listCatalog: vi.fn(),
  listConnectLinkTemplates: vi.fn(),
  getConnectLinkTemplate: vi.fn(),
  deleteConnectLinkTemplate: vi.fn(),
  listTenants: vi.fn(),
  listTenantDomains: vi.fn(),
  listPlatforms: vi.fn(),
  getPlatformConfig: vi.fn(),
  revokeApiKey: vi.fn(),
  listApiKeys: vi.fn(),
  listWebhookSubs: vi.fn(),
  rotateWebhookSubSecret: vi.fn(),
  deleteWebhookSub: vi.fn(),
  pauseWebhookSub: vi.fn(),
  replayWebhookDelivery: vi.fn(),
  deleteUser: vi.fn(),
  listUsers: vi.fn(),
  getIdentityProvider: vi.fn(),
  updateIdentityProvider: vi.fn(),
  createRoleMapping: vi.fn(),
  revokeScimToken: vi.fn(),
  listRoleMappings: vi.fn(),
  listScimTokens: vi.fn(),
  getCompanyInfo: vi.fn(),
  dismissDashboardTasks: vi.fn(),
  undismissDashboardTask: vi.fn(),
}

vi.mock('../../src/core/proxy/admin-api-client', async () => {
  // `await import`: vi.mock is hoisted above this file's imports, but the
  // factory body runs later, so it can import what the top level cannot.
  const { adminApiStub } = await import('../helpers/admin-api-stub')
  // Spread rather than assigned in a constructor: `m` is already the set of
  // spies this file asserts on, and overrides take exactly that shape.
  return {
    AdminApiClient: adminApiStub({
      ...m,
      getLoginOptions: async () => ({ providers: [], localLoginEnabled: true }),
    }),
  }
})

const { buildServer } = await import('../../src/core/server')

const SESSION_SECRET = 'upstream-failure-is-not-emptiness-secret-long-enough'
let fastify: FastifyInstance

/**
 * What axios throws when admin-api answers but refuses, and what it throws
 * when admin-api is not listening at all. Both must stay distinct from 404.
 */
function upstream(status: number, message: string): Error {
  return Object.assign(new Error(message), {
    name: 'AxiosError',
    isAxiosError: true,
    response: { status, data: { error: message } },
  })
}
const UNREACHABLE = new Error('connect ECONNREFUSED admin-api:3001')

function session(role: 'viewer' | 'operator' | 'admin' = 'admin') {
  return fastify.signCookie(JSON.stringify({ id: 'u1', username: role, role, token: 'jwt' }))
}
function get(url: string) {
  return fastify.inject({ method: 'GET', url, cookies: { session: session() } })
}
function post(url: string, body: Record<string, string> = {}) {
  const c = session()
  const _csrf = createHmac('sha256', SESSION_SECRET).update(c).digest('hex').slice(0, 32)
  return fastify.inject({
    method: 'POST',
    url,
    cookies: { session: c },
    payload: { _csrf, ...body },
  })
}

/**
 * A write that failed upstream must not answer with the redirect that means
 * "done". Either an error page (propagated) or the form re-rendered with the
 * reason is fine; the 302 to the happy path is not.
 */
function expectNotSilentSuccess(res: LightMyRequestResponse) {
  expect(res.statusCode).not.toBe(302)
  // Nor may it queue a message that says it worked. Folded in here rather than
  // asserted at the two delete call sites, so every caller of this helper gains
  // the guard — the invariant gets wider in translation, not narrower.
  expect(flashOf(fastify, res).some((f) => f.tone === 'success')).toBe(false)
}

beforeEach(async () => {
  for (const fn of Object.values(m)) fn.mockReset()
  // Defaults: everything upstream is healthy and empty unless a test says otherwise.
  m.listConnections.mockResolvedValue([])
  m.listScopeGroups.mockResolvedValue([])
  m.listCatalog.mockResolvedValue([])
  m.listConnectLinkTemplates.mockResolvedValue([])
  m.listTenants.mockResolvedValue([])
  m.listTenantDomains.mockResolvedValue([])
  m.listPlatforms.mockResolvedValue([{ slug: 'fortnox', enabled: true, hasConfig: true }])
  m.getPlatformConfig.mockResolvedValue(null)
  m.listApiKeys.mockResolvedValue([])
  m.listWebhookSubs.mockResolvedValue([])
  m.listUsers.mockResolvedValue([])
  m.listRoleMappings.mockResolvedValue([])
  m.listScimTokens.mockResolvedValue([])
  m.listEndUserTokens.mockResolvedValue([])
  m.getCompanyInfo.mockResolvedValue(null)

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

describe('Journey: a detail page that cannot reach admin-api', () => {
  it('does not tell the operator the connection does not exist', async () => {
    m.getConnection.mockRejectedValue(UNREACHABLE)
    const res = await get('/connections/accounting/c-1')
    expect(res.body).not.toContain('does not exist')
    expect(res.statusCode).toBeGreaterThanOrEqual(500)
  })

  it('still says the connection does not exist when the client reports it absent', async () => {
    m.getConnection.mockResolvedValue(null)
    const res = await get('/connections/accounting/c-1')
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('does not exist')
  })

  it('does not tell the operator the sync job was pruned', async () => {
    // The 404 copy explains jobs are pruned past the retention window. Printing
    // that during an outage sends the operator looking for a retention setting.
    m.getSyncJob.mockRejectedValue(upstream(503, 'Service Unavailable'))
    const res = await get('/sync-jobs/job-1')
    expect(res.body).not.toContain('Sync job not found')
    expect(res.statusCode).toBe(503)
  })

  it('still says the sync job is missing when the client reports it absent', async () => {
    m.getSyncJob.mockResolvedValue(null)
    const res = await get('/sync-jobs/job-1')
    expect(res.statusCode).toBe(404)
    expect(res.body).toContain('Sync job not found')
  })

  it('does not tell the operator the customer does not exist', async () => {
    m.getEndUser.mockRejectedValue(UNREACHABLE)
    const res = await get('/customers/cu-1')
    expect(res.body).not.toContain('Customer not found')
    expect(res.statusCode).toBeGreaterThanOrEqual(500)
  })

  it('still 404s a customer the client reports absent', async () => {
    m.getEndUser.mockResolvedValue(null)
    const res = await get('/customers/cu-1')
    expect(res.statusCode).toBe(404)
  })

  it('does not tell the operator the platform is unknown', async () => {
    m.listPlatforms.mockRejectedValue(upstream(502, 'Bad Gateway'))
    const res = await get('/platforms/accounting/fortnox')
    expect(res.body).not.toContain('Unknown platform')
    expect(res.statusCode).toBe(502)
  })

  it('does not silently bounce the operator back off an identity provider', async () => {
    // The redirect-to-list on a null provider is indistinguishable from a click
    // that did nothing, and says nothing about why.
    m.getIdentityProvider.mockRejectedValue(UNREACHABLE)
    const res = await get('/identity-providers/idp-1')
    expect(String(res.headers.location ?? '')).not.toBe('/identity-providers')
    expect(res.statusCode).toBeGreaterThanOrEqual(500)
  })

  it('does not tell the operator the scope group is not there', async () => {
    m.listScopeGroups.mockRejectedValue(UNREACHABLE)
    const res = await get('/scope-groups/1/edit')
    expect(res.body).not.toContain('Scope group not found')
    expect(res.statusCode).toBeGreaterThanOrEqual(500)
  })

  it('does not tell the operator the connect-link template is not there', async () => {
    m.getConnectLinkTemplate.mockRejectedValue(UNREACHABLE)
    const res = await get('/connect-link-templates/1/edit')
    expect(res.body).not.toContain('Template not found')
    expect(res.statusCode).toBeGreaterThanOrEqual(500)
  })

  it('still 404s a connect-link template the client reports absent', async () => {
    m.getConnectLinkTemplate.mockResolvedValue(null)
    const res = await get('/connect-link-templates/1/edit')
    expect(res.statusCode).toBe(404)
  })
})

describe('Journey: a list page that cannot reach admin-api', () => {
  it('does not render an empty scope-groups list as though there were none', async () => {
    m.listScopeGroups.mockRejectedValue(UNREACHABLE)
    const res = await get('/scope-groups')
    expect(res.statusCode).toBeGreaterThanOrEqual(500)
  })

  it('does not render an empty connect-link-template list as though there were none', async () => {
    m.listConnectLinkTemplates.mockRejectedValue(UNREACHABLE)
    const res = await get('/connect-link-templates')
    expect(res.statusCode).toBeGreaterThanOrEqual(500)
  })

  it('does not render an empty tenant list as though there were none', async () => {
    m.listTenants.mockRejectedValue(UNREACHABLE)
    const res = await get('/tenants')
    expect(res.statusCode).toBeGreaterThanOrEqual(500)
  })

  it('does not tell the operator a customer has no MCP tokens', async () => {
    // A live token that renders as absent cannot be revoked, and reads as
    // proof the customer was never issued one.
    m.getEndUser.mockResolvedValue({ id: 'cu-1', tenantId: 'acme', email: 'a@b.co' })
    m.listEndUserTokens.mockRejectedValue(UNREACHABLE)
    const res = await get('/customers/cu-1')
    expect(res.statusCode).toBeGreaterThanOrEqual(500)
  })

  it('still renders the healthy empty list as empty', async () => {
    const res = await get('/scope-groups')
    expect(res.statusCode).toBe(200)
  })
})

describe('Journey: a write that failed upstream must not look like it worked', () => {
  it('does not report a scope group deleted when the delete failed', async () => {
    m.deleteScopeGroup.mockRejectedValue(upstream(500, 'boom'))
    const res = await post('/scope-groups/1/delete')
    expect(flashOf(fastify, res).some((f) => f.tone === 'success')).toBe(false)
    expectNotSilentSuccess(res)
  })

  it('does not report a connect-link template deleted when the delete failed', async () => {
    m.deleteConnectLinkTemplate.mockRejectedValue(upstream(500, 'boom'))
    const res = await post('/connect-link-templates/1/delete')
    expect(flashOf(fastify, res).some((f) => f.tone === 'success')).toBe(false)
    expectNotSilentSuccess(res)
  })

  it('does not silently drop a failed API-key revoke', async () => {
    // A key the operator believes is revoked and is not is a live credential.
    m.revokeApiKey.mockRejectedValue(upstream(500, 'boom'))
    const res = await post('/api-keys/key-1/revoke')
    expectNotSilentSuccess(res)
    expect(res.statusCode).toBeGreaterThanOrEqual(400)
  })

  it('names the cause when rotating a webhook secret fails', async () => {
    // A swallowed 415 here reads as "Failed to rotate secret." with no cause
    // named.
    m.rotateWebhookSubSecret.mockRejectedValue(upstream(415, 'Unsupported Media Type'))
    const res = await post('/webhooks/w-1/rotate-secret')
    expect(res.body).toContain('Unsupported Media Type')
  })

  it('does not silently drop a failed webhook delete', async () => {
    m.deleteWebhookSub.mockRejectedValue(upstream(500, 'boom'))
    const res = await post('/webhooks/w-1/delete')
    expectNotSilentSuccess(res)
  })

  it('does not silently drop a failed webhook pause', async () => {
    // A subscription the operator believes is paused and is not keeps
    // delivering to an endpoint they were trying to protect.
    m.pauseWebhookSub.mockRejectedValue(upstream(500, 'boom'))
    const res = await post('/webhooks/w-1/pause')
    expectNotSilentSuccess(res)
  })

  it('does not silently drop a failed delivery replay', async () => {
    m.replayWebhookDelivery.mockRejectedValue(upstream(500, 'boom'))
    const res = await post('/webhooks/w-1/deliveries/d-1/replay')
    expectNotSilentSuccess(res)
  })

  it('does not silently drop a failed user delete', async () => {
    m.deleteUser.mockRejectedValue(upstream(400, 'Cannot delete your own account'))
    const res = await post('/users/u-2/delete')
    expectNotSilentSuccess(res)
    expect(res.body).toContain('Cannot delete your own account')
  })

  it('does not silently drop a failed connection delete', async () => {
    m.deleteConnection.mockRejectedValue(upstream(500, 'boom'))
    const res = await post('/connections/accounting/c-1/delete')
    expectNotSilentSuccess(res)
  })

  it('does not report a dashboard task cleared when the clear failed', async () => {
    // A row that reads as cleared and is not comes back on the next load
    // with nothing saying why — the operator clears it again, and again.
    m.listConnections.mockResolvedValue([
      {
        id: 'c-1',
        vertical: 'accounting',
        platform: 'fortnox',
        tenantId: null,
        label: null,
        status: 'expired',
        expiresAt: '2026-09-01T00:00:00.000Z',
        createdAt: '2026-08-01T00:00:00.000Z',
        updatedAt: '2026-08-01T00:00:00.000Z',
      },
    ])
    m.dismissDashboardTasks.mockRejectedValue(upstream(500, 'boom'))
    const res = await post('/dashboard/tasks/dismiss', {
      items: JSON.stringify([{ key: 'conn:expired:c-1' }]),
    })
    expectNotSilentSuccess(res)
  })

  it('does not report a dashboard task restored when the undo failed', async () => {
    m.undismissDashboardTask.mockRejectedValue(upstream(500, 'boom'))
    const res = await post('/dashboard/tasks/undismiss', { key: 'conn:expired:c-1' })
    expectNotSilentSuccess(res)
  })

  it('does not silently drop a failed sync-job cancel', async () => {
    m.cancelSyncJob.mockRejectedValue(upstream(500, 'boom'))
    const res = await post('/sync-jobs/job-1/cancel')
    expectNotSilentSuccess(res)
  })

  it('does not silently drop a failed MCP-token revoke', async () => {
    m.revokeEndUserToken.mockRejectedValue(upstream(500, 'boom'))
    const res = await post('/customers/cu-1/mcp-tokens/t-1/revoke')
    expectNotSilentSuccess(res)
  })

  it('does not silently drop a failed identity-provider update', async () => {
    m.getIdentityProvider.mockResolvedValue({ id: 'idp-1', protocol: 'oidc', slug: 'okta' })
    m.updateIdentityProvider.mockRejectedValue(upstream(400, 'issuer is required'))
    const res = await post('/identity-providers/idp-1', { name: 'Okta' })
    expectNotSilentSuccess(res)
    expect(res.body).toContain('issuer is required')
  })

  it('does not silently drop a failed role-mapping create', async () => {
    // A rule that maps an IdP group to `admin` and never landed is a
    // permissions gap the operator believes they closed.
    m.createRoleMapping.mockRejectedValue(upstream(400, 'claimPath is required'))
    const res = await post('/identity-providers/idp-1/role-mappings', {
      claimPath: 'groups',
      matchType: 'equals',
      matchValue: 'eng',
      role: 'admin',
    })
    expectNotSilentSuccess(res)
  })

  it('does not silently drop a failed SCIM-token revoke', async () => {
    m.revokeScimToken.mockRejectedValue(upstream(500, 'boom'))
    const res = await post('/identity-providers/idp-1/scim-tokens/t-1/delete')
    expectNotSilentSuccess(res)
  })
})
