/**
 * Every picker must offer every option it claims to.
 *
 * A live sweep found the api-keys tenant defect in two more views. Both are a
 * text `<input>` bound to a `<datalist>` and rendered with a value already in
 * it, so the browser filters the suggestions down to the one already chosen:
 *
 *   connect-link-templates/edit.ejs  tenantId — pre-filled in EVERY path
 *     (create renders 'default', edit renders the stored tenant), so it fails
 *     in both directions: 'default' hides the others on create, and a template
 *     on 'dept-a' cannot be moved back to 'default' on edit.
 *
 *   audit.ejs  action — empty on a fresh load, which is why it looked clean.
 *     It echoes the active filter back, so every OTHER action vanished the
 *     moment an operator filtered by anything. The control worked only on the
 *     one render where it was not needed.
 *
 * Asserted through `offeredOptions`, which models the browser's filtering rule.
 * `expect(body).toContain('name="tenantId"')` — the assertion these pages had —
 * passes just as happily against a control offering exactly one option.
 */
import type { FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createHmac } from 'crypto'
import { offeredOptions } from '../helpers/offered-options'

const mockListTenants = vi.fn()
const mockListAuditLog = vi.fn()
const mockListAuditActions = vi.fn()
const mockGetConnectLinkTemplate = vi.fn()

vi.mock('../../src/core/proxy/admin-api-client', async () => {
  const { adminApiStub } = await import('../helpers/admin-api-stub')
  return {
    AdminApiClient: adminApiStub({
      listTenants: mockListTenants,
      listAuditLog: mockListAuditLog,
      listAuditActions: mockListAuditActions,
      getConnectLinkTemplate: mockGetConnectLinkTemplate,
      getLoginOptions: async () => ({ providers: [], localLoginEnabled: true }),
      getCompanyInfo: async () => null,
      listScopeGroups: async () => [],
      listPlatforms: async () => [{ slug: 'xero', enabled: true, hasConfig: true }],
      getVerticals: async () => [{ name: 'accounting' }],
      listConnectLinkTemplates: async () => [],
    }),
  }
})

const { buildServer } = await import('../../src/core/server')

const SESSION_SECRET = 'picker-offers-every-option-secret-long-enough'
const TENANTS = [
  { id: 'default', name: 'Default' },
  { id: 'dept-a', name: 'Department A' },
  { id: 'claims-no', name: 'Claims Norway' },
]
const ACTIONS = ['user.login', 'connection.delete', 'api_key.mint']

let fastify: FastifyInstance

function cookie(role = 'admin') {
  return fastify.signCookie(JSON.stringify({ id: 'u1', username: 'admin', role, token: 'jwt' }))
}
function get(url: string) {
  return fastify.inject({ method: 'GET', url, cookies: { session: cookie() } })
}
function csrf(c: string) {
  return createHmac('sha256', SESSION_SECRET).update(c).digest('hex').slice(0, 32)
}

beforeEach(async () => {
  mockListTenants.mockReset().mockResolvedValue(TENANTS)
  mockListAuditActions.mockReset().mockResolvedValue(ACTIONS)
  mockListAuditLog.mockReset().mockResolvedValue({ data: [], meta: { page: 1, limit: 50, total: 0 } })
  mockGetConnectLinkTemplate.mockReset().mockResolvedValue({
    id: 7,
    name: 'Onboarding',
    tenantId: 'dept-a',
    linkMode: 'pinned',
    allowedVerticals: ['accounting'],
    allowedPlatforms: [{ vertical: 'accounting', slug: 'xero' }],
  })
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

describe('Connect-link-template tenant picker', () => {
  it('offers every tenant when creating, not just the pre-filled default', async () => {
    const res = await get('/connect-link-templates/new')
    expect(offeredOptions(res.body, 'tenantId').sort()).toEqual(
      ['claims-no', 'default', 'dept-a'].sort(),
    )
  })

  it('offers every tenant when editing a template already on another one', async () => {
    // The reverse direction: a template on 'dept-a' could not be moved back.
    const res = await get('/connect-link-templates/7/edit')
    expect(offeredOptions(res.body, 'tenantId')).toContain('default')
    expect(offeredOptions(res.body, 'tenantId')).toContain('claims-no')
  })

  it('marks the template’s current tenant as the selected one', async () => {
    const res = await get('/connect-link-templates/7/edit')
    expect(res.body).toMatch(/<option value="dept-a"[^>]*selected/)
  })

  it('keeps a tenant that no longer exists selectable rather than re-scoping silently', async () => {
    mockGetConnectLinkTemplate.mockResolvedValue({
      id: 7,
      name: 'Onboarding',
      tenantId: 'deleted-tenant',
      linkMode: 'pinned',
      allowedVerticals: ['accounting'],
      allowedPlatforms: [{ vertical: 'accounting', slug: 'xero' }],
    })
    const res = await get('/connect-link-templates/7/edit')
    expect(offeredOptions(res.body, 'tenantId')).toContain('deleted-tenant')
  })

  it('still offers a way to set the tenant when admin-api cannot list them', async () => {
    // Without a fallback the control vanishes and the template is silently
    // scoped to 'default' — the upstream-failure-is-not-emptiness class.
    mockListTenants.mockRejectedValue(new Error('ECONNREFUSED'))
    const res = await get('/connect-link-templates/new')
    expect(res.body).toContain('name="tenantId"')
  })
})

/**
 * The control moved into the shared per-column filter row (_table-head.ejs)
 * and is now named `f_action` rather than `action` — the one-name-per-column
 * contract every converted table shares. The URLs below deliberately keep the
 * OLD `?action=` spelling: it is the `legacy` alias on that column
 * (routes/audit.ts), it is still linked from views/users/detail.ejs, and a
 * bookmark carrying it must keep narrowing exactly as it did.
 */
describe('Audit action filter', () => {
  it('offers every known action on a fresh load', async () => {
    const res = await get('/audit')
    for (const a of ACTIONS) expect(offeredOptions(res.body, 'f_action')).toContain(a)
  })

  it('still offers the others once a filter is active', async () => {
    // The defect: with 'user.login' in the box, the other two vanished, so the
    // filter could never be changed — only cleared.
    const res = await get('/audit?action=user.login')
    expect(offeredOptions(res.body, 'f_action')).toContain('connection.delete')
    expect(offeredOptions(res.body, 'f_action')).toContain('api_key.mint')
  })

  it('keeps the active filter selected', async () => {
    const res = await get('/audit?action=user.login')
    expect(res.body).toMatch(/<option value="user\.login"[^>]*selected/)
  })

  it('offers a way back to unfiltered', async () => {
    const res = await get('/audit?action=user.login')
    expect(offeredOptions(res.body, 'f_action')).toContain('')
  })

  it('keeps a retired action selectable rather than resetting the view', async () => {
    const res = await get('/audit?action=legacy.action')
    expect(offeredOptions(res.body, 'f_action')).toContain('legacy.action')
  })
})
