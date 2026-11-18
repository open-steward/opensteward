/**
 * Journey: the optional logos step in the setup wizard.
 *
 * The load-bearing assertion is `never resumes into the logos step`. Logos are
 * decoration — an operator perfectly happy with monogram tiles will never touch
 * that step, so if `firstIncomplete` were allowed to return it, every such
 * operator would be redirected back into it forever and the wizard could not be
 * finished. The skip in `firstIncomplete` makes that structurally impossible
 * rather than relying on the Skip button being clicked; this pins it.
 */
import type { FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let settingsRows: Array<Record<string, unknown>> = []
let companyInfo: { name?: string | null; baseUrl?: string | null } | null = null

const mockUpdateSetting = vi.fn(async () => ({}))

function row(key: string, value: unknown, isDefault = false) {
  return {
    key,
    value,
    valueType: 'string',
    defaultValue: '',
    description: '',
    category: 'logos',
    updatedAt: new Date().toISOString(),
    updatedBy: null,
    isDefault,
  }
}

vi.mock('../../src/core/proxy/admin-api-client', async () => {
  // `await import`: vi.mock is hoisted above this file's imports, but the
  // factory body runs later, so it can import what the top level cannot.
  const { adminApiStub } = await import('../helpers/admin-api-stub')
  return {
    AdminApiClient: adminApiStub({
      listTenants: async () => {
        return [{ id: 'default', name: 'Default' }]
      },
      listTenantDomains: async () => {
        return []
      },
      updateRuntimeSetting: mockUpdateSetting,
      listRuntimeSettings: async () => {
        return settingsRows
      },
      getCompanyInfo: async () => {
        return companyInfo
      },
      getVerticals: async () => {
        return []
      },
      listAllPlatformRows: async () => {
        return []
      },
      listConnections: async () => {
        return []
      },
      listApiKeys: async () => {
        return []
      },
      listWebhookSubs: async () => {
        return []
      },
      getActiveLogoFetch: async () => {
        return null
      },
      getLogoStatus: async () => {
        return { count: 0, totalBytes: 0, lastFetchedAt: null }
      },
      startLogoFetch: async () => {
        return { id: 'lfj_1', status: 'pending' }
      },
      getLoginOptions: async () => {
        return { providers: [], localLoginEnabled: true }
      },
    }),
  }
})

const { buildServer } = await import('../../src/core/server')
const { invalidateLogoSettingsCache } = await import('../../src/core/routes/logo-config')

const SESSION_SECRET = 'admin-wizard-logos-secret-long-enough'
let fastify: FastifyInstance

function session(role = 'admin') {
  return fastify.signCookie(JSON.stringify({ id: 'u1', username: 'admin', role, token: 'jwt' }))
}

beforeEach(async () => {
  settingsRows = [row('logos.source', 'none', true), row('logos.brandfetch_client_id', '')]
  companyInfo = null
  invalidateLogoSettingsCache()
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
  invalidateLogoSettingsCache()
  vi.clearAllMocks()
})

describe('Journey: the optional logos wizard step', () => {
  it('never resumes into the logos step, however untouched it is', async () => {
    // Branding saved, nothing else. Without the skip in firstIncomplete this
    // would land on /setup/wizard/logos and stay there forever.
    companyInfo = { name: 'Acme', baseUrl: 'https://acme.test' }

    const res = await fastify.inject({
      method: 'GET',
      url: '/setup/wizard',
      cookies: { session: session() },
    })
    expect(res.headers.location).toBe('/setup/wizard/platforms')
    expect(res.headers.location).not.toContain('logos')
  })

  it('is reachable directly and renders', async () => {
    const res = await fastify.inject({
      method: 'GET',
      url: '/setup/wizard/logos',
      cookies: { session: session() },
    })
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('Platform logos')
    expect(res.body).toContain('Step 3 of 8')
  })

  it('offers a skip that changes nothing and moves on', async () => {
    const res = await fastify.inject({
      method: 'GET',
      url: '/setup/wizard/logos',
      cookies: { session: session() },
    })
    expect(res.body).toContain('Skip for now')
    expect(res.body).toContain('href="/setup/wizard/platforms"')
  })

  it('lets an operator see and pass the step without admin rights', async () => {
    const res = await fastify.inject({
      method: 'GET',
      url: '/setup/wizard/logos',
      cookies: { session: session('operator') },
    })
    // 403-ing here would break the wizard outright for operators, since step 2
    // now funnels through this page.
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('needs the admin role')
    expect(res.body).not.toContain('Save logo settings')
  })

  it('refuses a settings write from a non-admin', async () => {
    const cookie = session('operator')
    const { generateCsrfToken } = await import('../../src/core/auth/csrf')
    const res = await fastify.inject({
      method: 'POST',
      url: '/setup/wizard/logos',
      cookies: { session: cookie },
      payload: { source: 'local', _csrf: generateCsrfToken(cookie, SESSION_SECRET) },
    })
    expect(res.statusCode).toBe(403)
    expect(mockUpdateSetting).not.toHaveBeenCalled()
  })

  it('saves and continues to the platforms step', async () => {
    const cookie = session()
    const { generateCsrfToken } = await import('../../src/core/auth/csrf')
    const res = await fastify.inject({
      method: 'POST',
      url: '/setup/wizard/logos',
      cookies: { session: cookie },
      payload: { source: 'local', _csrf: generateCsrfToken(cookie, SESSION_SECRET) },
    })
    expect(res.headers.location).toBe('/setup/wizard/platforms')
    expect(mockUpdateSetting).toHaveBeenCalledWith('jwt', 'logos.source', 'local')
  })

  it('re-renders in place with an error rather than losing the operator', async () => {
    const cookie = session()
    const { generateCsrfToken } = await import('../../src/core/auth/csrf')
    const res = await fastify.inject({
      method: 'POST',
      url: '/setup/wizard/logos',
      cookies: { session: cookie },
      payload: { source: 'cdn', _csrf: generateCsrfToken(cookie, SESSION_SECRET) },
    })
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('needs a client ID')
  })

  it('routes step 2 through the logos step', async () => {
    const res = await fastify.inject({
      method: 'GET',
      url: '/setup/wizard/company-info',
      cookies: { session: session() },
    })
    expect(res.body).toContain('href="/setup/wizard/logos"')
  })

  it('shows eight rail steps, and no Verify', async () => {
    const res = await fastify.inject({
      method: 'GET',
      url: '/setup/wizard/logos',
      cookies: { session: session() },
    })
    expect((res.body.match(/wizard-rail__label/g) ?? []).length).toBe(8)
    expect(res.body).toMatch(/wizard-rail__label">\s*Logos/)
    // A step needing a third party could never be completed on a fresh
    // deployment — no step here may depend on one.
    expect(res.body).not.toMatch(/wizard-rail__label">\s*Verify/)
  })

  it('ticks the rail once a mode has been chosen deliberately', async () => {
    settingsRows = [row('logos.source', 'local', false), row('logos.brandfetch_client_id', 'abc')]
    invalidateLogoSettingsCache()

    const res = await fastify.inject({
      method: 'GET',
      url: '/setup/wizard/platforms',
      cookies: { session: session() },
    })
    // Still not a resume target — the flag only drives the checkmark.
    expect(res.statusCode).toBe(200)
  })
})
