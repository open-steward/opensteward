/**
 * `UnifiedClient.listSyncJobs` — the hop between admin-api's `/api/sync-jobs`
 * and integration-server's `/admin/sync-jobs`.
 *
 * It used to return a bare array, so `meta.total` had to be invented upstream
 * of it (`all.length` over a `page * limit + 1` window, capped at 200). It now
 * returns the page AND integration-server's real count, which is the value the
 * admin UI's pagination arithmetic runs on.
 *
 * Stands up a real Fastify server rather than mocking axios, so the query
 * string is exercised as a query string — a param dropped by the client, or
 * one sent under the wrong name, is what this catches.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import { UnifiedClient } from '../../src/core/proxy/client'

describe('UnifiedClient.listSyncJobs', () => {
  let server: FastifyInstance
  let client: UnifiedClient
  let lastQuery: Record<string, unknown> = {}
  /** What the fake integration-server answers next. */
  let reply: unknown = { data: [], meta: { total: 0 } }

  beforeAll(async () => {
    server = Fastify({ logger: false })
    server.get('/admin/sync-jobs', async (request) => {
      lastQuery = request.query as Record<string, unknown>
      return reply
    })
    const address = await server.listen({ port: 0, host: '127.0.0.1' })
    client = new UnifiedClient({ url: address })
  })

  afterAll(async () => {
    await server.close()
  })

  it('sends every filter, the sort and the window as query params', async () => {
    reply = { data: [], meta: { total: 0 } }
    await client.listSyncJobs({
      vertical: 'crm',
      connection_id: 'conn-exact',
      connection_id_contains: 'conn-sub',
      status: 'failed',
      platform: 'shopify',
      tenant_id: 'acme',
      id: 'j-1',
      sort: 'status',
      dir: 'desc',
      limit: 25,
      offset: 75,
    })
    // Distinct values throughout, so a param sent under the wrong name shows
    // up as a wrong value rather than matching by coincidence.
    expect(lastQuery).toEqual({
      vertical: 'crm',
      connection_id: 'conn-exact',
      connection_id_contains: 'conn-sub',
      status: 'failed',
      platform: 'shopify',
      tenant_id: 'acme',
      id: 'j-1',
      sort: 'status',
      dir: 'desc',
      limit: '25',
      offset: '75',
    })
  })

  it("returns integration-server's own total, not the length of the page", async () => {
    // The two differ on purpose: a client falling back to `data.length` — the
    // pre-fix behaviour — would report 2 here.
    reply = { data: [{ id: 'j-1' }, { id: 'j-2' }], meta: { total: 250 } }
    const { data, total } = await client.listSyncJobs({ limit: 2 })
    expect(data).toHaveLength(2)
    expect(total).toBe(250)
  })

  it('falls back to the page length when an older integration-server sends no meta', async () => {
    reply = { data: [{ id: 'j-1' }, { id: 'j-2' }] }
    const { total } = await client.listSyncJobs()
    expect(total).toBe(2)
  })

  it('answers an empty page rather than throwing when there is no data key at all', async () => {
    reply = {}
    expect(await client.listSyncJobs()).toEqual({ data: [], total: 0 })
  })
})
