/**
 * Simulated /sync in the sandbox, over HTTP on a real server.
 *
 * The property under test: sync semantics — enqueue, 409-while-active, job
 * polling, progress on completion, callback_url validation — are all
 * rehearsable with a test key, and completion has the observable effect a
 * real warm-up sync has (the lists grow), while nothing leaves the process
 * (callback_url is stored, never dialed).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { buildTestServer, type TestServer } from '../integration/helpers'
import { sandboxConnectionId } from '@opensteward/shared'

const TENANT = 'default'
const VERTICAL = 'accounting'

describe('/test/v1/{vertical}/sync', () => {
  let server: TestServer
  let testKey: string
  let liveKey: string
  let connectionId: string

  beforeAll(async () => {
    server = await buildTestServer()
    const test = await server.apiKeys.mint({ tenantId: TENANT, scopes: ['*'], mode: 'test' })
    const live = await server.apiKeys.mint({ tenantId: TENANT, scopes: ['*'] })
    testKey = test.plaintext
    liveKey = live.plaintext
    connectionId = sandboxConnectionId(TENANT, VERTICAL)
  })
  afterAll(async () => {
    await server?.cleanup()
  })

  const auth = (key: string) => ({ authorization: `Bearer ${key}` })
  const syncUrl = (query = '') =>
    `/test/v1/${VERTICAL}/sync?connection_id=${connectionId}${query}`

  it('fast sync completes in-line, reports progress, and the lists actually grow', async () => {
    const before = await server.fastify.inject({
      method: 'GET',
      url: `/test/v1/${VERTICAL}/invoices?connection_id=${connectionId}`,
      headers: auth(testKey),
    })
    const beforeCount = (before.json() as { data: unknown[] }).data.length

    const res = await server.fastify.inject({
      method: 'POST',
      url: syncUrl('&fast=true'),
      headers: auth(testKey),
    })
    expect(res.statusCode).toBe(202)
    const job = res.json().data
    expect(job.status).toBe('completed')
    expect(job.platform).toBe('sandbox')
    expect(job.connectionId).toBe(connectionId)
    expect(job.progress).toBeTruthy()
    expect(job.progress.invoices.status).toBe('completed')
    expect(job.progress.invoices.synced).toBeGreaterThan(beforeCount)

    const after = await server.fastify.inject({
      method: 'GET',
      url: `/test/v1/${VERTICAL}/invoices?connection_id=${connectionId}`,
      headers: auth(testKey),
    })
    expect((after.json() as { data: unknown[] }).data.length).toBeGreaterThan(beforeCount)
  })

  it('a slow sync walks pending → completed and is pollable at GET /sync/:id', async () => {
    const res = await server.fastify.inject({
      method: 'POST',
      url: syncUrl(),
      headers: auth(testKey),
    })
    expect(res.statusCode).toBe(202)
    const job = res.json().data
    expect(job.status).toBe('pending')
    expect(job.startedAt).toBeNull()

    // Poll like a real client until the simulator finishes (~2 x 800ms).
    let polled = job
    const deadline = Date.now() + 5_000
    while (polled.status !== 'completed' && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 200))
      const poll = await server.fastify.inject({
        method: 'GET',
        url: `/test/v1/${VERTICAL}/sync/${job.id}?connection_id=${connectionId}`,
        headers: auth(testKey),
      })
      expect(poll.statusCode).toBe(200)
      polled = poll.json().data
    }
    expect(polled.status).toBe('completed')
    expect(polled.startedAt).not.toBeNull()
    expect(polled.completedAt).not.toBeNull()
  }, 10_000)

  it('409s while a job is already in flight, echoing the existing job', async () => {
    const first = await server.fastify.inject({
      method: 'POST',
      url: syncUrl(),
      headers: auth(testKey),
    })
    expect(first.statusCode).toBe(202)
    const second = await server.fastify.inject({
      method: 'POST',
      url: syncUrl(),
      headers: auth(testKey),
    })
    expect(second.statusCode).toBe(409)
    expect(second.json().error.code).toBe('SYNC_IN_PROGRESS')
    expect(second.json().data.id).toBe(first.json().data.id)

    // Drain so later tests are not blocked by this job.
    const deadline = Date.now() + 5_000
    let status = 'pending'
    while (status !== 'completed' && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 200))
      const poll = await server.fastify.inject({
        method: 'GET',
        url: `/test/v1/${VERTICAL}/sync/${first.json().data.id}?connection_id=${connectionId}`,
        headers: auth(testKey),
      })
      status = poll.json().data.status
    }
  }, 10_000)

  it('callback_url is validated (https only) and stored, never dialed', async () => {
    const bad = await server.fastify.inject({
      method: 'POST',
      url: syncUrl('&fast=true'),
      headers: { ...auth(testKey), 'content-type': 'application/json' },
      payload: { callback_url: 'http://plaintext.example.com/hook' },
    })
    expect(bad.statusCode).toBe(400)
    expect(bad.json().error.code).toBe('INVALID_CALLBACK_URL')

    const ok = await server.fastify.inject({
      method: 'POST',
      url: syncUrl('&fast=true'),
      headers: { ...auth(testKey), 'content-type': 'application/json' },
      payload: { callback_url: 'https://hooks.example.com/sync-done' },
    })
    expect(ok.statusCode).toBe(202)
    // Stored on the job for shape parity; the sandbox has no egress to dial
    // it with — the no-egress gate (check:sandbox-egress) proves that
    // structurally, so there is nothing to assert about network traffic here.
    expect(ok.json().data.callbackUrl).toBe('https://hooks.example.com/sync-done')
    expect(ok.json().data.status).toBe('completed')
  })

  it('GET /sync lists this connection’s jobs, newest first', async () => {
    const res = await server.fastify.inject({
      method: 'GET',
      url: syncUrl(),
      headers: auth(testKey),
    })
    expect(res.statusCode).toBe(200)
    const jobs = res.json().data
    expect(jobs.length).toBeGreaterThan(0)
    for (const j of jobs) expect(j.connectionId).toBe(connectionId)
  })

  it('refuses a live key, a wrong connection id, and an unknown job id', async () => {
    const live = await server.fastify.inject({
      method: 'POST',
      url: syncUrl('&fast=true'),
      headers: auth(liveKey),
    })
    expect(live.statusCode).toBe(403)

    const wrongConn = await server.fastify.inject({
      method: 'POST',
      url: `/test/v1/${VERTICAL}/sync?connection_id=${sandboxConnectionId('someone-else', VERTICAL)}&fast=true`,
      headers: auth(testKey),
    })
    expect(wrongConn.statusCode).toBe(404)

    const unknownJob = await server.fastify.inject({
      method: 'GET',
      url: `/test/v1/${VERTICAL}/sync/00000000-0000-4000-8000-000000000000?connection_id=${connectionId}`,
      headers: auth(testKey),
    })
    expect(unknownJob.statusCode).toBe(404)
  })

  it('DELETE /test/v1/reset wipes the job history too', async () => {
    const reset = await server.fastify.inject({
      method: 'DELETE',
      url: '/test/v1/reset',
      headers: auth(testKey),
    })
    expect(reset.statusCode).toBe(200)
    const list = await server.fastify.inject({
      method: 'GET',
      url: syncUrl(),
      headers: auth(testKey),
    })
    expect(list.json().data).toHaveLength(0)
  })
})
