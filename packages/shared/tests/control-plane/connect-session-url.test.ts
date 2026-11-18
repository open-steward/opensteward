/**
 * The URL returned when an admin mints a Connect Link.
 *
 * The admin UI creates links through admin-api, which calls
 * integration-server over the compose network — so the inbound request's Host
 * is `integration-server:3010`. With no PUBLIC_BASE_URL and no
 * companyInfo.baseUrl, the only candidate is that internal name —
 * `http://integration-server/connect/<token>` resolves nowhere outside the
 * docker network — so the URL is withheld instead.
 *
 * The session must still be created — only the URL is withheld, so the admin
 * UI can tell the operator what to configure instead of pasting a dead link.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import { openDb } from '@opensteward/shared'
import type { DbHandle } from '@opensteward/shared'
import { ConnectSessionStore } from '../../src/auth/connect-sessions'
import { createConnectAdminRouter } from '../../src/control-plane/connect-admin-router'

let handle: DbHandle
let fastify: FastifyInstance

/** Builds the router with whatever baseUrl sources the test wants. */
async function serverWith(
  opts: { companyBaseUrl?: string | null; tenantBaseUrl?: string | null } = {},
): Promise<FastifyInstance> {
  const sessions = await ConnectSessionStore.create(handle)
  const app = Fastify({ logger: false })
  await app.register(
    createConnectAdminRouter({
      store: {} as never,
      endUsers: {} as never,
      sessions,
      getCompanyBaseUrl: () => opts.companyBaseUrl ?? null,
      ...(opts.tenantBaseUrl !== undefined
        ? { getTenantBaseUrl: () => opts.tenantBaseUrl ?? null }
        : {}),
    }),
  )
  await app.ready()
  return app
}

async function list(app: FastifyInstance, host = 'integration-server:3010') {
  const res = await app.inject({ method: 'GET', url: '/admin/connect-sessions', headers: { host } })
  return JSON.parse(res.payload)
}

/** Mints a link the way admin-api does — over the internal docker hostname. */
async function mint(app: FastifyInstance, host = 'integration-server:3010') {
  const res = await app.inject({
    method: 'POST',
    url: '/admin/connect-sessions',
    headers: { host },
    payload: { tenantId: 'default', label: 'Acme onboarding' },
  })
  return { status: res.statusCode, body: JSON.parse(res.payload) }
}

beforeEach(async () => {
  handle = await openDb({ sqlitePath: ':memory:' })
})

afterEach(async () => {
  await fastify?.close()
  await handle?.close()
  delete process.env['PUBLIC_BASE_URL']
})

describe('POST /admin/connect-sessions — the URL handed to the operator', () => {
  it('withholds the URL rather than emitting an internal hostname', async () => {
    fastify = await serverWith()
    const { body } = await mint(fastify)
    expect(body.data.url).toBeNull()
  })

  it('still creates the session when the URL cannot be resolved', async () => {
    fastify = await serverWith()
    const { status, body } = await mint(fastify)
    expect(status).toBe(201)
    expect(body.data.token).toBeTruthy()
  })

  it('says why, so the admin UI can name the fix', async () => {
    fastify = await serverWith()
    const { body } = await mint(fastify)
    expect(body.data.urlUnresolved).toBe(true)
  })

  it('uses companyInfo.baseUrl when the operator has set one', async () => {
    fastify = await serverWith({ companyBaseUrl: 'https://acme.example' })
    const { body } = await mint(fastify)
    expect(body.data.url).toMatch(/^https:\/\/acme\.example\/connect\/[a-f0-9]+$/)
    expect(body.data.urlUnresolved).toBeUndefined()
  })

  it('uses PUBLIC_BASE_URL when set', async () => {
    process.env['PUBLIC_BASE_URL'] = 'https://connect.acme.example'
    fastify = await serverWith()
    const { body } = await mint(fastify)
    expect(body.data.url).toMatch(/^https:\/\/connect\.acme\.example\/connect\//)
  })

  it('keeps emitting a URL when the request really did arrive from a browser', async () => {
    fastify = await serverWith()
    const { body } = await mint(fastify, 'localhost:3010')
    expect(body.data.url).toMatch(/^http:\/\/localhost:3010\/connect\//)
  })
})

/**
 * The same URL, everywhere a link is shown.
 *
 * Only the POST resolved one. The list handed back the raw token, so the admin
 * UI's Copy button rebuilt the address itself as
 * `companyInfo.baseUrl + '/connect/' + token`. That is wrong in two ways the
 * POST had already solved: with no company base URL it produced the bare path
 * `/connect/<token>` — which reads like a link, but resolves against the
 * ADMIN's origin rather than integration-server's — and it cannot know about a
 * tenant on its own domain.
 */
describe('GET /admin/connect-sessions — every row carries its own URL', () => {
  it('resolves a URL per row, not just for the one just minted', async () => {
    fastify = await serverWith({ companyBaseUrl: 'https://acme.example' })
    await mint(fastify)
    const body = await list(fastify)
    expect(body.data[0].url).toMatch(/^https:\/\/acme\.example\/connect\/[a-f0-9]+$/)
  })

  it('addresses the link on the tenant’s own domain when it has one', async () => {
    // The case no amount of base + token concatenation in the admin can get
    // right, because the admin does not know the tenant's domain.
    fastify = await serverWith({
      companyBaseUrl: 'https://acme.example',
      tenantBaseUrl: 'https://links.customer.example',
    })
    await mint(fastify)
    const body = await list(fastify)
    expect(body.data[0].url).toMatch(/^https:\/\/links\.customer\.example\/connect\//)
  })

  it('withholds the URL rather than emitting an internal hostname', async () => {
    fastify = await serverWith()
    await mint(fastify)
    const body = await list(fastify)
    expect(body.data[0].url).toBeUndefined()
  })

  it('never answers with a relative path, which is what the UI used to copy', async () => {
    fastify = await serverWith()
    await mint(fastify)
    const body = await list(fastify)
    expect(body.data[0].url ?? '').not.toMatch(/^\/connect\//)
  })

  it('still returns the row itself when the URL cannot be resolved', async () => {
    fastify = await serverWith()
    await mint(fastify)
    const body = await list(fastify)
    expect(body.data[0].token).toBeTruthy()
  })

  it('resolves the URL on the single-session GET too', async () => {
    fastify = await serverWith({ companyBaseUrl: 'https://acme.example' })
    const { body: created } = await mint(fastify)
    const res = await fastify.inject({
      method: 'GET',
      url: `/admin/connect-sessions/${created.data.id}`,
      headers: { host: 'integration-server:3010' },
    })
    expect(JSON.parse(res.payload).data.url).toMatch(/^https:\/\/acme\.example\/connect\//)
  })
})
