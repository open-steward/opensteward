/**
 * Minting a key into a tenant other than the default.
 *
 * The mint form used to render the tenant as a free-text `<input>` bound to a
 * `<datalist>`, pre-filled with `default`. Browsers filter datalist suggestions
 * against what is already in the box, so every other tenant was filtered out
 * before the list was ever shown: the dropdown offered only the value already
 * there, picking it did nothing, and the sole way to reach a second tenant was
 * to clear the field and type its id by hand. The whole point of the control
 * was the one thing it could not do.
 *
 * So this file does not assert on the markup for its own sake. It models the
 * browser's suggestion rule (`offeredTenantIds` below) and asserts on what an
 * operator can actually pick — the failure was invisible to a test that merely
 * checked the tenant ids appear somewhere in the page, which they did.
 */
import type { FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createHmac } from 'crypto'

const mockListTenants = vi.fn()
const mockMintApiKey = vi.fn()

const ONE = [{ id: 'default', name: 'Default' }]
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
      mintApiKey: mockMintApiKey,
      getLoginOptions: async () => ({ providers: [], localLoginEnabled: true }),
    }),
  }
})

const { buildServer } = await import('../../src/core/server')

const SESSION_SECRET = 'api-key-tenant-picker-secret-long-enough'
let fastify: FastifyInstance

function cookie(): string {
  return fastify.signCookie(
    JSON.stringify({ id: 'u1', username: 'admin', role: 'admin', token: 'jwt' }),
  )
}

function csrf(c: string): string {
  return createHmac('sha256', SESSION_SECRET).update(c).digest('hex').slice(0, 32)
}

const get = (url: string) => fastify.inject({ method: 'GET', url, cookies: { session: cookie() } })

async function post(url: string, payload: Record<string, string>) {
  const c = cookie()
  return fastify.inject({
    method: 'POST',
    url,
    cookies: { session: c },
    payload: { _csrf: csrf(c), ...payload },
  })
}

/**
 * The tenant ids the rendered page actually lets an operator pick, without
 * typing anything.
 *
 * A `<select>` offers every option it contains, whatever its current value.
 * An `<input list="…">` offers only the datalist suggestions that match what is
 * already in the field — Chrome, Firefox and Safari all filter on the current
 * value — so a pre-filled field hides every tenant whose id and name do not
 * contain it. Reproducing that rule here is what makes the assertions below
 * about the operator's experience rather than about the markup.
 */
function offeredTenantIds(body: string): string[] {
  const select = body.match(/<select\b[^>]*\bname="tenantId"[^>]*>([\s\S]*?)<\/select>/)
  if (select) return [...select[1].matchAll(/<option\b[^>]*\bvalue="([^"]*)"/g)].map((m) => m[1])

  const input = body.match(/<input\b[^>]*\bname="tenantId"[^>]*>/)
  if (!input) return []
  const current = input[0].match(/\bvalue="([^"]*)"/)?.[1] ?? ''
  const listId = input[0].match(/\blist="([^"]*)"/)?.[1]
  if (!listId) return current ? [current] : []

  const datalist = body.match(
    new RegExp(`<datalist\\b[^>]*\\bid="${listId}"[^>]*>([\\s\\S]*?)</datalist>`),
  )
  if (!datalist) return current ? [current] : []
  const needle = current.toLowerCase()
  return [...datalist[1].matchAll(/<option\b[^>]*\bvalue="([^"]*)"[^>]*>([^<]*)</g)]
    .filter(([, value, label]) => (value + label).toLowerCase().includes(needle))
    .map((m) => m[1])
}

beforeEach(async () => {
  mockListTenants.mockReset().mockResolvedValue(ONE)
  mockMintApiKey
    .mockReset()
    .mockResolvedValue({ id: 'k1', prefix: 'osk_abc', plaintext: 'osk_abc.secret' })

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

describe('Journey: minting an API key into a chosen tenant', () => {
  it('lets the operator pick any registered tenant, not just the pre-filled one', async () => {
    mockListTenants.mockResolvedValue(TWO)
    const res = await get('/api-keys/new')
    expect(res.statusCode).toBe(200)
    expect(offeredTenantIds(res.body).sort()).toEqual(['default', 'dept-a'])
  })

  it('starts on the tenant the route defaults to, so nothing changes by accident', async () => {
    mockListTenants.mockResolvedValue(TWO)
    const res = await get('/api-keys/new')
    const selected = res.body.match(/<option\b[^>]*\bvalue="([^"]*)"[^>]* selected/)?.[1]
    expect(selected).toBe('default')
  })

  it('mints into the tenant that was chosen', async () => {
    mockListTenants.mockResolvedValue(TWO)
    await post('/api-keys', {
      tenantId: 'dept-a',
      label: 'Dept A server',
      mode: 'live',
      scopeMode: 'safe-default',
    })
    expect(mockMintApiKey).toHaveBeenCalledWith(
      'jwt',
      expect.objectContaining({ tenantId: 'dept-a' }),
    )
  })

  it('keeps the picker when another field fails validation', async () => {
    // A control that vanishes on a validation error costs the operator the
    // choice the moment they mistype the label.
    mockListTenants.mockResolvedValue(TWO)
    const res = await post('/api-keys', { tenantId: 'dept-a', label: '', mode: 'live' })
    expect(res.body).toContain('Give the key a label')
    expect(offeredTenantIds(res.body).sort()).toEqual(['default', 'dept-a'])
  })

  it('still offers a typeable tenant id on a single-tenant deployment', async () => {
    // One tenant is no choice, and an admin-api that did not answer leaves
    // none at all — the field must still carry a value the POST accepts,
    // which it validates as required.
    const res = await get('/api-keys/new')
    expect(offeredTenantIds(res.body)).toEqual(['default'])
    expect(res.body).toContain('name="tenantId"')
  })
})
