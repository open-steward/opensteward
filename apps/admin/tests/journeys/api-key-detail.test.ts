/**
 * Reading /api-keys without scrolling past one key.
 *
 * The row shows a scope count — the safe-default preset alone is sixteen
 * scopes, one per vertical plus the shared set, and one line each would make
 * a row taller than the screen. Full names live on a detail page opened from
 * the label (the same modal contract /connections uses).
 *
 * These tests pin the server-rendered half of that: what the row may contain,
 * what the detail page must contain, and that neither of them ever grows a
 * plaintext secret. The dialog itself needs a browser and is out of reach here
 * — see tests/journeys/resource-modal.test.ts for the same boundary.
 */
import type { FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createHmac } from 'crypto'
import { SAFE_DEFAULT_SCOPES } from '../../src/core/routes/api-keys-defaults.js'

const mockListApiKeys = vi.fn()
const mockGetApiKey = vi.fn()
const mockMintApiKey = vi.fn()
const mockRevokeApiKey = vi.fn()

vi.mock('../../src/core/proxy/admin-api-client', async () => {
  // `await import`: vi.mock is hoisted above this file's imports, but the
  // factory body runs later, so it can import what the top level cannot.
  const { adminApiStub } = await import('../helpers/admin-api-stub')
  return {
    AdminApiClient: adminApiStub({
      listApiKeys: mockListApiKeys,
      getApiKey: mockGetApiKey,
      mintApiKey: mockMintApiKey,
      revokeApiKey: mockRevokeApiKey,
      getLoginOptions: async () => {
        return { providers: [], localLoginEnabled: true }
      },
      getCompanyInfo: async () => {
        return null
      },
      listTenants: async () => {
        return [{ id: 'acme', name: 'Acme' }]
      },
    }),
  }
})

const { buildServer } = await import('../../src/core/server')

const SESSION_SECRET = 'api-key-detail-session-secret-long-enough'

/**
 * Timestamps are epoch milliseconds on the wire, not ISO strings: the store
 * returns the raw column and admin-api passes it through. A detail page that
 * assumed ISO would print the number.
 */
const CREATED_AT = Date.UTC(2026, 0, 15, 9, 30)
const LAST_USED_AT = Date.UTC(2026, 1, 1, 14, 20)
const REVOKED_AT = Date.UTC(2026, 1, 3, 8, 0)

/** A key minted with the recommended preset — one scope per vertical, plus six. */
const PRESET_KEY = {
  id: 'a1b2c3d4-0000-4000-8000-000000000001',
  tenantId: 'acme',
  prefix: 'osk_acme_8f3a',
  label: 'CI runner',
  scopes: [...SAFE_DEFAULT_SCOPES],
  createdAt: CREATED_AT,
  lastUsedAt: LAST_USED_AT,
  revokedAt: null,
}
/** Scoped down to two, and revoked. */
const SMALL_KEY = {
  id: 'a1b2c3d4-0000-4000-8000-000000000002',
  tenantId: 'acme',
  prefix: 'osk_acme_11bb',
  label: null,
  scopes: ['mcp:read', 'connections:read'],
  createdAt: CREATED_AT,
  lastUsedAt: null,
  revokedAt: REVOKED_AT,
}
/** Minted with no scopes at all, which the store records as the wildcard. */
const WILDCARD_KEY = {
  id: 'a1b2c3d4-0000-4000-8000-000000000003',
  tenantId: 'other',
  prefix: 'osk_other_c40d',
  label: 'Legacy integration',
  scopes: ['*'],
  createdAt: CREATED_AT,
  lastUsedAt: null,
  revokedAt: null,
}

/** A scope only the preset key has — proof the row is not printing them all. */
const PRESET_ONLY_SCOPE = 'connect-links:write'
const DETAIL_URL = `/api-keys/${PRESET_KEY.id}`

let fastify: FastifyInstance

function session(role: 'viewer' | 'operator' | 'admin') {
  return fastify.signCookie(JSON.stringify({ id: 'u1', username: role, role, token: 'jwt' }))
}
function csrf(c: string) {
  return createHmac('sha256', SESSION_SECRET).update(c).digest('hex').slice(0, 32)
}
function get(url: string, role: 'viewer' | 'operator' | 'admin' = 'admin') {
  return fastify.inject({ method: 'GET', url, cookies: { session: session(role) } })
}
/** Just the shell's content region — what the modal script lifts out. */
function content(body: string): string {
  const start = body.indexOf('<main class="app-content">')
  expect(start).toBeGreaterThan(-1)
  return body.slice(start)
}

beforeEach(async () => {
  mockListApiKeys.mockReset()
  mockGetApiKey.mockReset()
  mockMintApiKey.mockReset()
  mockRevokeApiKey.mockReset()
  mockListApiKeys.mockResolvedValue([PRESET_KEY, SMALL_KEY, WILDCARD_KEY])
  mockGetApiKey.mockImplementation(
    async (_token: string, id: string) =>
      [PRESET_KEY, SMALL_KEY, WILDCARD_KEY].find((k) => k.id === id) ?? null,
  )
  mockRevokeApiKey.mockResolvedValue(undefined)
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

describe('Journey: the list stops printing every scope', () => {
  it('summarises a sixteen-scope key as a count', async () => {
    const res = await get('/api-keys')
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain(`${SAFE_DEFAULT_SCOPES.length} scopes`)
    // No scope wall: one line per scope would make a row taller than the
    // screen.
    expect(res.body).not.toContain(PRESET_ONLY_SCOPE)
  })

  it('still names the scopes when a key only has a couple', async () => {
    const res = await get('/api-keys')
    // Two short scopes fit on the one line the row allows, and naming them
    // beats making the operator open a page to read two words.
    expect(res.body).toContain('mcp:read')
  })

  it('still calls the wildcard All access', async () => {
    const res = await get('/api-keys')
    expect(res.body).toContain('All access')
  })
})

describe('Journey: the label opens the key', () => {
  it('links the label at the detail page and marks it for the modal', async () => {
    const res = await get('/api-keys')
    // Both halves: `data-modal` is what the script looks for, the href is what
    // happens when the script is not there.
    expect(res.body).toContain(`href="${DETAIL_URL}"`)
    expect(res.body).toMatch(new RegExp(`<a[^>]*href="${DETAIL_URL}"[^>]*\\sdata-modal(\\s|=|>)`))
    expect(res.body).toMatch(new RegExp(`href="${DETAIL_URL}"[^>]*>[^<]*${PRESET_KEY.label}`))
  })

  it('gives an unlabelled key something to click', async () => {
    const res = await get('/api-keys')
    // Label is nullable. A bare dash would be a link a screen reader cannot
    // announce, so the prefix stands in.
    expect(res.body).toMatch(
      new RegExp(`href="/api-keys/${SMALL_KEY.id}"[^>]*>[^<]*${SMALL_KEY.prefix}`),
    )
  })
})

describe('Journey: the detail page holds what the row dropped', () => {
  it('renders a full page, not a fragment', async () => {
    const res = await get(DETAIL_URL)
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('<!DOCTYPE html>')
    // A deep link, a bookmark or "open in new tab" must land on a navigable
    // page — the modal is an enhancement, never the only way in.
    expect(res.body).toContain('class="sidebar__link"')
    expect(res.body).toContain('<main class="app-content">')
  })

  it('lists every scope the row summarised', async () => {
    const main = content((await get(DETAIL_URL)).body)
    for (const scope of SAFE_DEFAULT_SCOPES) expect(main).toContain(scope)
  })

  it('shows the fields the list never had room for', async () => {
    const main = content((await get(DETAIL_URL)).body)
    expect(main).toContain(PRESET_KEY.id)
    expect(main).toContain(PRESET_KEY.prefix)
    expect(main).toContain(PRESET_KEY.tenantId)
    // Formatted, not the raw epoch number the API actually sends.
    expect(main).toContain(new Date(CREATED_AT).toLocaleString())
    expect(main).toContain(new Date(LAST_USED_AT).toLocaleString())
    expect(main).not.toContain(String(CREATED_AT))
  })

  it('says when a revoked key was revoked', async () => {
    const main = content((await get(`/api-keys/${SMALL_KEY.id}`)).body)
    expect(main).toContain('Revoked')
    expect(main).toContain(new Date(REVOKED_AT).toLocaleString())
  })

  it('never renders a plaintext secret, even if the record carries one', async () => {
    // The list API does not return `plaintext` — but ApiKey is a loose schema
    // and the mint response shape does. A detail page that spread the record
    // into the view would leak it the day the two shapes met.
    mockGetApiKey.mockResolvedValue({ ...PRESET_KEY, plaintext: 'osk_acme_8f3a_leaked_secret' })
    const res = await get(DETAIL_URL)
    expect(res.body).not.toContain('leaked_secret')
  })

  it('is honest about a key that is not there', async () => {
    mockGetApiKey.mockResolvedValue(null)
    const res = await get('/api-keys/does-not-exist')
    expect(res.statusCode).toBe(404)
    // Still a page: the modal script navigates on a non-200, so this is what
    // the operator ends up looking at.
    expect(res.body).toContain('<!DOCTYPE html>')
  })
})

describe('Journey: the detail page changes nothing about who may do what', () => {
  it('refuses a viewer exactly as the list does', async () => {
    expect((await get('/api-keys', 'viewer')).statusCode).toBe(403)
    expect((await get(DETAIL_URL, 'viewer')).statusCode).toBe(403)
  })

  it('sends an unauthenticated visitor to the login page', async () => {
    const res = await fastify.inject({ method: 'GET', url: DETAIL_URL })
    expect(res.statusCode).toBe(302)
    expect(res.headers.location).toBe('/login')
  })

  it('offers revoke to an admin, with the CSRF token the POST needs', async () => {
    const res = await get(DETAIL_URL, 'admin')
    expect(res.body).toContain(`action="/api-keys/${PRESET_KEY.id}/revoke"`)
    expect(res.body).toMatch(/name="_csrf"/)
  })

  it('does not offer revoke to an operator, who cannot perform it', async () => {
    const res = await get(DETAIL_URL, 'operator')
    expect(res.statusCode).toBe(200)
    expect(res.body).not.toContain(`action="/api-keys/${PRESET_KEY.id}/revoke"`)
  })

  it('still refuses an operator the revoke itself', async () => {
    const c = session('operator')
    const res = await fastify.inject({
      method: 'POST',
      url: `/api-keys/${PRESET_KEY.id}/revoke`,
      cookies: { session: c },
      payload: { _csrf: csrf(c) },
    })
    expect(res.statusCode).toBe(403)
    expect(mockRevokeApiKey).not.toHaveBeenCalled()
  })
})

describe('Journey: the one-time reveal survives all of this', () => {
  it('still shows the plaintext once, on the list, after a mint', async () => {
    mockMintApiKey.mockResolvedValue({
      ...PRESET_KEY,
      plaintext: 'osk_acme_8f3a2b9c4d5e6f7a8b9c0d1e',
    })
    const c = session('admin')
    const res = await fastify.inject({
      method: 'POST',
      url: '/api-keys',
      cookies: { session: c },
      // `mode` is required by the form and not defaulted — see the mint route.
      payload: {
        _csrf: csrf(c),
        tenantId: 'acme',
        label: 'CI runner',
        scopeMode: 'safe-default',
        mode: 'live',
      },
    })
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('osk_acme_8f3a2b9c4d5e6f7a8b9c0d1e')
  })
})

describe('Journey: the detail page distinguishes missing from broken', () => {
  it('does not claim the key does not exist when the API is down', async () => {
    // An operator told the key does not exist will go looking for who
    // deleted it.
    // The route calls getApiKey, so that is what has to fail here — rejecting
    // listApiKeys would never reach it through this mock.
    mockGetApiKey.mockRejectedValue(new Error('connect ECONNREFUSED admin-api:3001'))
    const res = await get('/api-keys/key_1')
    expect(res.body).not.toMatch(/not found|does not exist/i)
    expect(res.statusCode).toBeGreaterThanOrEqual(500)
  })

  it('still says not found when the key genuinely is not there', async () => {
    mockGetApiKey.mockResolvedValue(null)
    const res = await get('/api-keys/key_1')
    expect(res.statusCode).toBe(404)
    expect(res.body).toMatch(/not found/i)
  })
})
