/**
 * The mint screens require a label and say so plainly, because a key you
 * cannot identify later is a key you cannot safely revoke. The check runs
 * before the upstream call, so the operator gets the message immediately and
 * keeps everything they typed.
 */
import type { FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockMintApiKey = vi.fn(async () => ({
  id: 'k1',
  plaintext: 'osk_default_secret',
  prefix: 'osk_default_',
  label: 'CI runner',
  scopes: [],
  tenantId: 'default',
  createdAt: '2026-08-20T09:00:00Z',
}))

vi.mock('../../src/core/proxy/admin-api-client', async () => {
  // `await import`: vi.mock is hoisted above this file's imports, but the
  // factory body runs later, so it can import what the top level cannot.
  const { adminApiStub } = await import('../helpers/admin-api-stub')
  return {
    AdminApiClient: adminApiStub({
      mintApiKey: mockMintApiKey,
      getLoginOptions: async () => {
        return { providers: [], localLoginEnabled: true }
      },
      listTenants: async () => {
        return [{ id: 'default', name: 'Default' }]
      },
      getDataStoreMetrics: async () => {
        return {
          mode: 'database',
          rows: { total: 0 },
          db_size_mb: 0,
          sync_jobs: { pending: 0, running: 0 },
        }
      },
      listApiKeys: async () => {
        return []
      },
      getVerticals: async () => {
        return []
      },
      listPlatforms: async () => {
        return []
      },
      listConnections: async () => {
        return []
      },
      listWebhookSubs: async () => {
        return []
      },
      getCompanyInfo: async () => {
        return null
      },
    }),
  }
})

const { buildServer } = await import('../../src/core/server')

const SESSION_SECRET = 'api-key-label-validation-secret-long'
let fastify: FastifyInstance

function session() {
  return fastify.signCookie(
    JSON.stringify({ id: 'u1', username: 'admin', role: 'admin', token: 'jwt' }),
  )
}

function csrf(cookie: string): string {
  // Mirrors generateCsrfToken(): HMAC-SHA256 of the raw signed cookie.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { createHmac } = require('crypto')
  return createHmac('sha256', SESSION_SECRET).update(cookie).digest('hex').slice(0, 32)
}

/** Like `mintVia`, but lets a case control (or omit) the mode field. */
async function mintWithMode(url: string, mode: string | undefined) {
  const cookie = session()
  const payload: Record<string, string> = {
    _csrf: csrf(cookie),
    tenantId: 'default',
    label: 'Some key',
    scopeMode: 'safe-default',
  }
  if (mode !== undefined) payload['mode'] = mode
  return fastify.inject({ method: 'POST', url, cookies: { session: cookie }, payload })
}

async function mintVia(url: string, label: string | undefined) {
  const cookie = session()
  const payload: Record<string, string> = {
    _csrf: csrf(cookie),
    tenantId: 'default',
    scopeMode: 'safe-default',
    // The mint form requires an explicit live/test choice — it is deliberately
    // not defaulted, so a request that omits it is rejected. These cases are
    // about the label, so they pick one and move on.
    mode: 'live',
  }
  if (label !== undefined) payload['label'] = label
  return fastify.inject({ method: 'POST', url, cookies: { session: cookie }, payload })
}

beforeEach(async () => {
  mockMintApiKey.mockClear()
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

// The two screens post to different paths: the wizard step to its own URL,
// the standalone form to the collection it creates into.
const SCREENS = [
  { name: 'wizard step 6', url: '/setup/wizard/api-key' },
  { name: 'standalone mint page', url: '/api-keys' },
]

describe.each(SCREENS)('Journey: minting a key with no label — $name', ({ url }) => {
  it('names the field instead of surfacing a bare status code', async () => {
    const res = await mintVia(url, '')
    expect(res.statusCode).toBe(200)
    expect(res.body.toLowerCase()).toContain('label')
  })

  it('does not mention a raw HTTP status', async () => {
    const res = await mintVia(url, '')
    expect(res.body).not.toContain('status code 400')
  })

  it('never reaches the upstream mint call', async () => {
    await mintVia(url, '')
    expect(mockMintApiKey).not.toHaveBeenCalled()
  })

  it('treats whitespace as no label at all', async () => {
    await mintVia(url, '   ')
    expect(mockMintApiKey).not.toHaveBeenCalled()
  })

  it('mints once a label is given', async () => {
    const res = await mintVia(url, 'CI runner')
    expect(mockMintApiKey).toHaveBeenCalledTimes(1)
    expect(res.statusCode).toBe(200)
  })
})

describe('api key mint — mode is an explicit choice', () => {
  it('refuses a mint with no mode rather than defaulting to live', () => {
    // The dangerous default. A request that forgets the field must not
    // silently produce a key against production data, so the radio has no
    // preselection and the server does not fill one in.
    return mintWithMode('/api-keys', undefined).then((res) => {
      expect(res.statusCode).toBe(200)
      expect(res.body).toContain('Choose whether this is a live key or a test key.')
      expect(res.body).not.toContain('Save this key now')
    })
  })

  it('refuses a mode it does not recognise', () => {
    return mintWithMode('/api-keys', 'sandbox').then((res) => {
      expect(res.body).toContain('Choose whether this is a live key or a test key.')
    })
  })

  it('mints when a mode is chosen', () => {
    return mintWithMode('/api-keys', 'test').then((res) => {
      expect(res.statusCode).toBe(200)
      expect(res.body).not.toContain('Choose whether this is a live key or a test key.')
    })
  })

  it('keeps the operator’s choice when another field fails validation', () => {
    // The re-render must keep what was typed; `mode` must survive it too or
    // the operator silently re-picks (and can re-pick wrongly).
    const cookie = session()
    return fastify
      .inject({
        method: 'POST',
        url: '/api-keys',
        cookies: { session: cookie },
        payload: {
          _csrf: csrf(cookie),
          tenantId: 'default',
          label: '',
          scopeMode: 'safe-default',
          mode: 'test',
        },
      })
      .then((res) => {
        expect(res.body).toContain('Give the key a label')
        expect(res.body).toContain('value="test" checked')
      })
  })
})
