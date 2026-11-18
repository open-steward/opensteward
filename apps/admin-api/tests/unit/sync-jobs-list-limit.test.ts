/**
 * `GET /api/sync-jobs` asks integration-server for exactly the page it needs.
 *
 * It used to page LOCALLY over whatever upstream returned: `limit = Math.min(
 * page * limit + 1, 200)`, then `all.slice(start, start + limit)`, with
 * `meta.total = all.length`. Upstream's own ceiling is 200 rows, so that shape
 * hard-capped the entire table at 200 rows / 4 pages — job 201 was unreachable
 * from the admin UI at any page size, the pagination control permanently
 * disabled Next at page 4, and `meta.total` reported the size of the fetched
 * window rather than a count of anything.
 *
 * Upstream now takes an `offset` and answers with a real `meta.total`, so this
 * route forwards `limit` + `offset` and returns that total unchanged. These
 * tests pin the new contract; the previous version of this file pinned the
 * window arithmetic (`limit: 101`, `total` = window length) that the fix
 * removes, so it could not survive it.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import jwt from '@fastify/jwt'
import { registerOpenApiBridge } from '../../src/core/openapi-setup'
import { createSyncJobsRoutes } from '../../src/core/routes/sync-jobs'
import { requireAuth, requireRole } from '../../src/core/auth/jwt-auth'
import type { UnifiedClient } from '../../src/core/proxy/client'
import type { AdminStore } from '../../src/core/db/admin-store'

let app: FastifyInstance
const listSyncJobs = vi.fn()

beforeEach(async () => {
  listSyncJobs.mockReset()
  listSyncJobs.mockResolvedValue({ data: [], total: 0 })
  app = Fastify({ logger: false })
  await registerOpenApiBridge(app)
  await app.register(jwt, { secret: 'test-jwt-secret-that-is-long-enough' })
  app.decorate('authenticate', requireAuth)
  app.decorate('operatorOnly', requireRole('operator'))
  app.decorate('adminOnly', requireRole('admin'))
  const client = { listSyncJobs } as unknown as UnifiedClient
  const adminStore = { writeAudit: vi.fn() } as unknown as AdminStore
  await app.register(createSyncJobsRoutes(client, adminStore))
  await app.ready()
})

afterEach(async () => {
  await app?.close()
})

async function list(query: string) {
  const token = app.jwt.sign({ id: 'u1', username: 'admin', role: 'admin' })
  const res = await app.inject({
    method: 'GET',
    url: `/api/sync-jobs${query}`,
    headers: { authorization: `Bearer ${token}` },
  })
  return { statusCode: res.statusCode, body: res.json() }
}

const jobs = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    id: `job_${String(i).padStart(3, '0')}`,
    vertical: 'accounting',
    connectionId: 'conn_1',
    platform: 'xero',
    status: 'failed',
    createdAt: '2026-01-15T09:30:00.000Z',
  }))

/** An upstream that honours `limit`/`offset` over a fixed corpus, as the real
 *  `SyncStore.list` does. */
function upstreamWith(total: number) {
  const all = jobs(total)
  listSyncJobs.mockImplementation(
    async (opts: { limit?: number; offset?: number }) =>
      ({
        data: all.slice(opts.offset ?? 0, (opts.offset ?? 0) + (opts.limit ?? 50)),
        total,
      }) as never,
  )
  return all
}

describe('GET /api/sync-jobs pages upstream, not locally', () => {
  /**
   * The bug this task exists to close. Against the pre-change route this
   * request returned an EMPTY page: it asked upstream for
   * `Math.min(5 * 50 + 1, 200)` = 200 rows and then sliced from index 200 of a
   * 200-row array.
   */
  it('returns rows 201-250 on page 5 of 50, which used to be unreachable', async () => {
    const all = upstreamWith(250)
    const { statusCode, body } = await list('?page=5&limit=50')
    expect(statusCode).toBe(200)
    expect(listSyncJobs).toHaveBeenCalledWith(expect.objectContaining({ limit: 50, offset: 200 }))
    expect(body.data.map((j: { id: string }) => j.id)).toEqual(
      all.slice(200, 250).map((j) => j.id),
    )
    expect(body.meta).toEqual({ page: 5, limit: 50, total: 250 })
  })

  it('asks for the first page with no offset at all', async () => {
    upstreamWith(250)
    const { body } = await list('?limit=100')
    expect(listSyncJobs).toHaveBeenCalledWith(expect.objectContaining({ limit: 100, offset: 0 }))
    expect(body.data).toHaveLength(100)
    expect(body.meta).toEqual({ page: 1, limit: 100, total: 250 })
  })

  /**
   * `meta.total` is upstream's COUNT, not the number of rows on the page. The
   * fixture makes the two differ (10 rows returned, 250 matching) so a route
   * that fell back to `data.length` — the old behaviour — fails here.
   */
  it('reports the matching total, not the size of the page it returned', async () => {
    upstreamWith(250)
    const { body } = await list('?page=2&limit=10')
    expect(body.data).toHaveLength(10)
    expect(body.meta.total).toBe(250)
  })

  it('caps limit at 200 and floors page at 1, unchanged', async () => {
    upstreamWith(400)
    await list('?limit=5000')
    expect(listSyncJobs).toHaveBeenLastCalledWith(expect.objectContaining({ limit: 200 }))
    await list('?page=0&limit=50')
    expect(listSyncJobs).toHaveBeenLastCalledWith(expect.objectContaining({ offset: 0 }))
    await list('?page=-3&limit=50')
    expect(listSyncJobs).toHaveBeenLastCalledWith(expect.objectContaining({ offset: 0 }))
    // A garbage limit falls back to the 50 default, not to NaN.
    await list('?limit=abc')
    expect(listSyncJobs).toHaveBeenLastCalledWith(expect.objectContaining({ limit: 50 }))
  })
})

describe('GET /api/sync-jobs forwards the filters and the sort', () => {
  it('still forwards the original three filters and defaults to 50', async () => {
    await list('?vertical=accounting&status=failed')
    expect(listSyncJobs).toHaveBeenCalledWith({
      vertical: 'accounting',
      connection_id: undefined,
      status: 'failed',
      platform: undefined,
      tenant_id: undefined,
      id: undefined,
      connection_id_contains: undefined,
      sort: undefined,
      dir: undefined,
      limit: 50,
      offset: 0,
    })
  })

  /**
   * Each value is distinct so a param wired to the wrong upstream key shows up
   * as a wrong value rather than a coincidental match.
   */
  it('maps each new query param onto the upstream key it claims', async () => {
    await list(
      '?platform=shopify&tenant_id=acme&id=j-1&connection_id_contains=conn-sub&connection_id=conn-exact&sort=status&dir=desc',
    )
    expect(listSyncJobs).toHaveBeenCalledWith(
      expect.objectContaining({
        platform: 'shopify',
        tenant_id: 'acme',
        id: 'j-1',
        connection_id_contains: 'conn-sub',
        connection_id: 'conn-exact',
        sort: 'status',
        dir: 'desc',
      }),
    )
  })

  /**
   * `sort` and `dir` are plain strings, never a `z.enum`: an unrecognised key
   * arrives from a stale bookmark and must fall back to the default order
   * upstream, not 400 the page. `dir` normalises to `undefined` (ascending)
   * for anything that is not exactly `desc` — asserting `undefined` here
   * rather than `'asc'` is what distinguishes normalisation from a raw
   * passthrough.
   */
  it('passes an unrecognised sort key through rather than refusing it', async () => {
    const { statusCode } = await list('?sort=__proto__&dir=sideways')
    expect(statusCode).toBe(200)
    expect(listSyncJobs).toHaveBeenCalledWith(
      expect.objectContaining({ sort: '__proto__', dir: undefined }),
    )
  })

  /**
   * Fastify's parser yields an ARRAY for a repeated key. A bare `z.string()`
   * schema 400s the whole page for it; `RepeatableString` + `one()` takes the
   * last value, which is what a browser sends when a form has two controls of
   * one name. Asserting the SECOND value is what makes this bite — the first
   * would also be what a broken `v[0]` returned.
   */
  it('collapses a repeated filter key to its last value instead of 400ing', async () => {
    const { statusCode } = await list('?platform=first&platform=second&sort=a&sort=status')
    expect(statusCode).toBe(200)
    expect(listSyncJobs).toHaveBeenCalledWith(
      expect.objectContaining({ platform: 'second', sort: 'status' }),
    )
  })

  /**
   * `page`/`limit`/`connection_id` are `RepeatableString` too, not only the
   * params this task added. Adopting it on the new ones alone left
   * `?page=1&page=2` 400ing while `?sort=a&sort=b` returned 200 — a surface
   * less predictable than either extreme.
   *
   * `page=3&limit=25` → offset 50. A `v[0]` collapse gives page 1 / limit 10,
   * i.e. offset 0 and a different limit, so this distinguishes last-wins from
   * both the 400 and the wrong-value collapse.
   */
  it('collapses a repeated page, limit and connection_id instead of 400ing', async () => {
    const { statusCode } = await list(
      '?page=1&page=3&limit=10&limit=25&connection_id=conn-a&connection_id=conn-b',
    )
    expect(statusCode).toBe(200)
    expect(listSyncJobs).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 25, offset: 50, connection_id: 'conn-b' }),
    )
  })

  it('drops a blank filter rather than forwarding an empty string', async () => {
    await list('?platform=&tenant_id=%20%20')
    expect(listSyncJobs).toHaveBeenCalledWith(
      expect.objectContaining({ platform: undefined, tenant_id: undefined }),
    )
  })
})
