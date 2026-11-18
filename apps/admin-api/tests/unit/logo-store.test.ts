/**
 * LogoStore — blob round-trip and single-flight job semantics.
 *
 * The blob round-trip is the highest-value test here: logo bytes are the first
 * binary column in this schema (BLOB on SQLite, BYTEA on Postgres) and a driver
 * that silently hands back a string instead of a Buffer would corrupt every
 * logo without failing anything else.
 *
 * The job tests cover what two admin-api replicas do to each other: a duplicate
 * insert, two workers claiming the same job, and recovery when the pod that
 * owned a job disappears.
 *
 * Dual-backend: SQLite (`:memory:`) always; Postgres when TEST_DATABASE_URL is
 * set — which is the only way the BYTEA path is exercised at all.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { openDb } from '@opensteward/shared'
import type { DbHandle } from '@opensteward/shared'
import { AdminStore } from '../../src/core/db/admin-store'
import { LogoStore, emptyProgress } from '../../src/core/db/logo-store'
import { isUniqueViolation } from '../../src/core/db/sql-errors'

const BACKENDS: Array<{ name: string; open: () => Promise<DbHandle> }> = [
  { name: 'sqlite', open: () => openDb({ sqlitePath: ':memory:' }) },
]
if (process.env.TEST_DATABASE_URL) {
  BACKENDS.push({
    name: 'postgres',
    open: () => openDb({ databaseUrl: process.env.TEST_DATABASE_URL }),
  })
}

/** A PNG with a real signature, big enough to be a plausible logo. */
const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from(Array.from({ length: 40_000 }, (_, i) => i % 256)),
])
const SVG = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg">${'x'.repeat(3000)}</svg>`)

describe.each(BACKENDS)('LogoStore [$name]', (backend) => {
  let handle: DbHandle
  let store: LogoStore

  beforeEach(async () => {
    handle = await backend.open()
    if (handle.dialect === 'postgres') {
      await handle.execScript('DROP SCHEMA public CASCADE; CREATE SCHEMA public')
    }
    await AdminStore.create(handle)
    store = await LogoStore.create(handle)
  })

  afterEach(async () => {
    await handle.close()
  })

  describe('blobs', () => {
    it('round-trips a large PNG byte-for-byte', async () => {
      await store.putLogo({
        slug: 'xero',
        ext: 'png',
        contentType: 'image/png',
        bytes: PNG,
        sourceDomain: 'xero.com',
        fetchedBy: 'job-1',
      })

      const row = await store.getLogo('xero', 'png')
      expect(row).not.toBeNull()
      expect(Buffer.isBuffer(row!.bytes)).toBe(true)
      expect(row!.bytes.equals(PNG)).toBe(true)
      expect(row!.byteSize).toBe(PNG.length)
      expect(row!.contentType).toBe('image/png')
      expect(row!.sourceDomain).toBe('xero.com')
    })

    it('round-trips an SVG byte-for-byte', async () => {
      await store.putLogo({
        slug: 'stripe',
        ext: 'svg',
        contentType: 'image/svg+xml',
        bytes: SVG,
        sourceDomain: 'stripe.com',
        fetchedBy: null,
      })

      const row = await store.getLogo('stripe', 'svg')
      expect(row!.bytes.equals(SVG)).toBe(true)
    })

    it('derives a stable sha256 etag from the bytes', async () => {
      await store.putLogo({
        slug: 'a',
        ext: 'svg',
        contentType: 'image/svg+xml',
        bytes: SVG,
        sourceDomain: 'a.com',
        fetchedBy: null,
      })
      await store.putLogo({
        slug: 'b',
        ext: 'svg',
        contentType: 'image/svg+xml',
        bytes: SVG,
        sourceDomain: 'b.com',
        fetchedBy: null,
      })

      const a = await store.headLogo('a', 'svg')
      const b = await store.headLogo('b', 'svg')
      expect(a!.etag).toMatch(/^[0-9a-f]{64}$/)
      expect(a!.etag).toBe(b!.etag)
    })

    it('overwrites on re-fetch and changes the etag', async () => {
      const put = (bytes: Buffer) =>
        store.putLogo({
          slug: 'xero',
          ext: 'svg',
          contentType: 'image/svg+xml',
          bytes,
          sourceDomain: 'xero.com',
          fetchedBy: null,
        })

      await put(SVG)
      const first = await store.headLogo('xero', 'svg')

      const changed = Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg">${'y'.repeat(3000)}</svg>`,
      )
      await put(changed)
      const second = await store.headLogo('xero', 'svg')

      expect(second!.etag).not.toBe(first!.etag)
      expect((await store.getLogo('xero', 'svg'))!.bytes.equals(changed)).toBe(true)
      // Still one row — an upsert, not an append.
      expect((await store.countLogos()).count).toBe(1)
    })

    it('keeps svg and png as separate rows for one slug', async () => {
      await store.putLogo({
        slug: 'x',
        ext: 'svg',
        contentType: 'image/svg+xml',
        bytes: SVG,
        sourceDomain: 'x.com',
        fetchedBy: null,
      })
      await store.putLogo({
        slug: 'x',
        ext: 'png',
        contentType: 'image/png',
        bytes: PNG,
        sourceDomain: 'x.com',
        fetchedBy: null,
      })

      expect(await store.manifest()).toEqual({ x: ['png', 'svg'] })
      // countLogos counts platforms, not rows — the UI says "N of 1,545".
      expect((await store.countLogos()).count).toBe(1)
    })

    it('headLogo returns metadata without the bytes', async () => {
      await store.putLogo({
        slug: 'x',
        ext: 'png',
        contentType: 'image/png',
        bytes: PNG,
        sourceDomain: 'x.com',
        fetchedBy: null,
      })
      const head = await store.headLogo('x', 'png')
      expect(head).toMatchObject({ slug: 'x', ext: 'png', byteSize: PNG.length })
      expect(head).not.toHaveProperty('bytes')
    })

    it('returns null for a miss', async () => {
      expect(await store.getLogo('nope', 'svg')).toBeNull()
      expect(await store.headLogo('nope', 'svg')).toBeNull()
    })

    it('reports totals and the newest fetch time', async () => {
      await store.putLogo({
        slug: 'a',
        ext: 'svg',
        contentType: 'image/svg+xml',
        bytes: SVG,
        sourceDomain: 'a.com',
        fetchedBy: null,
      })
      await store.putLogo({
        slug: 'b',
        ext: 'png',
        contentType: 'image/png',
        bytes: PNG,
        sourceDomain: 'b.com',
        fetchedBy: null,
      })

      const stats = await store.countLogos()
      expect(stats.count).toBe(2)
      expect(stats.totalBytes).toBe(SVG.length + PNG.length)
      expect(stats.lastFetchedAt).toBeGreaterThan(0)
    })

    it('exposes satisfied slugs for the skip check', async () => {
      await store.putLogo({
        slug: 'a',
        ext: 'svg',
        contentType: 'image/svg+xml',
        bytes: SVG,
        sourceDomain: 'a.com',
        fetchedBy: null,
      })
      const set = await store.satisfiedSlugs()
      expect(set.has('a')).toBe(true)
      expect(set.has('b')).toBe(false)
    })

    it('purges every logo', async () => {
      await store.putLogo({
        slug: 'a',
        ext: 'svg',
        contentType: 'image/svg+xml',
        bytes: SVG,
        sourceDomain: 'a.com',
        fetchedBy: null,
      })
      await store.putLogo({
        slug: 'b',
        ext: 'png',
        contentType: 'image/png',
        bytes: PNG,
        sourceDomain: 'b.com',
        fetchedBy: null,
      })

      expect(await store.deleteAllLogos()).toBe(2)
      expect((await store.countLogos()).count).toBe(0)
      expect(await store.manifest()).toEqual({})
    })
  })

  describe('jobs', () => {
    const newJob = (id: string) =>
      store.createJob({
        id,
        force: false,
        vertical: null,
        slug: null,
        delayMs: 400,
        total: 1545,
        createdBy: 'admin-1',
      })

    it('creates a pending job with zeroed progress', async () => {
      const job = await newJob('job-1')
      expect(job).toMatchObject({
        id: 'job-1',
        status: 'pending',
        total: 1545,
        delayMs: 400,
        attempts: 0,
      })
      expect(job.progress).toEqual(emptyProgress(1545))
    })

    it('refuses a second live job', async () => {
      await newJob('job-1')
      // The unique index on active_key is the real guarantee — the route's
      // findActive() pre-check is only there to make the error friendly, and
      // two replicas can pass it simultaneously.
      await expect(newJob('job-2')).rejects.toSatisfy(isUniqueViolation)
    })

    it('allows a new job once the previous one is terminal', async () => {
      await newJob('job-1')
      await store.markCompleted('job-1', emptyProgress(0))

      const second = await newJob('job-2')
      expect(second.status).toBe('pending')
      // Terminal rows accumulate freely — NULL active_key is distinct on both
      // backends, which is why the index can be a plain unique one.
      await store.markFailed('job-2', 'boom')
      const third = await newJob('job-3')
      expect(third.status).toBe('pending')
    })

    it('lets exactly one worker claim a job', async () => {
      await newJob('job-1')
      const other = await LogoStore.create(handle)

      const results = await Promise.all([
        store.claim('job-1', 'pod-a'),
        other.claim('job-1', 'pod-b'),
      ])

      expect(results.filter(Boolean)).toHaveLength(1)
      const job = await store.getJob('job-1')
      expect(job!.status).toBe('running')
      expect(['pod-a', 'pod-b']).toContain(job!.workerId)
      expect(job!.attempts).toBe(1)
    })

    it('will not claim a job that is not pending', async () => {
      await newJob('job-1')
      await store.claim('job-1', 'pod-a')
      expect(await store.claim('job-1', 'pod-b')).toBe(false)
    })

    it('flushes progress on heartbeat', async () => {
      await newJob('job-1')
      await store.claim('job-1', 'pod-a')

      const progress = { ...emptyProgress(1545), processed: 12, fetched: 10, currentSlug: 'xero' }
      await store.heartbeat('job-1', progress)

      const job = await store.getJob('job-1')
      expect(job!.progress).toMatchObject({ processed: 12, fetched: 10, currentSlug: 'xero' })
      expect(job!.heartbeatAt).toBeGreaterThan(0)
    })

    it('releases the singleton slot on every terminal transition', async () => {
      for (const finish of [
        (id: string) => store.markCompleted(id, emptyProgress(0)),
        (id: string) => store.markFailed(id, 'boom'),
        (id: string) => store.markCancelled(id),
      ]) {
        const job = await store.createJob({
          id: `job-${Math.random()}`,
          force: false,
          vertical: null,
          slug: null,
          delayMs: 400,
          total: 1,
          createdBy: null,
        })
        await finish(job.id)
        expect(await store.findActive()).toBeNull()
      }
    })

    it('cancels a pending job outright', async () => {
      await newJob('job-1')
      const job = await store.requestCancel('job-1')
      expect(job!.status).toBe('cancelled')
      expect(await store.findActive()).toBeNull()
    })

    it('moves a running job to cancelling and leaves it for its owner', async () => {
      await newJob('job-1')
      await store.claim('job-1', 'pod-a')

      const job = await store.requestCancel('job-1')
      expect(job!.status).toBe('cancelling')
      // Still holds the slot: the owning pod has to finalise it, so a new
      // fetch must not start in the meantime.
      expect((await store.findActive())!.id).toBe('job-1')

      await store.markCancelled('job-1', emptyProgress(0))
      expect(await store.findActive()).toBeNull()
    })

    it('leaves a terminal job alone on cancel', async () => {
      await newJob('job-1')
      await store.markCompleted('job-1', emptyProgress(0))
      expect((await store.requestCancel('job-1'))!.status).toBe('completed')
    })

    describe('reapStale', () => {
      const stale = async (id: string, attempts: number, status = 'running') => {
        await handle.kysely
          .updateTable('logo_fetch_jobs')
          .set({ status, attempts, heartbeat_at: Date.now() - 120_000, worker_id: 'dead-pod' })
          .where('id', '=', id)
          .execute()
      }

      it('requeues a job whose owner stopped heartbeating, keeping progress', async () => {
        await newJob('job-1')
        await store.claim('job-1', 'dead-pod')
        await store.heartbeat('job-1', { ...emptyProgress(1545), processed: 900, fetched: 850 })
        await stale('job-1', 1)

        expect(await store.reapStale(60_000, 3)).toMatchObject({ requeued: 1, abandoned: 0 })
        const job = await store.getJob('job-1')
        expect(job!.status).toBe('pending')
        expect(job!.workerId).toBeNull()
        // Progress survives, so the retry skips what is already stored.
        expect(job!.progress!.fetched).toBe(850)
      })

      it('leaves a live job alone', async () => {
        await newJob('job-1')
        await store.claim('job-1', 'pod-a')
        expect(await store.reapStale(60_000, 3)).toMatchObject({ requeued: 0, abandoned: 0 })
        expect((await store.getJob('job-1'))!.status).toBe('running')
      })

      it('abandons a job that has burned through its attempts', async () => {
        await newJob('job-1')
        await stale('job-1', 3)

        expect(await store.reapStale(60_000, 3)).toMatchObject({ abandoned: 1, requeued: 0 })
        const job = await store.getJob('job-1')
        expect(job!.status).toBe('failed')
        expect(job!.error).toMatch(/Abandoned/)
        // The slot is released, so the operator can start a fresh run.
        expect(await store.findActive()).toBeNull()
      })

      it('finalises a cancelling job whose owner never came back', async () => {
        await newJob('job-1')
        await stale('job-1', 1, 'cancelling')

        expect(await store.reapStale(60_000, 3)).toMatchObject({ cancelled: 1 })
        expect((await store.getJob('job-1'))!.status).toBe('cancelled')
        expect(await store.findActive()).toBeNull()
      })
    })

    it('lists newest first and cleans up old terminal rows', async () => {
      await newJob('job-1')
      await store.markCompleted('job-1', emptyProgress(0))
      await newJob('job-2')

      const jobs = await store.listJobs()
      expect(jobs.map((j) => j.id)).toEqual(['job-2', 'job-1'])

      await handle.kysely
        .updateTable('logo_fetch_jobs')
        .set({ created_at: Date.now() - 40 * 24 * 60 * 60 * 1000 })
        .where('id', '=', 'job-1')
        .execute()

      expect(await store.cleanup(30)).toBe(1)
      // The live job is untouched however old it looks.
      expect((await store.listJobs()).map((j) => j.id)).toEqual(['job-2'])
    })
  })
})
