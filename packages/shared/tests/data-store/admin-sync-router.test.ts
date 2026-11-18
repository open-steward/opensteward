/**
 * `GET /admin/sync-jobs` — the cross-vertical index the admin UI's /sync-jobs
 * page reads through admin-api.
 *
 * This is the surface the 200-row ceiling lived on. admin-api used to ask for
 * `Math.min(page * limit + 1, 200)` rows and slice locally, because this route
 * offered no `offset` and no count at all. It now takes an offset and answers
 * `{ data, meta: { total } }`, where `total` is a real COUNT over the same
 * filter the page was fetched with.
 *
 * `meta` is ADDITIVE: `data` keeps its place and its shape, so a caller
 * reading `data.data` (which is exactly what admin-api's client did before
 * this task) is unaffected.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import { openDb } from '@opensteward/shared'
import type { DbHandle } from '@opensteward/shared'
import { createAdminSyncRouter } from '../../src/data-store/admin-sync-router'
import { SyncStore } from '../../src/data-store/sync-store'
import type { CredentialStore } from '../../src/auth/store'

let app: FastifyInstance
let handle: DbHandle | undefined

const OLD_SECRET = process.env['ADMIN_SECRET']

beforeEach(() => {
  process.env['ADMIN_SECRET'] = 'test-admin-secret'
})

afterEach(async () => {
  await app?.close()
  await handle?.close()
  handle = undefined
  if (OLD_SECRET === undefined) delete process.env['ADMIN_SECRET']
  else process.env['ADMIN_SECRET'] = OLD_SECRET
})

async function build(store: unknown): Promise<FastifyInstance> {
  app = Fastify({ logger: false })
  await app.register(
    createAdminSyncRouter({
      syncStore: store as unknown as SyncStore,
      credentialStore: {} as unknown as CredentialStore,
    }),
  )
  await app.ready()
  return app
}

function get(url: string) {
  return app.inject({ method: 'GET', url, headers: { 'x-admin-secret': 'test-admin-secret' } })
}

/** A real store on SQLite, seeded with `n` jobs whose ids sort by age. */
async function seededStore(n: number): Promise<SyncStore> {
  handle = await openDb({ sqlitePath: ':memory:' })
  const store = await SyncStore.create(handle)
  for (let i = 0; i < n; i++) {
    await handle.kysely
      .insertInto('sync_jobs')
      .values({
        id: `j-${String(i).padStart(3, '0')}`,
        vertical: i % 2 === 0 ? 'accounting' : 'crm',
        connection_id: `conn-${i}`,
        platform: 'fortnox',
        tenant_id: null,
        status: 'pending',
        progress: null,
        error: null,
        callback_url: null,
        created_at: 1000 + i,
      })
      .execute()
  }
  return store
}

describe('GET /admin/sync-jobs pages at the store', () => {
  /**
   * The bug, at this layer. 250 jobs is past the old 200-row ceiling
   * entirely — before this route took an offset there was no request that
   * could return job 201, and `total` could not exceed 200 either.
   */
  it('reaches row 201 and reports a total past the old 200-row ceiling', async () => {
    await build(await seededStore(250))
    const res = await get('/admin/sync-jobs?limit=50&offset=200')
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.meta.total).toBe(250)
    expect(body.data).toHaveLength(50)
    // Newest first, so an offset of 200 lands on the fifty oldest.
    expect(body.data[0].id).toBe('j-049')
    expect(body.data[49].id).toBe('j-000')
  })

  /**
   * End-to-end, over a real store: the page an operator gets is the size they
   * asked for, bounded by the ceiling.
   *
   * This CANNOT stand alone as the guard for the router's own clamp, and an
   * earlier version of this file made exactly that mistake: `SyncStore.list`
   * applies the identical 50 default and 200 ceiling itself, so deleting
   * `Math.min(…, 200)` from the router leaves every assertion here passing —
   * all three expected values are also what the broken path returns. The
   * boundary assertion against the mocked store, below, is the one that
   * bites; this one only proves the two clamps agree.
   */
  it('answers with the page size the caller asked for, bounded by the ceiling', async () => {
    await build(await seededStore(250))
    expect((await get('/admin/sync-jobs')).json().data).toHaveLength(50)
    expect((await get('/admin/sync-jobs?limit=500')).json().data).toHaveLength(200)
    expect((await get('/admin/sync-jobs?limit=10')).json().data).toHaveLength(10)
  })

  it('counts the rows matching the filter, not the rows on the page', async () => {
    await build(await seededStore(120))
    const res = await get('/admin/sync-jobs?vertical=crm&limit=10')
    const body = res.json()
    expect(body.data).toHaveLength(10)
    // Half the seed is crm, and the total must speak for all of them.
    expect(body.meta.total).toBe(60)
  })
})

describe('GET /admin/sync-jobs forwards every filter and the sort to the store', () => {
  const list = vi.fn(async () => [])
  const count = vi.fn(async () => 0)

  beforeEach(() => {
    list.mockClear()
    count.mockClear()
  })

  /**
   * Each value is distinct so a param wired to the wrong store field shows up
   * as a wrong value rather than a coincidental match — `platform=shopify`
   * landing on `idContains` would be invisible if both were the same string.
   */
  it('maps each query param onto the store field it claims', async () => {
    await build({ list, count })
    await get(
      '/admin/sync-jobs?vertical=crm&platform=shopify&connection_id=conn-exact&connection_id_contains=conn-sub&tenant_id=acme&id=j-1&status=failed&sort=status&dir=desc&limit=25&offset=75',
    )
    expect(list).toHaveBeenCalledWith({
      vertical: 'crm',
      platform: 'shopify',
      connectionId: 'conn-exact',
      connectionIdContains: 'conn-sub',
      tenantId: 'acme',
      idContains: 'j-1',
      status: 'failed',
      sort: 'status',
      dir: 'desc',
      limit: 25,
      offset: 75,
    })
  })

  /**
   * `count` must see the same predicate as `list` and NOTHING that shapes the
   * page: a count carrying the page's own `limit` would report the page size
   * as the total, which is the defect this whole task exists to remove.
   */
  it('counts through the same filter, without the paging or the sort', async () => {
    await build({ list, count })
    await get('/admin/sync-jobs?vertical=crm&platform=shopify&sort=status&limit=25&offset=75')
    expect(count).toHaveBeenCalledWith({
      vertical: 'crm',
      platform: 'shopify',
      connectionId: undefined,
      connectionIdContains: undefined,
      tenantId: undefined,
      idContains: undefined,
      status: undefined,
    })
  })

  /**
   * Fastify's parser yields an ARRAY for a repeated key, and an array reaching
   * `filter.platform.toLowerCase()` in the store is an unhandled 500. Last
   * value wins — the same rule admin-api's `_query.ts` and the admin app's
   * `table-controls.ts` apply.
   */
  it('collapses a repeated key to its last value instead of 500ing', async () => {
    await build({ list, count })
    const res = await get('/admin/sync-jobs?platform=first&platform=second&sort=a&sort=status')
    expect(res.statusCode).toBe(200)
    expect(list).toHaveBeenCalledWith(
      expect.objectContaining({ platform: 'second', sort: 'status' }),
    )
  })

  it('answers a real request with a repeated filter key rather than throwing', async () => {
    await build(await seededStore(3))
    const res = await get('/admin/sync-jobs?platform=nope&platform=fortnox')
    expect(res.statusCode).toBe(200)
    expect(res.json().data).toHaveLength(3)
  })

  /**
   * The router's OWN clamps, asserted where they happen — at the call into the
   * store — rather than through a rendered page size.
   *
   * `SyncStore.list` clamps identically (50 default, 200 ceiling,
   * `Number.isInteger` on the offset), so every one of these is invisible from
   * the outside: an end-to-end assertion passes whether or not the router
   * clamps at all. That is defence in depth in production and a decorative
   * test anywhere else, which is why these read the mock.
   */
  it.each([
    { label: 'defaults limit to 50', url: '', expected: { limit: 50, offset: 0 } },
    { label: 'caps limit at 200', url: '?limit=500', expected: { limit: 200, offset: 0 } },
    { label: 'passes a limit under the cap through', url: '?limit=10', expected: { limit: 10 } },
    {
      label: 'floors a non-numeric offset at 0',
      url: '?offset=abc',
      expected: { limit: 50, offset: 0 },
    },
    { label: 'floors a negative offset at 0', url: '?offset=-40', expected: { offset: 0 } },
    { label: 'truncates a fractional offset', url: '?offset=75.9', expected: { offset: 75 } },
  ])('$label before the store ever sees it', async ({ url, expected }) => {
    await build({ list, count })
    const res = await get(`/admin/sync-jobs${url}`)
    expect(res.statusCode).toBe(200)
    expect(list).toHaveBeenCalledWith(expect.objectContaining(expected))
  })
})
