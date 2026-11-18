/**
 * Step 4 of the setup wizard must survive an admin-API rejection.
 *
 * When admin-api rejects the body, `POST /setup/wizard/configure` must
 * re-render the step with the upstream message and keep every typed field
 * (client id, secret, ticked scopes) — exactly as the standalone platform page
 * does. An uncaught rejection would hand the operator Fastify's raw JSON error
 * page: status only, no explanation, everything typed gone on the back button.
 */
import type { FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createHmac } from 'crypto'

const mockSetPlatformConfig = vi.fn(async () => undefined)

vi.mock('../../src/core/proxy/admin-api-client', async () => {
  // `await import`: vi.mock is hoisted above this file's imports, but the
  // factory body runs later, so it can import what the top level cannot.
  const { adminApiStub } = await import('../helpers/admin-api-stub')
  return {
    AdminApiClient: adminApiStub({
      setPlatformConfig: mockSetPlatformConfig,
      getLoginOptions: async () => {
        return { providers: [], localLoginEnabled: true }
      },
      listPlatforms: async () => {
        return [{ slug: 'fortnox', enabled: true, hasConfig: false }]
      },
      getPlatformConfig: async () => {
        return { clientId: null, redirectUri: null, scopes: null, hasSecret: false }
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

const SESSION_SECRET = 'admin-wizard-session-secret-must-be-long'
let fastify: FastifyInstance

function csrfToken(rawSignedCookie: string): string {
  return createHmac('sha256', SESSION_SECRET).update(rawSignedCookie).digest('hex').slice(0, 32)
}

beforeEach(async () => {
  mockSetPlatformConfig.mockReset()
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

async function postConfigure() {
  const sessionCookie = fastify.signCookie(
    JSON.stringify({ id: 'u1', username: 'admin', role: 'admin', token: 'jwt-token' }),
  )
  return fastify.inject({
    method: 'POST',
    url: '/setup/wizard/configure',
    cookies: { session: sessionCookie },
    payload: {
      _csrf: csrfToken(sessionCookie),
      vertical: 'accounting',
      slug: 'fortnox',
      clientId: 'LMTc1IGwN7Hz',
      clientSecret: 'not-a-real-secret',
      redirectUri: 'http://localhost:3010/auth/accounting/fortnox/callback',
      scopes: ['companyinformation', 'invoice.read'],
    },
  })
}

describe('Journey: the wizard credentials step is rejected upstream', () => {
  it('re-renders step 4 instead of returning a raw error page', async () => {
    mockSetPlatformConfig.mockRejectedValue(
      Object.assign(new Error('config.authType: Invalid discriminator value'), {
        response: { status: 400 },
      }),
    )
    const res = await postConfigure()
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toContain('text/html')
  })

  it('shows the operator why the save failed', async () => {
    mockSetPlatformConfig.mockRejectedValue(
      Object.assign(new Error('config.authType: Invalid discriminator value'), {
        response: { status: 400 },
      }),
    )
    const res = await postConfigure()
    expect(res.body).toContain('config.authType: Invalid discriminator value')
  })

  it('keeps the client id the operator typed', async () => {
    mockSetPlatformConfig.mockRejectedValue(new Error('upstream exploded'))
    const res = await postConfigure()
    expect(res.body).toContain('LMTc1IGwN7Hz')
  })

  it('never echoes the submitted client secret back into the page', async () => {
    mockSetPlatformConfig.mockRejectedValue(new Error('upstream exploded'))
    const res = await postConfigure()
    expect(res.body).not.toContain('not-a-real-secret')
  })

  it('still advances to the next step when the save succeeds', async () => {
    mockSetPlatformConfig.mockResolvedValue(undefined)
    const res = await postConfigure()
    expect(res.statusCode).toBe(302)
    // Tenants, not api-key: it is the step that follows credentials —
    // pointing past it would make tenants unreachable from the flow.
    expect(res.headers.location).toBe('/setup/wizard/tenants')
  })
})
