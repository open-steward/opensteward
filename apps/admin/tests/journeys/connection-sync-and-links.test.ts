/**
 * Acting on a connection from the admin UI.
 *
 * Three properties this pins, so an expired connection can always be acted on
 * from the browser:
 *
 *  - The connection detail page offers a sync trigger, and the trigger must
 *    surface refusals — never redirect as though the job had been queued when
 *    it was refused.
 *  - The list links the label — what the operator named the connection —
 *    because rows linked by platform name all read identically.
 *  - The detail page carries the re-authorize and label actions, so acting
 *    never means reading a URL out of an alert.
 */
import type { FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flashOf, flashCookieOf } from '../helpers/flash'
import { createHmac } from 'crypto'

const mockListConnectionsPaged = vi.fn()
const mockGetConnection = vi.fn()
const mockCreateSyncJob = vi.fn()

vi.mock('../../src/core/proxy/admin-api-client', async () => {
  // `await import`: vi.mock is hoisted above this file's imports, but the
  // factory body runs later, so it can import what the top level cannot.
  const { adminApiStub } = await import('../helpers/admin-api-stub')
  return {
    AdminApiClient: adminApiStub({
      listConnectionsPaged: mockListConnectionsPaged,
      getConnection: mockGetConnection,
      createSyncJob: mockCreateSyncJob,
      getLoginOptions: async () => {
        return { providers: [], localLoginEnabled: true }
      },
      getCompanyInfo: async () => {
        return null
      },
    }),
  }
})

const { buildServer } = await import('../../src/core/server')

const SESSION_SECRET = 'connection-sync-session-secret-long-enough'
const LABELLED = {
  id: '9f8e7d6c-1111-4a2b-8c3d-000000000001',
  vertical: 'accounting',
  platform: 'fortnox',
  label: 'Acme Books',
  status: 'valid',
  createdAt: '2026-01-15T09:30:00.000Z',
  updatedAt: '2026-02-01T10:00:00.000Z',
}
/** Routine: anything connected via /auth/{vertical}/{platform}/connect without ?label=. */
const UNLABELLED = { ...LABELLED, id: 'aa11bb22-2222-4a2b-8c3d-000000000002', label: null }

let fastify: FastifyInstance

function cookie(role = 'admin') {
  return fastify.signCookie(JSON.stringify({ id: 'u1', username: 'admin', role, token: 'jwt' }))
}
function csrf(c: string) {
  return createHmac('sha256', SESSION_SECRET).update(c).digest('hex').slice(0, 32)
}

beforeEach(async () => {
  mockCreateSyncJob.mockReset()
  mockCreateSyncJob.mockResolvedValue({ id: 'job_1' })
  mockListConnectionsPaged.mockResolvedValue({
    data: [LABELLED, UNLABELLED],
    meta: { page: 1, limit: 50, total: 2 },
  })
  mockGetConnection.mockResolvedValue(LABELLED)
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

function get(url: string, role = 'admin') {
  return fastify.inject({ method: 'GET', url, cookies: { session: cookie(role) } })
}
function syncPost(role = 'admin', body: Record<string, string> = {}) {
  const c = cookie(role)
  return fastify.inject({
    method: 'POST',
    url: `/connections/accounting/${LABELLED.id}/sync`,
    cookies: { session: c },
    payload: { _csrf: csrf(c), ...body },
  })
}

describe('Journey: the label identifies the connection', () => {
  it('links the label, not the platform name', async () => {
    const res = await get('/connections')
    expect(res.body).toMatch(
      new RegExp(`<a href="/connections/accounting/${LABELLED.id}"[^>]*>\\s*Acme Books`),
    )
  })

  it('falls back to the id when a connection has no label, never a bare dash', async () => {
    const res = await get('/connections')
    expect(res.body).toMatch(
      new RegExp(`<a href="/connections/accounting/${UNLABELLED.id}"[^>]*>\\s*aa11bb22`),
    )
    expect(res.body).not.toMatch(/<a href="\/connections\/[^"]+"[^>]*>\s*—\s*<\/a>/)
  })

  it('still shows the platform, as its own column', async () => {
    const res = await get('/connections')
    expect(res.body).toContain('fortnox')
  })
})

describe('Journey: triggering a sync', () => {
  it('offers the action on the list and the detail page', async () => {
    expect((await get('/connections')).body).toContain('Sync now')
    expect((await get(`/connections/accounting/${LABELLED.id}`)).body).toContain('Sync now')
  })

  it('queues the job for the connection the operator pressed', async () => {
    const res = await syncPost()
    expect(mockCreateSyncJob).toHaveBeenCalledWith('jwt', LABELLED.id)
    expect(res.statusCode).toBe(302)
  })

  it('returns to the list when pressed from the list', async () => {
    const res = await syncPost('admin', { returnTo: 'list' })
    // Bare path — the outcome travels in the flash, not the address.
    expect(res.headers.location).toBe('/connections')
    expect(flashOf(fastify, res)[0]).toMatchObject({ tone: 'success' })
  })

  it('returns to the connection when pressed from its own page', async () => {
    const res = await syncPost()
    expect(res.headers.location).toBe(`/connections/accounting/${LABELLED.id}`)
    expect(flashOf(fastify, res)[0]).toMatchObject({ tone: 'success' })
  })

  it('reports a refusal instead of pretending it worked', async () => {
    // The common case: a sync is already running for this connection.
    mockCreateSyncJob.mockRejectedValue(
      Object.assign(new Error('Request failed with status code 409'), {
        response: {
          status: 409,
          data: {
            error: {
              code: 'SYNC_IN_PROGRESS',
              message: 'Sync job_9 is already running for this connection.',
            },
          },
        },
      }),
    )
    const res = await syncPost()
    // Proves the message reaches the operator AND that it is toned as a
    // failure — which a query string could never express.
    const [message] = flashOf(fastify, res)
    expect(message.tone).toBe('danger')
    expect(message.body).toContain('already running')
  })

  it('shows the queued message once, on the page it returns to', async () => {
    const queued = await syncPost()
    const page = await fastify.inject({
      method: 'GET',
      url: `/connections/accounting/${LABELLED.id}`,
      cookies: { session: cookie('admin'), os_flash: flashCookieOf(queued)! },
    })
    expect(page.body).toContain('Sync queued')
  })

  it('does not repeat the queued message when the operator navigates back', async () => {
    // The load-bearing property: the same URL with no cookie has nothing to
    // say — outcomes are events, not addresses.
    const page = await get(`/connections/accounting/${LABELLED.id}`)
    expect(page.body).not.toContain('Sync queued')
  })

  it('hides the action from a viewer, who cannot enqueue one', async () => {
    const res = await get('/connections', 'viewer')
    expect(res.body).not.toContain('Sync now')
  })

  it('refuses the POST from a viewer even if they craft it', async () => {
    const res = await syncPost('viewer')
    expect(mockCreateSyncJob).not.toHaveBeenCalled()
    expect(res.statusCode).not.toBe(302)
  })
})

describe('Journey: a connection whose refresh keeps failing', () => {
  it('says why the last refresh failed', async () => {
    mockGetConnection.mockResolvedValue({
      ...LABELLED,
      status: 'expired',
      lastRefreshAt: '2026-08-24T14:55:01.788Z',
      lastRefreshStatus: 'failed',
      lastRefreshError: 'invalid_grant — Refresh token has expired — HTTP 400',
    })
    const res = await get(`/connections/accounting/${LABELLED.id}`)
    expect(res.body).toContain('invalid_grant')
    expect(res.body).toContain('Refresh token has expired')
  })

  it('admits when no reason was recorded rather than showing a blank', async () => {
    mockGetConnection.mockResolvedValue({
      ...LABELLED,
      status: 'expired',
      lastRefreshAt: '2026-08-24T14:55:01.788Z',
      lastRefreshStatus: 'failed',
      lastRefreshError: null,
    })
    const res = await get(`/connections/accounting/${LABELLED.id}`)
    expect(res.body).toContain('No reason recorded')
  })

  it('offers Mint Connect Link when the connection is expired', async () => {
    // Re-authorisation is the customer's to do, through a Connect Link. The
    // old Reconnect button linked /auth/…/connect, which the admin origin does
    // not serve — it went nowhere.
    mockGetConnection.mockResolvedValue({ ...LABELLED, status: 'expired' })
    const res = await get(`/connections/accounting/${LABELLED.id}`)
    expect(res.body).toContain('Mint Connect Link')
    expect(res.body).toContain('href="/connect-links/new"')
    expect(res.body).not.toContain('/auth/accounting/fortnox/connect')
  })

  it('does not offer Mint Connect Link for a healthy connection', async () => {
    const res = await get(`/connections/accounting/${LABELLED.id}`)
    expect(res.body).not.toContain('Mint Connect Link')
  })

  it('does not offer a viewer the mint form, which they cannot open', async () => {
    mockGetConnection.mockResolvedValue({ ...LABELLED, status: 'expired' })
    const res = await get(`/connections/accounting/${LABELLED.id}`, 'viewer')
    expect(res.body).not.toContain('href="/connect-links/new"')
  })
})
