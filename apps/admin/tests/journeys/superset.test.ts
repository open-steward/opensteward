/**
 * Embedded Superset dashboards: listed on the dashboards index only when
 * admin-api has the feature on; the dashboard page wired for
 * superset-embed.js under the strict CSP plus `frame-src` for the Superset
 * origin (and nothing else); the CSRF-protected guest-token proxy relaying
 * admin-api's answer; permission gating; and the vendored SDK.
 */
import type { FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createHmac } from 'crypto'

const mockGetMyAccess = vi.fn()
const mockListDashboards = vi.fn()
const mockGetSupersetStatus = vi.fn()
const mockListSupersetDashboards = vi.fn()
const mockCreateSupersetGuestToken = vi.fn()
const mockUpdateSupersetSharing = vi.fn()
const mockListTenants = vi.fn()

vi.mock('../../src/core/proxy/admin-api-client', async () => {
  const { adminApiStub } = await import('../helpers/admin-api-stub')
  return {
    AdminApiClient: adminApiStub({
      getMyAccess: mockGetMyAccess,
      listDashboards: mockListDashboards,
      getSupersetStatus: mockGetSupersetStatus,
      listSupersetDashboards: mockListSupersetDashboards,
      createSupersetGuestToken: mockCreateSupersetGuestToken,
      updateSupersetSharing: mockUpdateSupersetSharing,
      listTenants: mockListTenants,
    }),
  }
})

const { buildServer } = await import('../../src/core/server')

const SESSION_SECRET = 'superset-journey-session-secret-long-enough'
let fastify: FastifyInstance
let seq = 0

const VIEWER = ['connections:read', 'dashboards:view']
const OVERVIEW = {
  id: 'ssd_overview',
  title: 'Connection data overview',
  description: 'Connections and synced records.',
  embeddedUuid: '6c0a4bd6-3f7c-4c5e-9d52-7b1f0e0f2a11',
  verticals: null,
  requiredPermission: null,
  audience: { kind: 'everyone' },
  pinnedTenants: null,
  updatedAt: '2026-09-01T10:00:00.000Z',
}

function session() {
  seq += 1
  return fastify.signCookie(
    JSON.stringify({ id: 'u1', username: 'viewer', role: 'viewer', token: `jwt-${seq}` }),
  )
}
function access(permissions: string[]) {
  mockGetMyAccess.mockResolvedValue({
    roleId: 'r',
    roleName: 'r',
    permissions,
    scope: { mode: 'all', grants: [] },
  })
}
function get(url: string) {
  return fastify.inject({ method: 'GET', url, cookies: { session: session() } })
}
function postToken(id: string, withCsrf = true) {
  const c = session()
  const _csrf = createHmac('sha256', SESSION_SECRET).update(c).digest('hex').slice(0, 32)
  return fastify.inject({
    method: 'POST',
    url: `/dashboards/superset/${id}/guest-token`,
    cookies: { session: c },
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    payload: withCsrf ? `_csrf=${_csrf}` : '',
  })
}

beforeEach(async () => {
  for (const m of [
    mockGetMyAccess,
    mockListDashboards,
    mockGetSupersetStatus,
    mockListSupersetDashboards,
    mockCreateSupersetGuestToken,
    mockUpdateSupersetSharing,
    mockListTenants,
  ]) {
    m.mockReset()
  }
  mockListTenants.mockResolvedValue([{ id: 'acme', name: 'Acme', createdAt: 0, updatedAt: 0 }])
  access(VIEWER)
  mockListDashboards.mockResolvedValue([])
  mockGetSupersetStatus.mockResolvedValue({ enabled: true, publicUrl: 'https://bi.example.test/' })
  mockListSupersetDashboards.mockResolvedValue([OVERVIEW])
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

describe('dashboards index', () => {
  it('lists Superset dashboards when the feature is on', async () => {
    const res = await get('/dashboards')
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('Custom dashboards (Superset)')
    expect(res.body).toContain('href="/dashboards/superset/ssd_overview"')
    expect(res.body).toContain('Connection data overview')
  })

  it('hides the section when the feature is off or admin-api cannot say', async () => {
    mockGetSupersetStatus.mockResolvedValue({ enabled: false, publicUrl: null })
    expect((await get('/dashboards')).body).not.toContain('Custom dashboards (Superset)')
    mockGetSupersetStatus.mockResolvedValue(null)
    expect((await get('/dashboards')).body).not.toContain('Custom dashboards (Superset)')
    expect(mockListSupersetDashboards).not.toHaveBeenCalled()
  })

  it('keeps the page up when listing Superset dashboards fails', async () => {
    mockListSupersetDashboards.mockRejectedValue(new Error('down'))
    const res = await get('/dashboards')
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('No Superset dashboards available to you')
  })
})

describe('dashboard page', () => {
  it('renders the embed wiring under the strict CSP plus frame-src for Superset only', async () => {
    const res = await get('/dashboards/superset/ssd_overview')
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('data-embedded-uuid="6c0a4bd6-3f7c-4c5e-9d52-7b1f0e0f2a11"')
    expect(res.body).toContain('data-superset-domain="https://bi.example.test"')
    expect(res.body).toMatch(/data-csrf="[0-9a-f]{32}"/)
    expect(res.body).toContain('src="/vendor/superset-embedded-sdk.js"')
    expect(res.body).toContain('src="/public/js/superset-embed.js"')
    expect(res.body).not.toMatch(/\son(click|submit|load)="/)
    expect(String(res.headers['content-security-policy'])).toBe(
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'none'; font-src 'self' data:; frame-src https://bi.example.test",
    )
  })

  it('never lets a hostile public URL into the header', async () => {
    mockGetSupersetStatus.mockResolvedValue({
      enabled: true,
      publicUrl: 'javascript:alert(1)',
    })
    const res = await get('/dashboards/superset/ssd_overview')
    expect(res.statusCode).toBe(404)
    expect(String(res.headers['content-security-policy'])).not.toContain('frame-src')
  })

  it('404s an unknown dashboard or a disabled feature, without frame-src', async () => {
    const unknown = await get('/dashboards/superset/ssd_other')
    expect(unknown.statusCode).toBe(404)
    expect(String(unknown.headers['content-security-policy'])).not.toContain('frame-src')
    mockGetSupersetStatus.mockResolvedValue({ enabled: false, publicUrl: null })
    expect((await get('/dashboards/superset/ssd_overview')).statusCode).toBe(404)
  })

  it('refuses a user without dashboards:view', async () => {
    access(['connections:read'])
    expect((await get('/dashboards/superset/ssd_overview')).statusCode).toBe(403)
    expect((await postToken('ssd_overview')).statusCode).toBe(403)
    expect(mockCreateSupersetGuestToken).not.toHaveBeenCalled()
  })
})

describe('guest-token proxy', () => {
  it('requires the CSRF token', async () => {
    const res = await postToken('ssd_overview', false)
    expect(res.statusCode).toBe(403)
    expect(mockCreateSupersetGuestToken).not.toHaveBeenCalled()
  })

  it('returns the token admin-api minted for this session', async () => {
    mockCreateSupersetGuestToken.mockResolvedValue({
      token: 'guest.jwt.token',
      expiresAt: '2026-09-01T10:05:00.000Z',
      embeddedUuid: OVERVIEW.embeddedUuid,
      supersetDomain: 'https://bi.example.test',
      restricted: true,
    })
    const res = await postToken('ssd_overview')
    expect(res.statusCode).toBe(200)
    expect(res.headers['cache-control']).toBe('no-store')
    expect(res.json()).toEqual({ token: 'guest.jwt.token', expiresAt: '2026-09-01T10:05:00.000Z' })
    expect(mockCreateSupersetGuestToken.mock.calls[0]![1]).toBe('ssd_overview')
    expect(String(mockCreateSupersetGuestToken.mock.calls[0]![0])).toMatch(/^jwt-/)
  })

  it('relays admin-api refusals with their status and code', async () => {
    mockCreateSupersetGuestToken.mockRejectedValue({
      response: {
        status: 403,
        data: {
          error: { code: 'SCOPE_EMPTY', message: 'Your access is restricted to no tenants.' },
        },
      },
    })
    const res = await postToken('ssd_overview')
    expect(res.statusCode).toBe(403)
    expect(res.json().error).toEqual({
      code: 'SCOPE_EMPTY',
      message: 'Your access is restricted to no tenants.',
    })
  })
})

describe('embed script', () => {
  it('embeds with the configured UI and sends Superset the origin it checks', async () => {
    const js = await fastify.inject({ method: 'GET', url: '/public/js/superset-embed.js' })
    expect(js.statusCode).toBe(200)
    expect(js.body).toContain("referrerPolicy: 'strict-origin-when-cross-origin'")
    expect(js.body).toContain('hideTitle: true')
    expect(js.body).toContain("'/guest-token'")
    expect(js.body).toContain('_csrf')
  })
})

describe('vendored SDK', () => {
  it('serves the embedded SDK bundle, and nothing else from the package', async () => {
    const ok = await fastify.inject({ method: 'GET', url: '/vendor/superset-embedded-sdk.js' })
    expect(ok.statusCode).toBe(200)
    expect(ok.headers['content-type']).toContain('javascript')
    expect(ok.body).toContain('supersetEmbeddedSdk')
    for (const url of ['/vendor/index.js', '/vendor/bundle/index.js', '/vendor/package.json']) {
      expect((await fastify.inject({ method: 'GET', url })).statusCode).toBe(404)
    }
  })
})

function postForm(url: string, body: Record<string, string | string[]>) {
  const c = session()
  const _csrf = createHmac('sha256', SESSION_SECRET).update(c).digest('hex').slice(0, 32)
  return fastify.inject({
    method: 'POST',
    url,
    cookies: { session: c },
    payload: { _csrf, ...body },
  })
}

describe('Superset sharing', () => {
  it('share_all holders get a sharing form without "Only me"; others get 403', async () => {
    access([...VIEWER, 'dashboards:share_all'])
    const res = await get('/dashboards/superset/ssd_overview/sharing')
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('name="audience_tenant" value="acme"')
    expect(res.body).not.toContain('value="private"')
    access(VIEWER)
    expect((await get('/dashboards/superset/ssd_overview/sharing')).statusCode).toBe(403)
  })

  it('saving posts the audience and pins, then returns to the dashboard', async () => {
    access([...VIEWER, 'dashboards:share_all'])
    mockUpdateSupersetSharing.mockResolvedValue(OVERVIEW)
    const res = await postForm('/dashboards/superset/ssd_overview/sharing', {
      audience: 'tenants',
      audience_tenant: 'acme',
      pin_tenant: 'acme',
    })
    expect(res.statusCode).toBe(302)
    expect(res.headers.location).toBe('/dashboards/superset/ssd_overview')
    expect(mockUpdateSupersetSharing).toHaveBeenCalledWith(expect.any(String), 'ssd_overview', {
      audience: { kind: 'tenants', tenants: ['acme'] },
      pinnedTenants: ['acme'],
    })
  })

  it('the embed page shows who it is shared with and where the data is from', async () => {
    const res = await get('/dashboards/superset/ssd_overview')
    expect(res.body).toContain('Shared with: Everyone')
    expect(res.body).toContain('Data from: every tenant you can see')
    expect(res.body).not.toContain('/sharing')
  })
})

describe('Superset sharing edge cases', () => {
  it('answers 404, not 500, when Superset is off', async () => {
    access([...VIEWER, 'dashboards:share_all'])
    mockGetSupersetStatus.mockResolvedValue({ enabled: false, publicUrl: null })
    const conflict = Object.assign(new Error('409'), { response: { status: 409, data: {} } })
    mockListSupersetDashboards.mockRejectedValue(conflict)
    expect((await get('/dashboards/superset/ssd_overview/sharing')).statusCode).toBe(404)
    const res = await postForm('/dashboards/superset/ssd_overview/sharing', {
      audience: 'everyone',
    })
    expect(res.statusCode).toBe(404)
    expect(mockUpdateSupersetSharing).not.toHaveBeenCalled()
  })

  it('a failed save shows a sharing-specific message, not the guest-token one', async () => {
    access([...VIEWER, 'dashboards:share_all'])
    mockUpdateSupersetSharing.mockRejectedValue(
      Object.assign(new Error('400'), { response: { status: 400, data: {} } }),
    )
    const res = await postForm('/dashboards/superset/ssd_overview/sharing', {
      audience: 'everyone',
    })
    expect(res.statusCode).toBe(400)
    expect(res.body).toContain('Could not save sharing.')
    expect(res.body).not.toContain('could not be authorised')
  })
})
