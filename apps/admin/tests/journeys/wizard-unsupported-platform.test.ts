/**
 * Setup wizard, step 3 (pick platforms): an unsupported adapter's checkbox
 * must render disabled with its reason, and the toggle POST must never try
 * to enable one — even a hand-crafted request naming it must not reach
 * `enablePlatform`, and must not crash the step into a raw 500 if the
 * upstream refuses one anyway.
 */
import type { FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const REASON = 'Weebly retired its developer API; there is no supported way to connect an account.'

const mockEnablePlatform = vi.fn(async () => undefined)
const mockDisablePlatform = vi.fn(async () => undefined)

const ADAPTERS = [
  { slug: 'shopify', enabled: false, hasConfig: false },
  {
    slug: 'weebly',
    enabled: false,
    hasConfig: false,
    unsupported: { reason: REASON, issueUrl: 'https://github.com/open-steward/opensteward/issues/500' },
  },
]

vi.mock('../../src/core/proxy/admin-api-client', async () => {
  // `await import`: vi.mock is hoisted above this file's imports, but the
  // factory body runs later, so it can import what the top level cannot.
  const { adminApiStub } = await import('../helpers/admin-api-stub')
  return {
    AdminApiClient: adminApiStub({
      getLoginOptions: async () => ({ providers: [], localLoginEnabled: true }),
      getVerticals: async () => [{ name: 'ecommerce', status: 'up', adapterCount: ADAPTERS.length }],
      listPlatforms: async () => ADAPTERS,
      enablePlatform: mockEnablePlatform,
      disablePlatform: mockDisablePlatform,
    }),
  }
})

const { buildServer } = await import('../../src/core/server')

const SESSION_SECRET = 'wizard-unsupported-platform-secret-long-enough'
let fastify: FastifyInstance

function session() {
  return fastify.signCookie(
    JSON.stringify({ id: 'u1', username: 'admin', role: 'admin', token: 'jwt' }),
  )
}

async function getStep() {
  return fastify.inject({
    method: 'GET',
    url: '/setup/wizard/platforms?vertical=ecommerce',
    cookies: { session: session() },
  })
}

async function postStep(enabled: string[]) {
  const page = await getStep()
  const token = /name="_csrf" value="([^"]+)"/.exec(page.body)?.[1] ?? ''
  return fastify.inject({
    method: 'POST',
    url: '/setup/wizard/platforms',
    cookies: { session: session() },
    payload: { _csrf: token, vertical: 'ecommerce', enabled },
  })
}

beforeEach(async () => {
  mockEnablePlatform.mockClear()
  mockDisablePlatform.mockClear()
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

describe('Journey: wizard step 3 lists an unsupported platform', () => {
  it("renders its checkbox disabled", async () => {
    const res = await getStep()
    // The row's checkbox comes right before its slug in the markup — assert
    // `disabled` sits on that specific `<input>`, not merely anywhere on the
    // page.
    const row = res.body.slice(res.body.indexOf('value="weebly"') - 200, res.body.indexOf('value="weebly"') + 60)
    expect(row).toContain('disabled')
  })

  it('shows the reason', async () => {
    const res = await getStep()
    expect(res.body).toContain(REASON)
  })

  it("does not disable shopify's checkbox", async () => {
    const res = await getStep()
    const row = res.body.slice(res.body.indexOf('value="shopify"') - 200, res.body.indexOf('value="shopify"') + 60)
    expect(row).not.toContain('disabled')
  })
})

describe('Journey: wizard step 3 POST never enables an unsupported platform', () => {
  it('does not call enablePlatform for it even when named in the request', async () => {
    const res = await postStep(['shopify', 'weebly'])
    expect(res.statusCode).not.toBe(500)
    expect(mockEnablePlatform).not.toHaveBeenCalledWith(expect.anything(), 'ecommerce', 'weebly')
  })

  it('still enables the supported platform named alongside it', async () => {
    await postStep(['shopify', 'weebly'])
    expect(mockEnablePlatform).toHaveBeenCalledWith(expect.anything(), 'ecommerce', 'shopify')
  })

  it('does not 500 when the upstream refuses a (supported) platform for an unrelated reason', async () => {
    mockEnablePlatform.mockRejectedValueOnce(new Error('upstream exploded'))
    const res = await postStep(['shopify'])
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('upstream exploded')
  })
})
