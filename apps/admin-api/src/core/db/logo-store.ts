/**
 * LogoStore — platform logo bytes, plus the single-flight fetch job that
 * populates them.
 *
 * Both tables are declared in `admin-store.ts` migration v2; this module owns
 * the read/write API. Like RuntimeSettingsStore, it BORROWS an already-migrated
 * `DbHandle` and must not close it — AdminStore owns the handle's lifecycle, so
 * there is deliberately no `close()` here.
 *
 * Nothing in here is encrypted, and that is on purpose. Logo bytes are
 * third-party marks served to anonymous browsers on a public docs page, and the
 * Brandfetch client ID that fetched them ships inside public `<img src>` URLs
 * by design. Registering either in `packages/shared/src/sqlite/encrypted-blobs.ts`
 * would make `rotate-store-secret` try to decrypt plaintext.
 */
import { createHash } from 'node:crypto'
import type { DbHandle } from '@opensteward/shared'

export type LogoExt = 'svg' | 'png'

export type LogoFetchStatus =
  'pending' | 'running' | 'cancelling' | 'completed' | 'failed' | 'cancelled'

/** Statuses in which a job still owns the singleton slot. */
const NON_TERMINAL: LogoFetchStatus[] = ['pending', 'running', 'cancelling']

/** Value held in `active_key` while a job is live. See migration v2. */
const ACTIVE_KEY = 'singleton'

export interface LogoRow {
  slug: string
  ext: LogoExt
  contentType: string
  bytes: Buffer
  byteSize: number
  etag: string
  sourceDomain: string
  fetchedAt: number
}

/** Everything but the bytes — what the 304 path and the manifest need. */
export type LogoHead = Omit<LogoRow, 'bytes'>

export interface LogoFetchProgress {
  total: number
  processed: number
  fetched: number
  skipped: number
  notFound: number
  throttled: number
  currentSlug: string | null
  currentVertical: string | null
  /** Wall-clock estimate in ms; null until enough platforms have completed. */
  etaMs: number | null
  byVertical: Record<
    string,
    { total: number; processed: number; fetched: number; skipped: number; notFound: number }
  >
  lastError: string | null
}

export interface LogoFetchJob {
  id: string
  status: LogoFetchStatus
  force: boolean
  vertical: string | null
  slug: string | null
  delayMs: number
  total: number
  progress: LogoFetchProgress | null
  error: string | null
  workerId: string | null
  attempts: number
  heartbeatAt: number | null
  createdAt: number
  createdBy: string | null
  startedAt: number | null
  completedAt: number | null
}

interface LogoJobDbRow {
  id: string
  status: LogoFetchStatus
  active_key: string | null
  force: number
  vertical: string | null
  slug: string | null
  delay_ms: number
  total: number
  progress: string | null
  error: string | null
  worker_id: string | null
  attempts: number
  heartbeat_at: number | null
  created_at: number
  created_by: string | null
  started_at: number | null
  completed_at: number | null
}

const JOB_COLUMNS = [
  'id',
  'status',
  'active_key',
  'force',
  'vertical',
  'slug',
  'delay_ms',
  'total',
  'progress',
  'error',
  'worker_id',
  'attempts',
  'heartbeat_at',
  'created_at',
  'created_by',
  'started_at',
  'completed_at',
] as const

/**
 * The one place the driver abstraction leaks: better-sqlite3 hands back a
 * Buffer for BLOB, node-postgres hands back a Buffer for BYTEA, but a future
 * driver could reasonably return a Uint8Array. Normalise rather than assume.
 */
function toBuffer(value: unknown): Buffer {
  if (Buffer.isBuffer(value)) return value
  if (value instanceof Uint8Array) return Buffer.from(value)
  throw new Error(`platform_logos.bytes: unexpected driver type ${typeof value}`)
}

function rowToJob(row: LogoJobDbRow): LogoFetchJob {
  return {
    id: row.id,
    status: row.status,
    force: row.force === 1,
    vertical: row.vertical,
    slug: row.slug,
    delayMs: Number(row.delay_ms),
    total: Number(row.total),
    progress: row.progress ? (JSON.parse(row.progress) as LogoFetchProgress) : null,
    error: row.error,
    workerId: row.worker_id,
    attempts: Number(row.attempts),
    heartbeatAt: row.heartbeat_at === null ? null : Number(row.heartbeat_at),
    createdAt: Number(row.created_at),
    createdBy: row.created_by,
    startedAt: row.started_at === null ? null : Number(row.started_at),
    completedAt: row.completed_at === null ? null : Number(row.completed_at),
  }
}

export function emptyProgress(total: number): LogoFetchProgress {
  return {
    total,
    processed: 0,
    fetched: 0,
    skipped: 0,
    notFound: 0,
    throttled: 0,
    currentSlug: null,
    currentVertical: null,
    etaMs: null,
    byVertical: {},
    lastError: null,
  }
}

export class LogoStore {
  private constructor(private readonly handle: DbHandle) {}

  /**
   * Borrows an already-migrated handle. `platform_logos` and `logo_fetch_jobs`
   * belong to AdminStore's `admin_store` migration namespace, so there is no
   * migration or seed work to do here.
   */
  static async create(handle: DbHandle): Promise<LogoStore> {
    return new LogoStore(handle)
  }

  // ── Blobs ────────────────────────────────────────────────────────────────

  async putLogo(input: {
    slug: string
    ext: LogoExt
    contentType: string
    bytes: Buffer
    sourceDomain: string
    fetchedBy: string | null
  }): Promise<void> {
    const etag = createHash('sha256').update(input.bytes).digest('hex')
    const values = {
      slug: input.slug,
      ext: input.ext,
      content_type: input.contentType,
      bytes: input.bytes,
      byte_size: input.bytes.length,
      etag,
      source_domain: input.sourceDomain,
      fetched_at: Date.now(),
      fetched_by: input.fetchedBy,
    }
    await this.handle.kysely
      .insertInto('platform_logos')
      .values(values)
      .onConflict((oc) =>
        oc.columns(['slug', 'ext']).doUpdateSet({
          content_type: values.content_type,
          bytes: values.bytes,
          byte_size: values.byte_size,
          etag: values.etag,
          source_domain: values.source_domain,
          fetched_at: values.fetched_at,
          fetched_by: values.fetched_by,
        }),
      )
      .execute()
  }

  async getLogo(slug: string, ext: LogoExt): Promise<LogoRow | null> {
    const row = (await this.handle.kysely
      .selectFrom('platform_logos')
      .select([
        'slug',
        'ext',
        'content_type',
        'bytes',
        'byte_size',
        'etag',
        'source_domain',
        'fetched_at',
      ])
      .where('slug', '=', slug)
      .where('ext', '=', ext)
      .executeTakeFirst()) as Record<string, unknown> | undefined
    if (!row) return null
    return {
      slug: row.slug as string,
      ext: row.ext as LogoExt,
      contentType: row.content_type as string,
      bytes: toBuffer(row.bytes),
      byteSize: Number(row.byte_size),
      etag: row.etag as string,
      sourceDomain: row.source_domain as string,
      fetchedAt: Number(row.fetched_at),
    }
  }

  /** Metadata only — deliberately never selects `bytes`, so a 304 is free. */
  async headLogo(slug: string, ext: LogoExt): Promise<LogoHead | null> {
    const row = (await this.handle.kysely
      .selectFrom('platform_logos')
      .select(['slug', 'ext', 'content_type', 'byte_size', 'etag', 'source_domain', 'fetched_at'])
      .where('slug', '=', slug)
      .where('ext', '=', ext)
      .executeTakeFirst()) as Record<string, unknown> | undefined
    if (!row) return null
    return {
      slug: row.slug as string,
      ext: row.ext as LogoExt,
      contentType: row.content_type as string,
      byteSize: Number(row.byte_size),
      etag: row.etag as string,
      sourceDomain: row.source_domain as string,
      fetchedAt: Number(row.fetched_at),
    }
  }

  /**
   * slug → available extensions. This is what lets the admin/docs-server proxy
   * decide "not in the database" without a round trip per logo: a deployment
   * still using the CLI-to-disk workflow has an empty manifest, so every
   * request goes straight to disk at today's cost.
   */
  async manifest(): Promise<Record<string, LogoExt[]>> {
    const rows = (await this.handle.kysely
      .selectFrom('platform_logos')
      .select(['slug', 'ext'])
      .execute()) as Array<{ slug: string; ext: LogoExt }>
    const out: Record<string, LogoExt[]> = {}
    for (const row of rows) (out[row.slug] ??= []).push(row.ext)
    for (const exts of Object.values(out)) exts.sort()
    return out
  }

  /** Slugs that already have bytes — the database-backed `isSatisfied` set. */
  async satisfiedSlugs(): Promise<Set<string>> {
    const rows = (await this.handle.kysely
      .selectFrom('platform_logos')
      .select('slug')
      .distinct()
      .execute()) as Array<{ slug: string }>
    return new Set(rows.map((r) => r.slug))
  }

  async countLogos(): Promise<{ count: number; totalBytes: number; lastFetchedAt: number | null }> {
    const rows = (await this.handle.kysely
      .selectFrom('platform_logos')
      .select(['slug', 'byte_size', 'fetched_at'])
      .execute()) as Array<{ slug: string; byte_size: number; fetched_at: number }>
    const slugs = new Set(rows.map((r) => r.slug))
    let totalBytes = 0
    let lastFetchedAt: number | null = null
    for (const row of rows) {
      totalBytes += Number(row.byte_size)
      const at = Number(row.fetched_at)
      if (lastFetchedAt === null || at > lastFetchedAt) lastFetchedAt = at
    }
    return { count: slugs.size, totalBytes, lastFetchedAt }
  }

  async deleteAllLogos(): Promise<number> {
    const res = await this.handle.kysely.deleteFrom('platform_logos').executeTakeFirst()
    return Number(res?.numDeletedRows ?? 0)
  }

  // ── Jobs ─────────────────────────────────────────────────────────────────

  /**
   * Insert a job holding the singleton slot. Throws a unique violation (see
   * `isUniqueViolation`) when another job is already live — the caller turns
   * that into the same 409 as the pre-flight `findActive()` check. The index is
   * the real guarantee; the pre-flight check only makes the error nicer.
   */
  async createJob(input: {
    id: string
    force: boolean
    vertical: string | null
    slug: string | null
    delayMs: number
    total: number
    createdBy: string | null
  }): Promise<LogoFetchJob> {
    const now = Date.now()
    await this.handle.kysely
      .insertInto('logo_fetch_jobs')
      .values({
        id: input.id,
        status: 'pending',
        active_key: ACTIVE_KEY,
        force: input.force ? 1 : 0,
        vertical: input.vertical,
        slug: input.slug,
        delay_ms: input.delayMs,
        total: input.total,
        progress: JSON.stringify(emptyProgress(input.total)),
        error: null,
        worker_id: null,
        attempts: 0,
        heartbeat_at: null,
        created_at: now,
        created_by: input.createdBy,
        started_at: null,
        completed_at: null,
      })
      .execute()
    const job = await this.getJob(input.id)
    if (!job) throw new Error(`logo_fetch_jobs: job ${input.id} vanished immediately after insert`)
    return job
  }

  async getJob(id: string): Promise<LogoFetchJob | null> {
    const row = (await this.handle.kysely
      .selectFrom('logo_fetch_jobs')
      .select(JOB_COLUMNS)
      .where('id', '=', id)
      .executeTakeFirst()) as LogoJobDbRow | undefined
    return row ? rowToJob(row) : null
  }

  async listJobs(limit = 20): Promise<LogoFetchJob[]> {
    const rows = (await this.handle.kysely
      .selectFrom('logo_fetch_jobs')
      .select(JOB_COLUMNS)
      .orderBy('created_at', 'desc')
      .limit(limit)
      .execute()) as LogoJobDbRow[]
    return rows.map(rowToJob)
  }

  async findActive(): Promise<LogoFetchJob | null> {
    const row = (await this.handle.kysely
      .selectFrom('logo_fetch_jobs')
      .select(JOB_COLUMNS)
      .where('status', 'in', NON_TERMINAL)
      .orderBy('created_at', 'desc')
      .executeTakeFirst()) as LogoJobDbRow | undefined
    return row ? rowToJob(row) : null
  }

  async findPending(): Promise<LogoFetchJob | null> {
    const row = (await this.handle.kysely
      .selectFrom('logo_fetch_jobs')
      .select(JOB_COLUMNS)
      .where('status', '=', 'pending')
      .orderBy('created_at', 'asc')
      .executeTakeFirst()) as LogoJobDbRow | undefined
    return row ? rowToJob(row) : null
  }

  /**
   * Atomically take ownership of a pending job. Returns true only for the
   * replica that won.
   *
   * Both admin-api pods poll and both will see the same pending row; the
   * `status = 'pending'` predicate is what serialises them. Postgres resolves
   * it on the row lock, SQLite has a single writer, and in both cases the loser
   * matches zero rows. No advisory lock and no external coordinator needed.
   */
  async claim(id: string, workerId: string): Promise<boolean> {
    const now = Date.now()
    const res = await this.handle.kysely
      .updateTable('logo_fetch_jobs')
      .set((eb) => ({
        status: 'running',
        worker_id: workerId,
        started_at: now,
        heartbeat_at: now,
        attempts: eb('attempts', '+', 1),
      }))
      .where('id', '=', id)
      .where('status', '=', 'pending')
      .executeTakeFirst()
    return Number(res?.numUpdatedRows ?? 0) === 1
  }

  /** Liveness ping plus a progress flush. Also how a worker notices a cancel. */
  async heartbeat(id: string, progress: LogoFetchProgress): Promise<void> {
    await this.handle.kysely
      .updateTable('logo_fetch_jobs')
      .set({ heartbeat_at: Date.now(), progress: JSON.stringify(progress) })
      .where('id', '=', id)
      .execute()
  }

  async markCompleted(id: string, progress: LogoFetchProgress): Promise<void> {
    await this.finish(id, 'completed', progress, null)
  }

  async markFailed(id: string, error: string, progress?: LogoFetchProgress): Promise<void> {
    await this.finish(id, 'failed', progress ?? null, error)
  }

  async markCancelled(id: string, progress?: LogoFetchProgress): Promise<void> {
    await this.finish(id, 'cancelled', progress ?? null, null)
  }

  /** Every terminal transition releases the singleton slot in the same UPDATE. */
  private async finish(
    id: string,
    status: LogoFetchStatus,
    progress: LogoFetchProgress | null,
    error: string | null,
  ): Promise<void> {
    const patch: Record<string, unknown> = {
      status,
      active_key: null,
      completed_at: Date.now(),
      error,
    }
    if (progress) patch.progress = JSON.stringify(progress)
    await this.handle.kysely
      .updateTable('logo_fetch_jobs')
      .set(patch)
      .where('id', '=', id)
      .execute()
  }

  /**
   * Ask a job to stop. `pending` can be cancelled outright; `running` becomes
   * `cancelling` and is finalised by whichever pod actually owns it (or by
   * `reapStale` if that pod is gone). Returns the job as it now stands, or null
   * if there was nothing to cancel.
   */
  async requestCancel(id: string): Promise<LogoFetchJob | null> {
    const job = await this.getJob(id)
    if (!job) return null
    if (job.status === 'pending') {
      await this.finish(id, 'cancelled', job.progress, null)
      return this.getJob(id)
    }
    if (job.status === 'running') {
      await this.handle.kysely
        .updateTable('logo_fetch_jobs')
        .set({ status: 'cancelling' })
        .where('id', '=', id)
        .where('status', '=', 'running')
        .execute()
      return this.getJob(id)
    }
    return job
  }

  /**
   * Recover jobs whose owning pod stopped heartbeating.
   *
   * Deliberately NOT SyncWorker's `resetRunning()`-on-start: with two replicas
   * that would let a restarting pod reset the job the other pod is twenty
   * minutes into. Liveness is judged by `heartbeat_at` instead, so only a job
   * nobody is touching gets requeued.
   *
   * The `attempts` cap is what stops a CrashLoopBackOff pod re-running a
   * forty-minute Brandfetch job forever. A requeued job keeps its progress, and
   * because `isSatisfied` reads the database, the retry skips everything
   * already stored — a crash costs minutes, not the whole run.
   */
  async reapStale(
    staleAfterMs: number,
    maxAttempts: number,
  ): Promise<{ requeued: number; abandoned: number; cancelled: number }> {
    const cutoff = Date.now() - staleAfterMs

    const abandonedRes = await this.handle.kysely
      .updateTable('logo_fetch_jobs')
      .set({
        status: 'failed',
        active_key: null,
        completed_at: Date.now(),
        error: 'Abandoned after repeated interrupted attempts. Logos already fetched are kept.',
      })
      .where('status', '=', 'running')
      .where('heartbeat_at', '<', cutoff)
      .where('attempts', '>=', maxAttempts)
      .executeTakeFirst()

    const requeuedRes = await this.handle.kysely
      .updateTable('logo_fetch_jobs')
      .set({ status: 'pending', worker_id: null, started_at: null, heartbeat_at: null })
      .where('status', '=', 'running')
      .where('heartbeat_at', '<', cutoff)
      .executeTakeFirst()

    const cancelledRes = await this.handle.kysely
      .updateTable('logo_fetch_jobs')
      .set({ status: 'cancelled', active_key: null, completed_at: Date.now() })
      .where('status', '=', 'cancelling')
      .where('heartbeat_at', '<', cutoff)
      .executeTakeFirst()

    return {
      requeued: Number(requeuedRes?.numUpdatedRows ?? 0),
      abandoned: Number(abandonedRes?.numUpdatedRows ?? 0),
      cancelled: Number(cancelledRes?.numUpdatedRows ?? 0),
    }
  }

  /** Drop terminal job rows older than `days`. Blobs are never touched. */
  async cleanup(days: number): Promise<number> {
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000
    const res = await this.handle.kysely
      .deleteFrom('logo_fetch_jobs')
      .where('status', 'in', ['completed', 'failed', 'cancelled'])
      .where('created_at', '<', cutoff)
      .executeTakeFirst()
    return Number(res?.numDeletedRows ?? 0)
  }
}
