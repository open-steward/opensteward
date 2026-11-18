/**
 * What the mint screens show must match what the server actually mints: on
 * both the standalone /api-keys/new page and wizard step 6, the scope set is
 * serialised from the server's SAFE_DEFAULT_SCOPES, never embedded as an
 * inline copy — an embedded copy can drift, and in Custom mode stale values
 * would be pre-checked and then really minted.
 */
import type { FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SAFE_DEFAULT_SCOPES } from '../../src/core/routes/api-keys-defaults.js'
import { KNOWN_VERTICALS } from '../../src/core/verticals.js'

vi.mock('../../src/core/proxy/admin-api-client', async () => {
  // `await import`: vi.mock is hoisted above this file's imports, but the
  // factory body runs later, so it can import what the top level cannot.
  const { adminApiStub } = await import('../helpers/admin-api-stub')
  return {
    AdminApiClient: adminApiStub({
      getLoginOptions: async () => ({ providers: [], localLoginEnabled: true }),
      getDataStoreMetrics: async () => ({
        mode: 'database',
        rows: { total: 0 },
        db_size_mb: 0,
        sync_jobs: { pending: 0, running: 0 },
      }),
      // listTenants, listApiKeys and listConnections are left to the stub's
      // read defaults — this file does not care what they return, and does not
      // break when a route starts calling one.
    }),
  }
})

const { buildServer } = await import('../../src/core/server')

const SESSION_SECRET = 'api-key-mint-scopes-secret-long-enough'
let fastify: FastifyInstance

function session() {
  return fastify.signCookie(
    JSON.stringify({ id: 'u1', username: 'admin', role: 'admin', token: 'jwt' }),
  )
}

/** The scope set the page pre-checks for the safe-default preset. */
function embeddedSafeDefaults(body: string): string[] {
  const m = body.match(/OST_SAFE_DEFAULT_SCOPES\s*=\s*new Set\(\s*(\[[\s\S]*?\])\s*\)/)
  if (!m) throw new Error('safe-default set not found in page')
  // Tolerate either JSON or single-quoted encodings so the test states the
  // requirement, not the encoding.
  try {
    return JSON.parse(m[1]) as string[]
  } catch {
    return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1])
  }
}

/** Every scope the checkbox grid offers. */
function offeredScopes(body: string): string[] {
  return [...body.matchAll(/name="scopes"[^>]*value="([^"]+)"/g)].map((m) => m[1])
}

beforeEach(async () => {
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

const PAGES = [
  { name: 'standalone mint page', url: '/api-keys/new' },
  { name: 'wizard step 6', url: '/setup/wizard/api-key' },
]

describe.each(PAGES)('Journey: minting a dev API key — $name', ({ url }) => {
  it('pre-checks exactly the scopes the server will mint', async () => {
    const res = await fastify.inject({ method: 'GET', url, cookies: { session: session() } })
    expect(res.statusCode).toBe(200)
    expect(embeddedSafeDefaults(res.body).sort()).toEqual([...SAFE_DEFAULT_SCOPES].sort())
  })

  it('offers a checkbox for every vertical, so Custom can reach them all', async () => {
    const res = await fastify.inject({ method: 'GET', url, cookies: { session: session() } })
    const offered = offeredScopes(res.body)
    const missing = KNOWN_VERTICALS.filter((v) => !offered.includes(`vertical:${v}`))
    expect(missing).toEqual([])
  })

  it('names the payments vertical among them', async () => {
    // The concrete case: payments must be present in the safe default.
    const res = await fastify.inject({ method: 'GET', url, cookies: { session: session() } })
    expect(embeddedSafeDefaults(res.body)).toContain('vertical:payments')
  })
})
