/**
 * What the operator is told when enqueuing a sync fails.
 *
 * The proxy swallowed every upstream failure (`catch { return null }`) and the
 * route turned that single `null` into one generic
 * `500 'Failed to enqueue sync job (passthrough mode? connection unknown?)'`.
 * So the three cases an operator can actually act on were indistinguishable:
 *
 *   - 409 SYNC_IN_PROGRESS — a sync is already running; nothing is wrong
 *   - 404 CONNECTION_NOT_FOUND — wrong id
 *   - route absent — the deployment runs DATA_STORE_MODE=passthrough, so there
 *     is no sync engine at all
 *
 * A "Sync now" button reporting "500 server error" for "it's already running"
 * trains operators to ignore it.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import jwt from '@fastify/jwt'
import { registerOpenApiBridge } from '../../src/core/openapi-setup'
import { createSyncJobsRoutes } from '../../src/core/routes/sync-jobs'
import { requireAuth, requireRole } from '../../src/core/auth/jwt-auth'
import type { UnifiedClient } from '../../src/core/proxy/client'
import type { AdminStore } from '../../src/core/db/admin-store'

const JOB = {
  id: 'job_1',
  vertical: 'accounting',
  platform: 'fortnox',
  connectionId: 'conn-1',
  status: 'pending',
  createdAt: '2026-08-24T10:00:00.000Z',
  updatedAt: '2026-08-24T10:00:00.000Z',
}

let app: FastifyInstance
const createSyncJob = vi.fn()

/** An error shaped the way axios reports an upstream refusal. */
function upstream(status: number, code: string, message: string) {
  return Object.assign(new Error(`Request failed with status code ${status}`), {
    isAxiosError: true,
    response: { status, data: { error: { code, message } } },
  })
}

beforeEach(async () => {
  createSyncJob.mockReset()
  app = Fastify({ logger: false })
  await registerOpenApiBridge(app)
  await app.register(jwt, { secret: 'test-jwt-secret-that-is-long-enough' })
  app.decorate('authenticate', requireAuth)
  app.decorate('operatorOnly', requireRole('operator'))
  app.decorate('adminOnly', requireRole('admin'))
  const client = { createSyncJob } as unknown as UnifiedClient
  const adminStore = { writeAudit: vi.fn() } as unknown as AdminStore
  await app.register(createSyncJobsRoutes(client, adminStore))
  await app.ready()
})

afterEach(async () => {
  await app?.close()
})

async function enqueue(connectionId = 'conn-1') {
  const token = app.jwt.sign({ id: 'u1', username: 'admin', role: 'admin' })
  const res = await app.inject({
    method: 'POST',
    url: '/api/sync-jobs',
    headers: { authorization: `Bearer ${token}` },
    payload: { connection_id: connectionId },
  })
  return { statusCode: res.statusCode, body: res.json() }
}

describe('POST /api/sync-jobs failure reporting', () => {
  it('accepts a job when the enqueue succeeds', async () => {
    createSyncJob.mockResolvedValue(JOB)
    const { statusCode } = await enqueue()
    expect(statusCode).toBe(202)
  })

  it('passes through "already running" as 409, not a server error', async () => {
    createSyncJob.mockRejectedValue(
      upstream(409, 'SYNC_IN_PROGRESS', 'Sync job_9 is already running for this connection.'),
    )
    const { statusCode, body } = await enqueue()
    expect(statusCode).toBe(409)
    expect(String(body.error)).toMatch(/already running/i)
  })

  it('passes through an unknown connection as 404', async () => {
    createSyncJob.mockRejectedValue(
      upstream(404, 'CONNECTION_NOT_FOUND', 'No connection with id conn-x.'),
    )
    const { statusCode } = await enqueue('conn-x')
    expect(statusCode).toBe(404)
  })

  it('explains a passthrough deployment rather than blaming the server', async () => {
    // With DATA_STORE_MODE=passthrough the upstream route is not mounted at all.
    createSyncJob.mockRejectedValue(
      Object.assign(new Error('Request failed with status code 404'), {
        isAxiosError: true,
        response: { status: 404, data: { message: 'Route POST:/admin/sync-jobs not found' } },
      }),
    )
    const { statusCode, body } = await enqueue()
    expect(statusCode).toBe(404)
    expect(String(body.error).toLowerCase()).toMatch(/sync|passthrough|not found/)
  })

  it('reports an unreachable integration-server as 502, not 500', async () => {
    // What axios actually throws when the connection never lands: the flag is
    // set, there is no response. Blaming this service with a 500 points the
    // operator at the wrong box.
    createSyncJob.mockRejectedValue(
      Object.assign(new Error('socket hang up'), { isAxiosError: true, response: undefined }),
    )
    const { statusCode } = await enqueue()
    expect(statusCode).toBe(502)
  })

  it('still reports a bug in this service as 500', async () => {
    // A plain Error is our own fault, not a gateway problem.
    createSyncJob.mockRejectedValue(new TypeError('cannot read properties of undefined'))
    const { statusCode } = await enqueue()
    expect(statusCode).toBe(500)
  })

  it('still rejects a missing connection_id as 400', async () => {
    const token = app.jwt.sign({ id: 'u1', username: 'admin', role: 'admin' })
    const res = await app.inject({
      method: 'POST',
      url: '/api/sync-jobs',
      headers: { authorization: `Bearer ${token}` },
      payload: {},
    })
    expect(res.statusCode).toBe(400)
  })
})
