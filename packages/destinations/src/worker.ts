/**
 * DestinationWorker — exports the data store's change feed to destinations.
 *
 * Every `intervalMs` (30 s) it lists the destinations that are due (enabled,
 * interval elapsed, lease free), takes each one's LEASE with a conditional
 * UPDATE — so across replicas exactly one worker runs a destination — and:
 *
 *   1. for every (vertical, resource type) in the destination's scope, pages
 *      `changesSince` from that pair's cursor, masks and transforms each
 *      record, buffers rows and FLUSHES at 50 000 rows or ~128 MB: a Parquet
 *      file `vertical=V/resource_type=T/dt=D/<runId>-<part>.parquet` (object
 *      stores) or an upsert batch (Postgres). The cursor advances only after
 *      the write succeeded.
 *   2. drains the tombstone feed from the destination's tombstone cursor:
 *      `_deletes/dt=D/<runId>-<part>.parquet` or DELETEs.
 *   3. writes `_manifests/<runId>.json` (object stores) listing every file.
 *
 * Delivery is AT LEAST ONCE: a crash between a write and its cursor update
 * re-exports those rows on the next run under a new file name. Consumers
 * dedupe on `_pk`, keeping the greatest `changed_at` (the Postgres sink does
 * exactly that).
 *
 * The lag window (120 s) holds back rows and tombstones changed too recently:
 * a write stamped at T can commit after a reader has passed T.
 *
 * Scope: owner tenants are resolved through the credential store (connection
 * → owner_tenant_id); verticals and resource types through the destination's
 * scope. PII is masked unless the destination has `include_pii`.
 */
import { randomUUID } from 'node:crypto'
import type {
  ChangeBatch,
  ChangesSinceOptions,
  ResourceClassification,
  Tombstone,
} from '@opensteward/shared'
import { tableNameFor } from './sinks/postgres'
import type { DestinationRecord, DestinationStore, RunFile, RunStatus, RunTrigger } from './store'
import { TOMBSTONE_CURSOR_KEY, truncateError } from './store'
import { buildExportRow, estimateRowBytes, tombstoneToDelete } from './transform'
import {
  isObjectStoreType,
  typeInScope,
  verticalInScope,
  type DeleteSpec,
  type ExportRow,
  type Sink,
  type TableTarget,
} from './types'
import {
  PARQUET_CONTENT_TYPE,
  deletesToParquet,
  rowsToParquet,
  type ParquetCompression,
} from './writers/parquet'

/** The slice of `ResourceStore` the worker reads. */
export interface ChangeFeed {
  changesSince<T = unknown>(opts: ChangesSinceOptions): Promise<ChangeBatch<T>>
  tombstonesSince(afterId: number, limit?: number): Promise<Tombstone[]>
  latestTombstoneId(): Promise<number>
}

export interface ConnectionInfo {
  id: string
  vertical: string | null
  platform: string
  ownerTenantId: string | null
}

/** The slice of `CredentialStore` the worker reads. */
export interface ConnectionDirectory {
  list(): Promise<ConnectionInfo[]>
}

export interface WorkerLogger {
  info(obj: object, msg?: string): void
  warn(obj: object, msg?: string): void
  error(obj: object, msg?: string): void
}

export type SinkFactory = (
  destination: DestinationRecord,
  secrets: Record<string, string>,
) => Promise<Sink>

export interface DestinationWorkerOptions {
  store: DestinationStore
  feed: ChangeFeed
  connections: ConnectionDirectory
  /** Every (vertical, resource type) that may hold rows; filtered by scope per destination. */
  resourceTypes: () =>
    | Array<{ vertical: string; resourceType: string }>
    | Promise<Array<{ vertical: string; resourceType: string }>>
  classificationFor: (vertical: string, resourceType: string) => ResourceClassification
  sinkFactory: SinkFactory
  /** Key for `hmac` masks (`deriveMaskKey(STORE_SECRET)`). */
  hmacKey: Buffer
  now?: () => number
  /** Scheduler tick. Default 30 000 ms. */
  intervalMs?: number
  /** Lease length; renewed at every flush. Default 10 min. */
  leaseMs?: number
  /** Default 120 000 ms. */
  lagMs?: number
  /** `changesSince` page size (the store caps it at 1000). */
  pageLimit?: number
  /** Flush a file after this many rows. Default 50 000. */
  flushRows?: number
  /** …or once the buffer holds about this many bytes. Default 128 MB. */
  flushBytes?: number
  /** Lease owner id. Default: a random id per worker. */
  workerId?: string
  newRunId?: () => string
  logger?: WorkerLogger
}

export interface RunSummary {
  runId: string
  destinationId: string
  status: Exclude<RunStatus, 'running'>
  rowsWritten: number
  deletesWritten: number
  files: RunFile[]
  error: string | null
}

/** A run could not start: another worker holds the destination's lease. */
export class LeaseHeldError extends Error {
  constructor(readonly destinationId: string) {
    super(`Destination ${destinationId} is already running.`)
    this.name = 'LeaseHeldError'
  }
}

export class DestinationNotFoundError extends Error {
  constructor(readonly destinationId: string) {
    super(`No destination ${destinationId}.`)
    this.name = 'DestinationNotFoundError'
  }
}

/** The lease expired mid-run and another worker may have taken it. */
class LeaseLostError extends Error {
  constructor() {
    super('Lease lost mid-run; stopped without advancing further cursors.')
    this.name = 'LeaseLostError'
  }
}

const NOOP_LOGGER: WorkerLogger = { info() {}, warn() {}, error() {} }

/** A path segment safe in every object store and in Hive-style partitions. */
function segment(s: string): string {
  return s.replace(/[^A-Za-z0-9_.-]/g, '_')
}

function dateOf(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}

interface RunContext {
  dest: DestinationRecord
  runId: string
  trigger: RunTrigger
  startedAt: number
  dt: string
  sink: Sink
  compression: ParquetCompression
  part: number
  files: RunFile[]
  rows: number
  deletes: number
  /** (vertical, resource type) pairs this run wrote rows for. */
  touched: Map<string, TableTarget>
}

export class DestinationWorker {
  private readonly now: () => number
  private readonly intervalMs: number
  private readonly leaseMs: number
  private readonly lagMs: number
  private readonly pageLimit: number
  private readonly flushRows: number
  private readonly flushBytes: number
  readonly workerId: string
  private readonly newRunId: () => string
  private readonly log: WorkerLogger
  private timer: ReturnType<typeof setInterval> | undefined
  private ticking = false
  private stopped = false
  private readonly inflight = new Set<Promise<unknown>>()

  constructor(private readonly opts: DestinationWorkerOptions) {
    this.now = opts.now ?? Date.now
    this.intervalMs = opts.intervalMs ?? 30_000
    this.leaseMs = opts.leaseMs ?? 10 * 60_000
    this.lagMs = opts.lagMs ?? 120_000
    this.pageLimit = Math.max(1, Math.min(1000, opts.pageLimit ?? 1000))
    this.flushRows = opts.flushRows ?? 50_000
    this.flushBytes = opts.flushBytes ?? 128 * 1024 * 1024
    this.workerId = opts.workerId ?? `dest-worker-${randomUUID()}`
    this.newRunId = opts.newRunId ?? randomUUID
    this.log = opts.logger ?? NOOP_LOGGER
  }

  start(): void {
    if (this.timer) return
    this.stopped = false
    void this.opts.store.failOrphanedRuns(this.now()).catch((err: unknown) => {
      this.log.warn({ err }, 'destinations: could not close orphaned runs')
    })
    this.timer = setInterval(() => void this.tick(), this.intervalMs)
    this.timer.unref?.()
    void this.tick()
  }

  async stop(): Promise<void> {
    this.stopped = true
    if (this.timer) clearInterval(this.timer)
    this.timer = undefined
    await Promise.allSettled([...this.inflight])
  }

  /** Run every due destination once, one after another. Overlapping ticks are skipped. */
  async tick(): Promise<RunSummary[]> {
    if (this.ticking) return []
    this.ticking = true
    const out: RunSummary[] = []
    try {
      const due = await this.opts.store.listDue(this.now())
      for (const d of due) {
        if (this.stopped) break
        const started = await this.begin(d.id, 'schedule')
        if (started) out.push(await started.done)
      }
    } catch (err) {
      this.log.error({ err }, 'destinations: tick failed')
    } finally {
      this.ticking = false
    }
    return out
  }

  /**
   * Start a run now, in the background. Resolves once the lease is held and
   * the run row exists; `done` settles when the run ends (it never rejects).
   * Throws `LeaseHeldError` when the destination is already running.
   */
  async runNow(
    destinationId: string,
    trigger: RunTrigger = 'manual',
  ): Promise<{ runId: string; done: Promise<RunSummary> }> {
    const started = await this.begin(destinationId, trigger)
    if (!started) throw new LeaseHeldError(destinationId)
    return started
  }

  /** Run a destination and wait for it. Null when its lease is held elsewhere. */
  async runOnce(destinationId: string, trigger: RunTrigger = 'manual'): Promise<RunSummary | null> {
    const started = await this.begin(destinationId, trigger)
    return started ? started.done : null
  }

  private async begin(
    destinationId: string,
    trigger: RunTrigger,
  ): Promise<{ runId: string; done: Promise<RunSummary> } | null> {
    const { store } = this.opts
    const dest = await store.get(destinationId)
    if (!dest) throw new DestinationNotFoundError(destinationId)
    const startedAt = this.now()
    if (!(await store.claimLease(dest.id, this.workerId, startedAt, this.leaseMs))) return null
    let runId: string
    try {
      runId = await store.startRun(dest.id, trigger, startedAt, this.newRunId())
    } catch (err) {
      await store.releaseLease(dest.id, this.workerId)
      throw err
    }
    const done: Promise<RunSummary> = this.execute(dest, runId, trigger, startedAt).finally(
      async () => {
        await store.releaseLease(dest.id, this.workerId).catch((err: unknown) => {
          this.log.warn({ err, destinationId: dest.id }, 'destinations: lease release failed')
        })
        this.inflight.delete(done)
      },
    )
    this.inflight.add(done)
    return { runId, done }
  }

  private async renew(ctx: RunContext): Promise<void> {
    const ok = await this.opts.store.renewLease(
      ctx.dest.id,
      this.workerId,
      this.now(),
      this.leaseMs,
    )
    if (!ok) throw new LeaseLostError()
  }

  private async execute(
    dest: DestinationRecord,
    runId: string,
    trigger: RunTrigger,
    startedAt: number,
  ): Promise<RunSummary> {
    const { store } = this.opts
    let sink: Sink | undefined
    const ctx: Omit<RunContext, 'sink'> & { sink?: Sink } = {
      dest,
      runId,
      trigger,
      startedAt,
      dt: dateOf(startedAt),
      compression: (dest.config['compression'] as ParquetCompression | undefined) ?? 'zstd',
      part: 0,
      files: [],
      rows: 0,
      deletes: 0,
      touched: new Map(),
    }
    let status: RunSummary['status'] = 'success'
    let error: string | null = null
    try {
      const secrets = await store.getSecrets(dest.id)
      sink = await this.opts.sinkFactory(dest, secrets)
      ctx.sink = sink
      const run = ctx as RunContext

      const connections = new Map(
        (await this.opts.connections.list()).map((c) => [c.id, c] as const),
      )

      // A destination's first run starts the delete feed at the newest
      // tombstone, read BEFORE any row: every older deletion removed a row
      // this destination can never have been sent.
      const tcursor = await store.getCursor(dest.id, TOMBSTONE_CURSOR_KEY, TOMBSTONE_CURSOR_KEY)
      let tombstoneFrom = tcursor?.tombstoneId ?? null
      if (tombstoneFrom === null) {
        tombstoneFrom = await this.opts.feed.latestTombstoneId()
        await store.setTombstoneCursor(dest.id, tombstoneFrom)
      }

      for (const pair of await this.pairsFor(dest)) {
        if (this.stopped) throw new Error('Worker stopping.')
        await this.exportPair(run, pair, connections)
      }
      await this.drainTombstones(run, tombstoneFrom, connections)

      if (sink.kind === 'object_store' && run.files.length > 0) {
        const path = `_manifests/${segment(runId)}.json`
        const manifest = {
          version: 1,
          format: 'parquet',
          runId,
          destinationId: dest.id,
          trigger,
          startedAt: new Date(startedAt).toISOString(),
          finishedAt: new Date(this.now()).toISOString(),
          includePii: dest.includePii,
          rowsWritten: run.rows,
          deletesWritten: run.deletes,
          files: run.files,
        }
        await sink.writeFile(
          path,
          new TextEncoder().encode(JSON.stringify(manifest, null, 2)),
          'application/json',
        )
        run.files.push({ path, kind: 'manifest', rows: 0 })
      }
    } catch (err) {
      status = 'failed'
      error = truncateError(err)
      this.log.warn(
        { err: error, destinationId: dest.id, runId },
        'destinations: run failed; cursors hold at the last successful write',
      )
    } finally {
      await sink?.close().catch(() => {})
    }
    const finishedAt = this.now()
    const summary: RunSummary = {
      runId,
      destinationId: dest.id,
      status,
      rowsWritten: ctx.rows,
      deletesWritten: ctx.deletes,
      files: ctx.files,
      error,
    }
    try {
      await store.finishRun(runId, { ...summary, finishedAt })
      await store.markResult(dest.id, status, error, startedAt)
    } catch (err) {
      this.log.error({ err, destinationId: dest.id, runId }, 'destinations: recording run failed')
    }
    if (status === 'success') {
      this.log.info(
        { destinationId: dest.id, runId, rows: ctx.rows, deletes: ctx.deletes },
        'destinations: run complete',
      )
    }
    return summary
  }

  /** The (vertical, resource type) pairs a destination exports, deduplicated. */
  private async pairsFor(dest: DestinationRecord): Promise<TableTarget[]> {
    const seen = new Map<string, TableTarget>()
    for (const p of await this.opts.resourceTypes()) {
      if (!typeInScope(dest.scope, p.vertical, p.resourceType)) continue
      seen.set(`${p.vertical}\u0000${p.resourceType}`, {
        vertical: p.vertical,
        resourceType: p.resourceType,
      })
    }
    return [...seen.values()].sort(
      (a, b) =>
        a.vertical.localeCompare(b.vertical) || a.resourceType.localeCompare(b.resourceType),
    )
  }

  /** Connection ids a tenant-scoped destination may read for a vertical; undefined = all. */
  private connectionIdsFor(
    dest: DestinationRecord,
    vertical: string,
    connections: Map<string, ConnectionInfo>,
  ): string[] | undefined {
    const tenants = dest.scope.tenants
    if (tenants === '*') return undefined
    return [...connections.values()]
      .filter(
        (c) =>
          c.vertical === vertical && c.ownerTenantId !== null && tenants.includes(c.ownerTenantId),
      )
      .map((c) => c.id)
  }

  /** `changesSince` measures its lag window on the wall clock; align it with ours. */
  private feedLagMs(): number {
    return this.lagMs + (Date.now() - this.now())
  }

  private async exportPair(
    ctx: RunContext,
    pair: TableTarget,
    connections: Map<string, ConnectionInfo>,
  ): Promise<void> {
    const { store, feed } = this.opts
    const { dest } = ctx
    const connectionIds = this.connectionIdsFor(dest, pair.vertical, connections)
    if (connectionIds && connectionIds.length === 0) return
    const classification = this.opts.classificationFor(pair.vertical, pair.resourceType)
    const mask = {
      revealPii: dest.includePii,
      maskFinancial: dest.scope.maskFinancial === true,
      hmacKey: this.opts.hmacKey,
    }

    const cursor = await store.getCursor(dest.id, pair.vertical, pair.resourceType)
    let after: { afterChangedAt?: number; afterPk?: string } =
      cursor?.changedAt != null
        ? { afterChangedAt: cursor.changedAt, afterPk: cursor.pk ?? '' }
        : {}

    let buffer: ExportRow[] = []
    let bytes = 0
    let pending: { changedAt: number; pk: string } | null = null
    const seen = new Map<string, string | null>()

    const flush = async () => {
      if (buffer.length === 0 || pending === null) return
      await this.renew(ctx)
      if (ctx.sink.kind === 'object_store') {
        const path =
          `vertical=${segment(pair.vertical)}/resource_type=${segment(pair.resourceType)}` +
          `/dt=${ctx.dt}/${segment(ctx.runId)}-${String(ctx.part++).padStart(5, '0')}.parquet`
        const file = await rowsToParquet(buffer, { compression: ctx.compression })
        await ctx.sink.writeFile(path, file, PARQUET_CONTENT_TYPE)
        ctx.files.push({
          path,
          kind: 'rows',
          vertical: pair.vertical,
          resourceType: pair.resourceType,
          rows: buffer.length,
        })
      } else {
        await ctx.sink.applyBatch(pair, buffer, [])
        ctx.files.push({
          path: tableNameFor(pair),
          kind: 'table',
          vertical: pair.vertical,
          resourceType: pair.resourceType,
          rows: buffer.length,
        })
      }
      // Written — now (and only now) the connections and the watermark.
      await store.recordConnections(dest.id, seen)
      await store.setRowCursor(
        dest.id,
        pair.vertical,
        pair.resourceType,
        pending.changedAt,
        pending.pk,
      )
      ctx.touched.set(`${pair.vertical}\u0000${pair.resourceType}`, pair)
      ctx.rows += buffer.length
      buffer = []
      bytes = 0
      seen.clear()
    }

    for (;;) {
      const batch = await feed.changesSince({
        vertical: pair.vertical,
        resourceType: pair.resourceType,
        connectionIds,
        ...after,
        limit: this.pageLimit,
        lagMs: this.feedLagMs(),
      })
      for (const item of batch.items) {
        const owner =
          item.connectionId !== null
            ? (connections.get(item.connectionId)?.ownerTenantId ?? null)
            : null
        const row = buildExportRow(item, { ownerTenantId: owner, classification, mask })
        buffer.push(row)
        bytes += estimateRowBytes(row)
        if (item.connectionId !== null && !seen.has(item.connectionId)) {
          seen.set(item.connectionId, owner)
        }
      }
      if (!batch.next) break
      pending = { changedAt: batch.next.afterChangedAt, pk: batch.next.afterPk }
      after = { afterChangedAt: batch.next.afterChangedAt, afterPk: batch.next.afterPk }
      if (buffer.length >= this.flushRows || bytes >= this.flushBytes) await flush()
      if (batch.items.length < this.pageLimit) break
    }
    await flush()
  }

  /**
   * Whether a tombstone concerns this destination, and as what. A deletion
   * for a connection the destination has exported always applies (it holds
   * that data); otherwise the connection must be in scope now. Rows of a
   * connection with no owner tenant are only ever in an all-tenant scope.
   */
  private deleteFor(
    dest: DestinationRecord,
    t: Tombstone,
    connections: Map<string, ConnectionInfo>,
    known: Map<string, string | null>,
  ): DeleteSpec | null {
    const scope = dest.scope
    if (t.vertical !== null) {
      if (!verticalInScope(scope, t.vertical)) return null
      if (t.resourceType !== null && !typeInScope(scope, t.vertical, t.resourceType)) return null
    }
    let owner: string | null = null
    if (t.connectionId !== null) {
      if (known.has(t.connectionId)) {
        owner = known.get(t.connectionId) ?? null
      } else {
        const c = connections.get(t.connectionId)
        owner = c?.ownerTenantId ?? null
        if (scope.tenants !== '*' && (owner === null || !scope.tenants.includes(owner))) return null
      }
    } else if (t.platform !== null && scope.tenants !== '*') {
      return null
    }
    return tombstoneToDelete(t, owner)
  }

  private async drainTombstones(
    ctx: RunContext,
    from: number,
    connections: Map<string, ConnectionInfo>,
  ): Promise<void> {
    const { store, feed } = this.opts
    const { dest } = ctx
    const known = await store.knownConnections(dest.id)
    const horizon = this.now() - this.lagMs
    let cursor = from
    let saved = from
    let buffer: DeleteSpec[] = []

    // Tables a wide delete (connection / vertical / all) fans out to: every
    // pair this destination has a cursor for, plus what this run wrote.
    const tables = new Map<string, TableTarget>(ctx.touched)
    if (ctx.sink.kind === 'table') {
      for (const c of await store.listCursors(dest.id)) {
        if (c.vertical === TOMBSTONE_CURSOR_KEY) continue
        tables.set(`${c.vertical}\u0000${c.resourceType}`, {
          vertical: c.vertical,
          resourceType: c.resourceType,
        })
      }
    }

    const flush = async () => {
      if (buffer.length > 0) {
        await this.renew(ctx)
        if (ctx.sink.kind === 'object_store') {
          const path = `_deletes/dt=${ctx.dt}/${segment(ctx.runId)}-${String(ctx.part++).padStart(5, '0')}.parquet`
          const file = await deletesToParquet(buffer, { compression: ctx.compression })
          await ctx.sink.writeFile(path, file, PARQUET_CONTENT_TYPE)
          ctx.files.push({ path, kind: 'deletes', rows: buffer.length })
        } else {
          const byTable = new Map<string, { target: TableTarget; specs: DeleteSpec[] }>()
          for (const d of buffer) {
            const targets =
              d.scope === 'record'
                ? [{ vertical: d.vertical!, resourceType: d.resourceType! }]
                : [...tables.values()].filter(
                    (p) => d.vertical === null || p.vertical === d.vertical,
                  )
            for (const target of targets) {
              const key = `${target.vertical}\u0000${target.resourceType}`
              const entry = byTable.get(key) ?? { target, specs: [] }
              entry.specs.push(d)
              byTable.set(key, entry)
            }
          }
          for (const { target, specs } of byTable.values()) {
            await ctx.sink.applyBatch(target, [], specs)
          }
        }
        ctx.deletes += buffer.length
        buffer = []
      }
      if (cursor !== saved) {
        await store.setTombstoneCursor(dest.id, cursor)
        saved = cursor
      }
    }

    for (;;) {
      const batch = await feed.tombstonesSince(cursor, 1000)
      let reachedHorizon = false
      for (const t of batch) {
        if (t.deletedAt > horizon) {
          reachedHorizon = true
          break
        }
        cursor = t.id
        const spec = this.deleteFor(dest, t, connections, known)
        if (spec) buffer.push(spec)
        if (buffer.length >= this.flushRows) await flush()
      }
      if (reachedHorizon || batch.length < 1000) break
    }
    await flush()
  }
}

/** Whether a destination type writes files (vs. tables). */
export function writesFiles(type: string): boolean {
  return isObjectStoreType(type)
}
