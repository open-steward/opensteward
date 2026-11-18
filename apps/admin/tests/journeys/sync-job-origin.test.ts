/**
 * The Sync jobs table says why each job ran — under its Created time, worded
 * by `originLabel` (core/views/sync-schedule.ts). Older jobs carry no origin
 * and show nothing extra.
 */
import type { FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const job = (id: string, origin: string | null) => ({
  id,
  vertical: 'accounting',
  connectionId: 'conn_9f8e7d6c-1111-4a2b-8c3d-000000000001',
  platform: 'fortnox',
  tenantId: 'default',
  status: 'completed',
  progress: null,
  error: null,
  callbackUrl: null,
  createdAt: '2026-01-15T09:30:00.000Z',
  startedAt: null,
  completedAt: null,
  origin,
})

vi.mock('../../src/core/proxy/admin-api-client', async () => {
  const { adminApiStub } = await import('../helpers/admin-api-stub')
  return {
    AdminApiClient: adminApiStub({
      listSyncJobsPaged: async () => ({
        data: [job('job_scheduled', 'schedule'), job('job_older', null)],
        meta: { page: 1, limit: 50, total: 2, pages: 1 },
      }),
      getLoginOptions: async () => ({ providers: [], localLoginEnabled: true }),
      getCompanyInfo: async () => null,
    }),
  }
})

const { buildServer } = await import('../../src/core/server')

let fastify: FastifyInstance

beforeEach(async () => {
  const built = await buildServer({
    server: { port: 0, host: '127.0.0.1' },
    session: { secret: 'sync-job-origin-secret-long-enough' },
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

describe('Journey: a sync job says why it ran', () => {
  it('labels a scheduled job, and adds nothing for a job without an origin', async () => {
    const session = fastify.signCookie(
      JSON.stringify({ id: 'u1', username: 'admin', role: 'admin', token: 'jwt' }),
    )
    const res = await fastify.inject({ method: 'GET', url: '/sync-jobs', cookies: { session } })
    const origins = res.body.match(/<span[^>]*data-origin="[^"]*"[^>]*>[^<]*<\/span>/g) ?? []
    expect(origins).toEqual([expect.stringMatching(/data-origin="schedule"[^>]*>Scheduled</)])
  })
})
