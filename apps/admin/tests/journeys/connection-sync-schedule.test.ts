/**
 * Choosing how often a connection syncs, from its page.
 *
 * The page states the schedule in words, when it last synced and when it
 * will next — the same answer the scheduler acts on — and lets an operator
 * change it. A bad interval is reported in place, keeping the operator on the
 * connection.
 */
import type { FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flashOf } from '../helpers/flash'
import { createHmac } from 'crypto'

const mockGetConnection = vi.fn()
const mockSetSchedule = vi.fn()

vi.mock('../../src/core/proxy/admin-api-client', async () => {
  const { adminApiStub } = await import('../helpers/admin-api-stub')
  return {
    AdminApiClient: adminApiStub({
      getConnection: mockGetConnection,
      setConnectionSyncSchedule: mockSetSchedule,
      getLoginOptions: async () => ({ providers: [], localLoginEnabled: true }),
      getCompanyInfo: async () => null,
    }),
  }
})

const { buildServer } = await import('../../src/core/server')

const SESSION_SECRET = 'connection-sync-schedule-secret-long-enough'
const SYNC = {
  mode: 'default',
  intervalMinutes: null,
  effectiveIntervalMinutes: 360,
  defaultIntervalMinutes: 360,
  lastSyncedAt: 1_769_949_600_000,
  lastAttemptAt: 1_769_949_600_000,
  lastStatus: 'completed',
  consecutiveFailures: 0,
  active: false,
  nextSyncAt: 4_102_444_800_000,
  pausedReason: null,
}
const CONN = {
  id: '9f8e7d6c-1111-4a2b-8c3d-000000000001',
  vertical: 'accounting',
  platform: 'fortnox',
  label: 'Acme Books',
  status: 'valid',
  createdAt: '2026-01-15T09:30:00.000Z',
  updatedAt: '2026-02-01T10:00:00.000Z',
  syncMode: 'default',
  syncIntervalMinutes: null,
  sync: SYNC,
}
const DETAIL = `/connections/accounting/${CONN.id}`

let fastify: FastifyInstance

function cookie(role = 'admin') {
  return fastify.signCookie(JSON.stringify({ id: 'u1', username: 'admin', role, token: 'jwt' }))
}
function csrf(c: string) {
  return createHmac('sha256', SESSION_SECRET).update(c).digest('hex').slice(0, 32)
}
const get = (role = 'admin') =>
  fastify.inject({ method: 'GET', url: DETAIL, cookies: { session: cookie(role) } })
function save(body: Record<string, string>, role = 'admin') {
  const c = cookie(role)
  return fastify.inject({
    method: 'POST',
    url: `${DETAIL}/sync-schedule`,
    cookies: { session: c },
    payload: { _csrf: csrf(c), ...body },
  })
}

beforeEach(async () => {
  mockGetConnection.mockReset().mockResolvedValue(CONN)
  mockSetSchedule.mockReset().mockResolvedValue(CONN)
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

describe('Journey: reading a connection’s sync schedule', () => {
  it('states the schedule, when it last synced and when it next will', async () => {
    const res = await get()
    expect(res.body).toContain('data-sync-schedule')
    expect(res.body).toContain('Default schedule — every 6 hours')
    expect(res.body).toContain('Last synced:')
    expect(res.body).toContain('Next sync:')
  })

  it('offers the four modes with the current one chosen', async () => {
    const res = await get()
    expect(res.body).toContain(`action="${DETAIL}/sync-schedule"`)
    expect(res.body).toMatch(/name="syncMode" value="default" checked/)
    for (const m of ['custom', 'trigger_only', 'once']) {
      expect(res.body).toContain(`name="syncMode" value="${m}"`)
    }
  })

  it('shows a viewer the schedule without a way to change it', async () => {
    const res = await get('viewer')
    expect(res.body).toContain('Default schedule — every 6 hours')
    expect(res.body).not.toContain(`action="${DETAIL}/sync-schedule"`)
  })

  it('says why a schedule is paused', async () => {
    mockGetConnection.mockResolvedValue({
      ...CONN,
      sync: { ...SYNC, nextSyncAt: null, pausedReason: 'needs_reauthorization' },
    })
    expect((await get()).body).toContain('Paused until the customer re-authorizes')
  })

  it('explains that passthrough mode syncs nothing', async () => {
    mockGetConnection.mockResolvedValue({ ...CONN, sync: null })
    const res = await get()
    expect(res.body).toContain('passthrough mode')
    expect(res.body).not.toContain('Sync status unavailable')
    expect(res.body).not.toContain(`action="${DETAIL}/sync-schedule"`)
  })

  it('tells a server too old to report sync status apart from passthrough', async () => {
    const { sync: _omitted, ...withoutSync } = CONN
    mockGetConnection.mockResolvedValue(withoutSync)
    const res = await get()
    expect(res.body).toContain('Sync status unavailable from this server version.')
    expect(res.body).toContain('Last synced: Unknown · Next sync: Unknown')
    expect(res.body).not.toContain('passthrough mode')
    expect(res.body).toContain(`action="${DETAIL}/sync-schedule"`)
  })
})

describe('Journey: changing it', () => {
  it('saves a custom interval in minutes', async () => {
    const res = await save({
      syncMode: 'custom',
      syncIntervalValue: '2',
      syncIntervalUnit: 'hours',
    })
    expect(mockSetSchedule).toHaveBeenCalledWith('jwt', 'accounting', CONN.id, {
      mode: 'custom',
      intervalMinutes: 120,
    })
    expect(res.headers.location).toBe(DETAIL)
    expect(flashOf(fastify, res)[0]).toMatchObject({
      tone: 'success',
      body: 'Sync schedule saved.',
    })
  })

  it('saves trigger only', async () => {
    await save({ syncMode: 'trigger_only' })
    expect(mockSetSchedule).toHaveBeenCalledWith('jwt', 'accounting', CONN.id, {
      mode: 'trigger_only',
    })
  })

  it('lets an operator save, not only an admin', async () => {
    const res = await save({ syncMode: 'once' }, 'operator')
    expect(mockSetSchedule).toHaveBeenCalledWith('jwt', 'accounting', CONN.id, { mode: 'once' })
    expect(res.headers.location).toBe(DETAIL)
  })

  // `flashError` queues tone 'danger' — the flash module's tones are
  // success | danger | warning | info; there is no 'error'.
  it.each([
    [
      { syncMode: 'custom', syncIntervalValue: '10', syncIntervalUnit: 'minutes' },
      'The shortest custom interval is 15 minutes.',
    ],
    [
      { syncMode: 'custom', syncIntervalValue: '1.5', syncIntervalUnit: 'hours' },
      'Enter a whole number for the custom interval.',
    ],
    [{ syncMode: '' }, 'Choose a sync schedule.'],
  ])('reports %j in place without saving', async (body, message) => {
    const res = await save(body)
    expect(mockSetSchedule).not.toHaveBeenCalled()
    expect(res.headers.location).toBe(DETAIL)
    expect(flashOf(fastify, res)[0]).toMatchObject({ tone: 'danger', body: message })
  })

  it('reports a refusal from the backend in place', async () => {
    mockSetSchedule.mockRejectedValue(
      Object.assign(new Error('nope'), {
        response: { status: 400, data: { error: 'Bad schedule' } },
      }),
    )
    const res = await save({ syncMode: 'once' })
    expect(res.headers.location).toBe(DETAIL)
    expect(flashOf(fastify, res)[0]).toMatchObject({ tone: 'danger', body: 'Bad schedule' })
  })

  it('refuses a viewer even if they craft the POST', async () => {
    const res = await save({ syncMode: 'once' }, 'viewer')
    expect(res.statusCode).toBe(403)
    expect(mockSetSchedule).not.toHaveBeenCalled()
  })
})
