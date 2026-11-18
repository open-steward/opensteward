/**
 * The optional Tenants step, and the tenant a key is minted into.
 *
 * Two things are load-bearing here.
 *
 * The step renders the same partial `/tenants` does, and its forms post to the
 * same routes — there are deliberately no wizard copies. What tells the routes
 * where to send the operator back to is a `returnTo` *token*, never a path: a
 * redirect target taken from a form body is an open redirect, so the body may
 * only choose between two of our own pages.
 *
 * And the step must never become a resume target. One team running the whole
 * deployment never needs a second tenant, so this can never go done for them —
 * a step that cannot complete and is not skipped traps the resume logic.
 */
import type { FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flashOf } from '../helpers/flash'

const mockListTenants = vi.fn()
const mockListTenantDomains = vi.fn()
const mockCreateTenant = vi.fn()
const mockMintApiKey = vi.fn()

const DEFAULT_ONLY = [{ id: 'default', name: 'Default' }]
const TWO = [
  { id: 'default', name: 'Default' },
  { id: 'dept-a', name: 'Department A' },
]

vi.mock('../../src/core/proxy/admin-api-client', async () => {
  // `await import`: vi.mock is hoisted above this file's imports, but the
  // factory body runs later, so it can import what the top level cannot.
  const { adminApiStub } = await import('../helpers/admin-api-stub')
  return {
    AdminApiClient: adminApiStub({
      listTenants: mockListTenants,
      listTenantDomains: mockListTenantDomains,
      createTenant: mockCreateTenant,
      mintApiKey: mockMintApiKey,
      getCompanyInfo: async () => {
        return { name: 'ACME' }
      },
      getVerticals: async () => {
        return [{ name: 'accounting', status: 'up', adapterCount: 1 }]
      },
      listAllPlatformRows: async () => {
        return [{ vertical: 'accounting', slug: 'fortnox', enabled: true, hasConfig: true }]
      },
      listApiKeys: async () => {
        return []
      },
      listWebhookSubs: async () => {
        return []
      },
      listConnections: async () => {
        return []
      },
      getLoginOptions: async () => {
        return { providers: [], localLoginEnabled: true }
      },
      getDataStoreMetrics: async () => {
        return {
          mode: 'database',
          rows: { total: 0 },
          db_size_mb: 0,
          sync_jobs: { pending: 0, running: 0 },
        }
      },
      listRuntimeSettings: async () => {
        return []
      },
      getActiveLogoFetch: async () => {
        return null
      },
      getLogoStatus: async () => {
        return { count: 0, totalBytes: 0, lastFetchedAt: null }
      },
    }),
  }
})

const { buildServer } = await import('../../src/core/server')
const { computeWizardProgress } = await import('../../src/core/routes/wizard-progress')

const SESSION_SECRET = 'admin-wizard-tenants-secret-long-enough'
let fastify: FastifyInstance

beforeEach(async () => {
  mockListTenants.mockReset().mockResolvedValue(DEFAULT_ONLY)
  mockListTenantDomains.mockReset().mockResolvedValue([])
  mockCreateTenant.mockReset().mockResolvedValue({ id: 'dept-a', name: 'Department A' })
  mockMintApiKey.mockReset().mockResolvedValue({
    id: 'key_1',
    tenantId: 'default',
    label: 'l',
    scopes: [],
    plaintext: 'osk_x',
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

function session(role = 'admin') {
  return fastify.signCookie(JSON.stringify({ id: 'u1', username: 'admin', role, token: 'jwt' }))
}

const get = (url: string, role = 'admin') =>
  fastify.inject({ method: 'GET', url, cookies: { session: session(role) } })

/** Post with a CSRF token read from a real render, as the browser would. */
async function post(url: string, payload: Record<string, string>, from = '/setup/wizard/tenants') {
  const cookies = { session: session() }
  const page = await fastify.inject({ method: 'GET', url: from, cookies })
  const token = /name="_csrf" value="([^"]+)"/.exec(page.body)?.[1] ?? ''
  return fastify.inject({ method: 'POST', url, cookies, payload: { _csrf: token, ...payload } })
}

describe('the optional Tenants step', () => {
  it('renders, and frames the decision before the forms', async () => {
    const res = await get('/setup/wizard/tenants')
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('Step 6 of 8')
    // The operator has to be able to tell whether this applies to them.
    expect(res.body).toContain('Do you need this?')
    expect(res.body).toContain('Skip for now')
  })

  it('renders the same partial the standalone page does', async () => {
    // Both surfaces, one implementation — so a change to either follows.
    const wizard = (await get('/setup/wizard/tenants')).body
    const standalone = (await get('/tenants')).body
    for (const marker of ['New tenant', 'Attach a custom domain', 'action="/tenants"']) {
      expect(wizard).toContain(marker)
      expect(standalone).toContain(marker)
    }
  })

  it('marks its forms as coming from the wizard', async () => {
    const res = await get('/setup/wizard/tenants')
    expect(res.body).toContain('name="returnTo" value="wizard"')
  })

  it('leaves the standalone page unmarked', async () => {
    const res = await get('/tenants')
    expect(res.body).not.toContain('name="returnTo"')
  })

  describe('where a create sends you back to', () => {
    it('returns to the wizard step when the form came from it', async () => {
      const res = await post('/tenants', { name: 'Department A', returnTo: 'wizard' })
      expect(res.statusCode).toBe(302)
      expect(res.headers.location).toBe('/setup/wizard/tenants')
    })

    it('returns to /tenants when it did not', async () => {
      const res = await post('/tenants', { name: 'Department A' }, '/tenants')
      expect(res.statusCode).toBe(302)
      expect(res.headers.location).toBe('/tenants')
    })

    it('cannot be pointed anywhere else', async () => {
      // The reason returnTo is a token and not a path. A body-supplied URL
      // would make every one of these routes an open redirect.
      for (const evil of ['https://evil.example/x', '//evil.example', '/settings']) {
        const res = await post('/tenants', { name: 'X', returnTo: evil })
        expect(res.headers.location).toBe('/tenants')
      }
    })
  })

  it('never becomes a resume target on a single-tenant deployment', async () => {
    // `default` is seeded, so its presence says nothing and this step can
    // never go done — hence it must never be a resume target.
    const client = {
      getVerticals: vi.fn(async () => [
        { name: 'accounting', status: 'up' as const, adapterCount: 1 },
      ]),
      listAllPlatformRows: vi.fn(async () => [
        { vertical: 'accounting', slug: 'fortnox', enabled: true, hasConfig: true },
      ]),
      getCompanyInfo: vi.fn(async () => ({ name: 'ACME' })),
      listApiKeys: vi.fn(async () => [{ id: 'k1' }]),
      listWebhookSubs: vi.fn(async () => []),
    }
    const progress = await computeWizardProgress(client, 'jwt', {
      role: 'admin',
      dsMode: 'database',
      tenantsDone: false,
    })
    expect(progress.firstIncomplete).toBeNull()
    expect(progress.done.tenants).toBe(false)
  })

  it('ticks in the rail once a tenant of their own exists', async () => {
    mockListTenants.mockResolvedValue(TWO)
    const res = await get('/setup/wizard/tenants')
    const rail = res.body.slice(res.body.indexOf('<aside class="wizard-rail">'))
    expect(rail).toContain('/setup/wizard/tenants')
    expect((res.body.match(/wizard-rail__label/g) ?? []).length).toBe(8)
  })
})

describe('the tenant a wizard key is minted into', () => {
  it('offers no choice when there is none to make', async () => {
    const res = await get('/setup/wizard/api-key')
    expect(res.body).toContain('name="tenantId"')
    // A single-tenant deployment sees no tenant picker.
    expect(res.body).not.toContain('<select class="select" name="tenantId"')
  })

  it('offers a picker once a second tenant exists', async () => {
    mockListTenants.mockResolvedValue(TWO)
    const res = await get('/setup/wizard/api-key')
    expect(res.body).toContain('<select class="select" name="tenantId"')
    expect(res.body).toContain('Department A')
  })

  it('mints into the tenant that was chosen', async () => {
    mockListTenants.mockResolvedValue(TWO)
    await post(
      '/setup/wizard/api-key',
      { label: 'dept key', scopeMode: 'safe-default', tenantId: 'dept-a' },
      '/setup/wizard/api-key',
    )
    expect(mockMintApiKey).toHaveBeenCalledWith(
      'jwt',
      expect.objectContaining({ tenantId: 'dept-a' }),
    )
  })

  it('keeps the MCP key in the same tenant as the main one', async () => {
    // The MCP form only exists after the first key is minted, so mint one into
    // a non-default tenant and read the form off that re-render. Two keys
    // offered on one screen must not land in different tenants.
    mockListTenants.mockResolvedValue(TWO)
    const res = await post(
      '/setup/wizard/api-key',
      { label: 'dept key', scopeMode: 'safe-default', tenantId: 'dept-a' },
      '/setup/wizard/api-key',
    )
    const mcpForm = res.body.slice(res.body.indexOf('/setup/wizard/api-key/mcp'))
    expect(mcpForm).toContain('name="tenantId" value="dept-a"')
  })

  it('keeps the chosen tenant when the form comes back with an error', async () => {
    // Every render path must carry tenantId — a validation-error re-render
    // that resets it to `default` is a silent wrong-tenant mint.
    mockListTenants.mockResolvedValue(TWO)
    const res = await post(
      '/setup/wizard/api-key',
      { label: '', scopeMode: 'safe-default', tenantId: 'dept-a' },
      '/setup/wizard/api-key',
    )
    expect(res.body).toContain('Give the key a label')
    expect(res.body).toContain('value="dept-a" selected')
  })
})

describe('a refused tenant create', () => {
  it('flashes a structured refusal (a license limit) as its message, not as an object', async () => {
    const message =
      "This license allows 1 tenant, counting 'default' (1 registered). Existing tenants keep working. More tenants need a plan that includes them: https://opensteward.dev/license"
    mockCreateTenant.mockRejectedValue(
      Object.assign(new Error('Request failed with status code 403'), {
        response: {
          status: 403,
          data: {
            error: {
              code: 'LICENSE_LIMIT_EXCEEDED',
              message,
              limitKey: 'tenants',
              limit: 1,
              used: 1,
            },
          },
        },
      }),
    )
    const res = await post('/tenants', { name: 'Department A' }, '/tenants')
    expect(res.statusCode).toBe(302)
    expect(flashOf(fastify, res)).toEqual([{ tone: 'danger', body: message }])
  })
})
