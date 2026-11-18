/**
 * A Connect Link's label no longer has to be free at mint time.
 *
 * The route used to look the label up before minting: a pinned link whose
 * label already belonged to a connection for the same (tenant, platform) was
 * refused on the form with "Choose another label.", because the link's label
 * becomes the CONNECTION's label when the customer finishes, and connection
 * labels are unique per (tenant, platform).
 *
 * Both halves of that reasoning have since moved:
 *
 *   - Labels are derived automatically at mint time, and carry a timestamp, so
 *     two links cannot be minted under the same one. Telling the operator to
 *     "choose another label" would name a field they never filled in.
 *   - The connection's label is derived again at completion, where the
 *     platform is finally known, and `store.createWithUniqueLabel` suffixes a
 *     clash rather than discarding a grant the customer has already given.
 *
 * So the pre-check could only be a false refusal: an admin-api round trip per
 * mint, spent blocking a link that would have completed. What survives is the
 * far end — integration-server still answers DUPLICATE_LABEL where it can tell
 * the platform, and the route still points that at the label field.
 */
import type { FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockListConnections = vi.fn()
const mockCreateConnectSession = vi.fn()
const mockListTenants = vi.fn()

vi.mock('../../src/core/proxy/admin-api-client', async () => {
  const { adminApiStub } = await import('../helpers/admin-api-stub')
  return {
    AdminApiClient: adminApiStub({
      listConnections: mockListConnections,
      createConnectSession: mockCreateConnectSession,
      listTenants: mockListTenants,
      getLoginOptions: async () => ({ providers: [], localLoginEnabled: true }),
      getCompanyInfo: async () => null,
      listConnectSessions: async () => [],
      listConnectLinkTemplates: async () => [],
      listScopeGroups: async () => [],
      listPlatforms: async () => [{ slug: 'xero', enabled: true, hasConfig: true }],
      getVerticals: async () => [{ name: 'accounting' }],
      // The enabled catalog the form's vertical/adapter selects are built from.
      listAllPlatformRows: async () => [
        { vertical: 'accounting', slug: 'xero', enabled: true, hasConfig: true },
      ],
      listCatalog: async () => [
        { vertical: 'accounting', slug: 'xero', name: 'Xero', authType: 'oauth2' },
      ],
      listEndUsers: async () => [],
    }),
  }
})

const { buildServer } = await import('../../src/core/server')

const SESSION_SECRET = 'connect-link-label-session-secret-long-enough'
/**
 * The negative control: a connection holding exactly the label, tenant and
 * platform `mint()` submits. It is stubbed on every test so that a route which
 * went looking would find a clash — the point being that nothing looks.
 */
const EXISTING = {
  id: 'c-1',
  vertical: 'accounting',
  platform: 'xero',
  tenantId: 'claims-no',
  label: 'test 7',
  status: 'valid',
  createdAt: '2026-01-15T09:30:00.000Z',
  updatedAt: '2026-02-01T10:00:00.000Z',
}

let fastify: FastifyInstance

beforeEach(async () => {
  mockListConnections.mockReset().mockResolvedValue([EXISTING])
  mockCreateConnectSession.mockReset().mockResolvedValue({ id: 's1', token: 'abc123' })
  // Two tenants, so the form offers a tenant choice worth echoing back.
  mockListTenants.mockReset().mockResolvedValue([
    { id: 'default', name: 'Default' },
    { id: 'claims-no', name: 'Claims NO' },
  ])
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

async function mint(overrides: Record<string, string> = {}) {
  const cookie = fastify.signCookie(
    JSON.stringify({ id: 'u1', username: 'admin', role: 'admin', token: 'jwt' }),
  )
  const { generateCsrfToken } = await import('../../src/core/auth/csrf')
  return fastify.inject({
    method: 'POST',
    url: '/connect-links',
    cookies: { session: cookie },
    payload: {
      _csrf: generateCsrfToken(cookie, SESSION_SECRET),
      label: 'test 7',
      linkMode: 'pinned',
      vertical: 'accounting',
      platform: 'xero',
      tenantId: 'claims-no',
      ...overrides,
    },
  })
}

/** A backend DUPLICATE_LABEL, in the axios shape `backendErrorCode` reads. */
function duplicateLabelError() {
  return Object.assign(new Error('Request failed with status code 409'), {
    response: {
      status: 409,
      data: {
        error: {
          code: 'DUPLICATE_LABEL',
          message: "Connection label 'test 7' already exists on platform 'xero'",
        },
      },
    },
  })
}

describe('Journey: a label already in use does not block the mint', () => {
  it('mints the link, leaving the label to be settled at completion', async () => {
    const res = await mint()
    expect(mockCreateConnectSession).toHaveBeenCalled()
    expect(res.statusCode).toBe(302)
    expect(res.headers.location).toMatch(/^\/connect-links\?link=/)
  })

  it('does not read the connection list to get there', async () => {
    // Not just a spared round trip: uniqueness is per platform, and a link that
    // lets the customer choose has no platform yet, so no answer read here
    // could be trusted for every link anyway.
    await mint()
    expect(mockListConnections).not.toHaveBeenCalled()
  })

  it('passes the label through untouched, clash and all', async () => {
    await mint()
    expect(mockCreateConnectSession.mock.calls[0][1]).toMatchObject({
      tenantId: 'claims-no',
      label: 'test 7',
    })
  })
})

/**
 * The refusals that remain re-render the form. It used to re-render it EMPTY —
 * every field snapped back to its default — so the operator, told only what
 * was wrong, had to re-enter the customer, tenant, adapter, scopes, expiry and
 * redirect from memory before they could fix it. And nothing on the page said
 * which of the ten fields the message was about.
 */
describe('Journey: the rejected form keeps what the operator typed', () => {
  it('echoes every field back, so only the flagged one needs changing', async () => {
    mockCreateConnectSession.mockRejectedValue(new Error('Connect session store is unavailable'))
    const res = await mint({
      customerEmail: 'jane@acme.example',
      customerDisplayName: 'Jane Doe',
      redirectUrl: 'https://app.example/connected',
      expiryDays: '14',
      oneTimeOnly: 'on',
      scopeGroupId: 'platform-default',
    })
    expect(res.statusCode).toBe(200)
    expect(res.body).toMatch(/name="label"[^>]*value="test 7"/)
    expect(res.body).toMatch(/name="customerEmail"[^>]*value="jane@acme.example"/)
    expect(res.body).toMatch(/name="customerDisplayName"[^>]*value="Jane Doe"/)
    expect(res.body).toMatch(/name="redirectUrl"[^>]*value="https:\/\/app\.example\/connected"/)
    expect(res.body).toMatch(/<option value="pinned" selected>/)
    expect(res.body).toMatch(/<option value="claims-no"[^>]*selected>/)
    expect(res.body).toMatch(/<option value="accounting" selected>/)
    // The adapter list is normally filled in by script after a vertical is
    // picked; on a re-render it has to arrive from the server, already chosen.
    expect(res.body).toMatch(/<option value="xero"[^>]*selected>/)
    expect(res.body).toMatch(/<option value="platform-default" selected>/)
    expect(res.body).toMatch(/<option value="14" selected>/)
    expect(res.body).toMatch(/name="oneTimeOnly"[^>]*checked/)
  })

  it('marks the label when integration-server calls it a duplicate, and nothing else', async () => {
    // The one label refusal left: the far end knows the platform, so its
    // DUPLICATE_LABEL is the only trustworthy one, and the route maps it back
    // onto the field the operator can act on.
    mockCreateConnectSession.mockRejectedValue(duplicateLabelError())
    const res = await mint()
    expect(res.body).toContain('already exists on platform')
    expect(res.body).toMatch(
      /<input class="input input--invalid" name="label"[^>]*aria-invalid="true"/,
    )
    expect(res.body).not.toMatch(/name="customerEmail"[^>]*aria-invalid/)
    expect(res.body).not.toMatch(/name="vertical"[^>]*aria-invalid/)
  })

  it('points a pinned link missing its adapter at that field, with the label intact', async () => {
    const res = await mint({ vertical: '', platform: '' })
    expect(res.body).toMatch(
      /<select class="select select--invalid" name="vertical"[^>]*aria-invalid="true"/,
    )
    expect(res.body).not.toMatch(/name="label"[^>]*aria-invalid/)
    expect(res.body).toMatch(/name="label"[^>]*value="test 7"/)
  })

  it('keeps the values when integration-server refuses, too', async () => {
    mockCreateConnectSession.mockRejectedValue(new Error('Connect session store is read-only'))
    const res = await mint({ label: 'a free label', redirectUrl: 'https://app.example/x' })
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('read-only')
    expect(res.body).toMatch(/name="label"[^>]*value="a free label"/)
    expect(res.body).toMatch(/name="redirectUrl"[^>]*value="https:\/\/app\.example\/x"/)
    expect(res.body).toMatch(/<option value="xero"[^>]*selected>/)
  })

  it('renders a fresh form with nothing pre-filled or flagged', async () => {
    const cookie = fastify.signCookie(
      JSON.stringify({ id: 'u1', username: 'admin', role: 'admin', token: 'jwt' }),
    )
    const res = await fastify.inject({
      method: 'GET',
      url: '/connect-links/new',
      cookies: { session: cookie },
    })
    expect(res.statusCode).toBe(200)
    expect(res.body).toMatch(/name="label"[^>]*value=""/)
    expect(res.body).not.toContain('aria-invalid')
    expect(res.body).not.toContain('input--invalid')
  })
})
