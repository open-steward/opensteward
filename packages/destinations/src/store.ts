/**
 * DestinationStore — destinations, their export cursors and run history.
 *
 * Lives on the DATA-STORE handle (next to `resources`), in the migration
 * namespace `destinations`. BORROWER — the handle is owned by the boot layer
 * and is never closed here.
 *
 * Tables:
 *   destinations             one row per configured destination; secrets in
 *                            `encrypted_secrets` (AES-256-GCM, salt
 *                            `opensteward-destinations-v1`, registered for
 *                            `rotate-store-secret`), plus the lease a worker
 *                            holds while running it
 *   destination_cursors      per (destination, vertical, resource_type): the
 *                            (changed_at, pk) watermark of the last row
 *                            written; the tombstone watermark lives on the
 *                            ('*', '*') row
 *   destination_runs         one row per run: status, counts, files written
 *   destination_connections  connections a destination has exported rows
 *                            for, with their owner tenant — so a tombstone
 *                            for a connection that no longer exists can
 *                            still be attributed to a tenant-scoped
 *                            destination
 *
 * Secrets never leave this store through `get`/`list`: records carry only
 * `secretFieldsSet`, the NAMES of the fields that hold a value.
 */
import { randomUUID } from 'node:crypto'
import { decrypt, encrypt, type DbHandle, type DualMigration } from '@opensteward/shared'
import {
  DestinationScopeSchema,
  assertComplete,
  parseConfig,
  parseSecrets,
  type DestinationScope,
  type DestinationType,
} from './types'

/** HKDF/scrypt salt for `encrypted_secrets`. Mirrored in `DATA_STORE_BLOBS`. */
export const DESTINATIONS_SALT = 'opensteward-destinations-v1'

/** The ('*', '*') cursor row carries the tombstone watermark. */
export const TOMBSTONE_CURSOR_KEY = '*'

export const DEFAULT_INTERVAL_SEC = 3600
export const MIN_INTERVAL_SEC = 60
export const MAX_INTERVAL_SEC = 7 * 24 * 3600

const MIGRATIONS: DualMigration[] = [
  {
    version: 1,
    sqlite: `
      CREATE TABLE IF NOT EXISTS destinations (
        id                 TEXT PRIMARY KEY,
        name               TEXT NOT NULL,
        type               TEXT NOT NULL,
        config_json        TEXT NOT NULL,
        encrypted_secrets  TEXT,
        secret_fields_json TEXT NOT NULL DEFAULT '[]',
        include_pii        INTEGER NOT NULL DEFAULT 0,
        pii_approved_by    TEXT,
        scope_json         TEXT NOT NULL,
        interval_sec       INTEGER NOT NULL,
        enabled            INTEGER NOT NULL DEFAULT 1,
        created_by         TEXT,
        created_at         INTEGER NOT NULL,
        updated_at         INTEGER NOT NULL,
        last_run_at        INTEGER,
        last_status        TEXT,
        last_error         TEXT,
        lease_owner        TEXT,
        lease_expires_at   INTEGER
      );
      CREATE TABLE IF NOT EXISTS destination_cursors (
        destination_id TEXT NOT NULL,
        vertical       TEXT NOT NULL,
        resource_type  TEXT NOT NULL,
        changed_at     INTEGER,
        pk             TEXT,
        tombstone_id   INTEGER,
        updated_at     INTEGER NOT NULL,
        PRIMARY KEY (destination_id, vertical, resource_type)
      );
      CREATE TABLE IF NOT EXISTS destination_runs (
        id              TEXT PRIMARY KEY,
        destination_id  TEXT NOT NULL,
        "trigger"       TEXT NOT NULL,
        status          TEXT NOT NULL,
        started_at      INTEGER NOT NULL,
        finished_at     INTEGER,
        rows_written    INTEGER NOT NULL DEFAULT 0,
        deletes_written INTEGER NOT NULL DEFAULT 0,
        files_json      TEXT,
        error           TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_destination_runs_dest
        ON destination_runs (destination_id, started_at);
      CREATE TABLE IF NOT EXISTS destination_connections (
        destination_id  TEXT NOT NULL,
        connection_id   TEXT NOT NULL,
        owner_tenant_id TEXT,
        first_seen_at   INTEGER NOT NULL,
        PRIMARY KEY (destination_id, connection_id)
      );
    `,
    postgres: `
      CREATE TABLE IF NOT EXISTS destinations (
        id                 TEXT PRIMARY KEY,
        name               TEXT NOT NULL,
        type               TEXT NOT NULL,
        config_json        TEXT NOT NULL,
        encrypted_secrets  TEXT,
        secret_fields_json TEXT NOT NULL DEFAULT '[]',
        include_pii        INTEGER NOT NULL DEFAULT 0,
        pii_approved_by    TEXT,
        scope_json         TEXT NOT NULL,
        interval_sec       INTEGER NOT NULL,
        enabled            INTEGER NOT NULL DEFAULT 1,
        created_by         TEXT,
        created_at         BIGINT NOT NULL,
        updated_at         BIGINT NOT NULL,
        last_run_at        BIGINT,
        last_status        TEXT,
        last_error         TEXT,
        lease_owner        TEXT,
        lease_expires_at   BIGINT
      );
      CREATE TABLE IF NOT EXISTS destination_cursors (
        destination_id TEXT NOT NULL,
        vertical       TEXT NOT NULL,
        resource_type  TEXT NOT NULL,
        changed_at     BIGINT,
        pk             TEXT,
        tombstone_id   BIGINT,
        updated_at     BIGINT NOT NULL,
        PRIMARY KEY (destination_id, vertical, resource_type)
      );
      CREATE TABLE IF NOT EXISTS destination_runs (
        id              TEXT PRIMARY KEY,
        destination_id  TEXT NOT NULL,
        "trigger"       TEXT NOT NULL,
        status          TEXT NOT NULL,
        started_at      BIGINT NOT NULL,
        finished_at     BIGINT,
        rows_written    BIGINT NOT NULL DEFAULT 0,
        deletes_written BIGINT NOT NULL DEFAULT 0,
        files_json      TEXT,
        error           TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_destination_runs_dest
        ON destination_runs (destination_id, started_at);
      CREATE TABLE IF NOT EXISTS destination_connections (
        destination_id  TEXT NOT NULL,
        connection_id   TEXT NOT NULL,
        owner_tenant_id TEXT,
        first_seen_at   BIGINT NOT NULL,
        PRIMARY KEY (destination_id, connection_id)
      );
    `,
  },
]

export type RunStatus = 'running' | 'success' | 'failed'
export type RunTrigger = 'schedule' | 'manual' | 'backfill'

/** A destination as the API sees it — never with secret values. */
export interface DestinationRecord {
  id: string
  name: string
  type: DestinationType
  config: Record<string, unknown>
  /** Names of the secret fields that hold a value. */
  secretFieldsSet: string[]
  includePii: boolean
  piiApprovedBy: string | null
  scope: DestinationScope
  intervalSec: number
  enabled: boolean
  createdBy: string | null
  createdAt: number
  updatedAt: number
  lastRunAt: number | null
  lastStatus: RunStatus | null
  lastError: string | null
}

export interface CreateDestinationInput {
  name: string
  type: string
  config: unknown
  secrets?: unknown
  scope: DestinationScope
  includePii?: boolean
  intervalSec?: number
  enabled?: boolean
  /** Admin user id recorded as `created_by` (and `pii_approved_by` with PII). */
  actor?: string | null
}

export interface UpdateDestinationInput {
  name?: string
  config?: unknown
  scope?: DestinationScope
  includePii?: boolean
  intervalSec?: number
  enabled?: boolean
  actor?: string | null
}

export interface CursorRow {
  vertical: string
  resourceType: string
  changedAt: number | null
  pk: string | null
  tombstoneId: number | null
  updatedAt: number
}

export interface RunFile {
  path: string
  kind: 'rows' | 'deletes' | 'manifest' | 'table'
  vertical?: string
  resourceType?: string
  rows: number
}

export interface RunRecord {
  id: string
  destinationId: string
  trigger: RunTrigger
  status: RunStatus
  startedAt: number
  finishedAt: number | null
  rowsWritten: number
  deletesWritten: number
  files: RunFile[]
  error: string | null
}

interface DestRow {
  id: string
  name: string
  type: string
  config_json: string
  encrypted_secrets: string | null
  secret_fields_json: string
  include_pii: number
  pii_approved_by: string | null
  scope_json: string
  interval_sec: number
  enabled: number
  created_by: string | null
  created_at: number
  updated_at: number
  last_run_at: number | null
  last_status: string | null
  last_error: string | null
  lease_owner: string | null
  lease_expires_at: number | null
}

const PUBLIC_COLUMNS = [
  'id',
  'name',
  'type',
  'config_json',
  'secret_fields_json',
  'include_pii',
  'pii_approved_by',
  'scope_json',
  'interval_sec',
  'enabled',
  'created_by',
  'created_at',
  'updated_at',
  'last_run_at',
  'last_status',
  'last_error',
] as const

function clampInterval(sec: number | undefined): number {
  const n = Math.floor(sec ?? DEFAULT_INTERVAL_SEC)
  if (!Number.isFinite(n)) return DEFAULT_INTERVAL_SEC
  return Math.max(MIN_INTERVAL_SEC, Math.min(MAX_INTERVAL_SEC, n))
}

function num(v: unknown): number {
  return typeof v === 'number' ? v : Number(v)
}

function numOrNull(v: unknown): number | null {
  return v === null || v === undefined ? null : Number(v)
}

/** Error text small enough to store and show; never a stack. */
export function truncateError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err)
  return msg.length > 2000 ? `${msg.slice(0, 2000)}…` : msg
}

export class DestinationStore {
  private constructor(
    private readonly handle: DbHandle,
    private readonly storeSecret: string,
    private readonly now: () => number,
  ) {}

  static async create(
    handle: DbHandle,
    storeSecret: string,
    opts: { now?: () => number } = {},
  ): Promise<DestinationStore> {
    await handle.migrate('destinations', MIGRATIONS)
    return new DestinationStore(handle, storeSecret, opts.now ?? Date.now)
  }

  private get db() {
    return this.handle.kysely
  }

  private toRecord(r: Pick<DestRow, (typeof PUBLIC_COLUMNS)[number]>): DestinationRecord {
    return {
      id: r.id,
      name: r.name,
      type: r.type as DestinationType,
      config: JSON.parse(r.config_json) as Record<string, unknown>,
      secretFieldsSet: JSON.parse(r.secret_fields_json) as string[],
      includePii: Number(r.include_pii) === 1,
      piiApprovedBy: r.pii_approved_by,
      scope: DestinationScopeSchema.parse(JSON.parse(r.scope_json)),
      intervalSec: num(r.interval_sec),
      enabled: Number(r.enabled) === 1,
      createdBy: r.created_by,
      createdAt: num(r.created_at),
      updatedAt: num(r.updated_at),
      lastRunAt: numOrNull(r.last_run_at),
      lastStatus: (r.last_status as RunStatus | null) ?? null,
      lastError: r.last_error,
    }
  }

  private sealSecrets(secrets: Record<string, string>): {
    encrypted_secrets: string | null
    secret_fields_json: string
  } {
    const fields = Object.keys(secrets).sort()
    return {
      encrypted_secrets:
        fields.length > 0
          ? encrypt(JSON.stringify(secrets), this.storeSecret, DESTINATIONS_SALT)
          : null,
      secret_fields_json: JSON.stringify(fields),
    }
  }

  async create(input: CreateDestinationInput): Promise<DestinationRecord> {
    const config = parseConfig(input.type, input.config)
    const secrets = parseSecrets(input.type, input.secrets ?? {})
    assertComplete(input.type, secrets, config)
    const scope = DestinationScopeSchema.parse(input.scope)
    const now = this.now()
    const id = randomUUID()
    const includePii = input.includePii === true
    await this.db
      .insertInto('destinations')
      .values({
        id,
        name: input.name.trim(),
        type: input.type,
        config_json: JSON.stringify(config),
        ...this.sealSecrets(secrets),
        include_pii: includePii ? 1 : 0,
        pii_approved_by: includePii ? (input.actor ?? null) : null,
        scope_json: JSON.stringify(scope),
        interval_sec: clampInterval(input.intervalSec),
        enabled: input.enabled === false ? 0 : 1,
        created_by: input.actor ?? null,
        created_at: now,
        updated_at: now,
      })
      .execute()
    return (await this.get(id))!
  }

  async get(id: string): Promise<DestinationRecord | null> {
    const row = (await this.db
      .selectFrom('destinations')
      .select([...PUBLIC_COLUMNS])
      .where('id', '=', id)
      .executeTakeFirst()) as DestRow | undefined
    return row ? this.toRecord(row) : null
  }

  async list(): Promise<DestinationRecord[]> {
    const rows = (await this.db
      .selectFrom('destinations')
      .select([...PUBLIC_COLUMNS])
      .orderBy('created_at', 'asc')
      .orderBy('id', 'asc')
      .execute()) as DestRow[]
    return rows.map((r) => this.toRecord(r))
  }

  /**
   * Patch the non-secret fields. `config` replaces the whole config (and is
   * re-validated for the destination's type). Turning `includePii` on records
   * `actor` as the approver; turning it off clears the approver.
   */
  async update(id: string, patch: UpdateDestinationInput): Promise<DestinationRecord | null> {
    const current = await this.get(id)
    if (!current) return null
    const set: Record<string, unknown> = { updated_at: this.now() }
    if (patch.name !== undefined) set['name'] = patch.name.trim()
    if (patch.config !== undefined) {
      const config = parseConfig(current.type, patch.config)
      // A new config must still fit the stored credentials (e.g. a stage type).
      assertComplete(current.type, await this.getSecrets(id), config)
      set['config_json'] = JSON.stringify(config)
    }
    if (patch.scope !== undefined) {
      set['scope_json'] = JSON.stringify(DestinationScopeSchema.parse(patch.scope))
    }
    if (patch.includePii !== undefined && patch.includePii !== current.includePii) {
      set['include_pii'] = patch.includePii ? 1 : 0
      set['pii_approved_by'] = patch.includePii ? (patch.actor ?? null) : null
    }
    if (patch.intervalSec !== undefined) set['interval_sec'] = clampInterval(patch.intervalSec)
    if (patch.enabled !== undefined) set['enabled'] = patch.enabled ? 1 : 0
    await this.db.updateTable('destinations').set(set).where('id', '=', id).execute()
    return this.get(id)
  }

  /** Replace the whole secret set (credential rotation). */
  async setSecrets(id: string, secrets: unknown): Promise<DestinationRecord | null> {
    const current = await this.get(id)
    if (!current) return null
    const parsed = parseSecrets(current.type, secrets)
    assertComplete(current.type, parsed, current.config)
    await this.db
      .updateTable('destinations')
      .set({ ...this.sealSecrets(parsed), updated_at: this.now() })
      .where('id', '=', id)
      .execute()
    return this.get(id)
  }

  /** Decrypted secrets — for building a sink only. Never serialise these. */
  async getSecrets(id: string): Promise<Record<string, string>> {
    const row = (await this.db
      .selectFrom('destinations')
      .select(['encrypted_secrets'])
      .where('id', '=', id)
      .executeTakeFirst()) as { encrypted_secrets: string | null } | undefined
    if (!row?.encrypted_secrets) return {}
    return JSON.parse(
      decrypt(row.encrypted_secrets, this.storeSecret, DESTINATIONS_SALT),
    ) as Record<string, string>
  }

  async delete(id: string): Promise<boolean> {
    return this.handle.transaction(async (tx) => {
      await tx.deleteFrom('destination_cursors').where('destination_id', '=', id).execute()
      await tx.deleteFrom('destination_runs').where('destination_id', '=', id).execute()
      await tx.deleteFrom('destination_connections').where('destination_id', '=', id).execute()
      const res = await tx.deleteFrom('destinations').where('id', '=', id).executeTakeFirst()
      return Number(res.numDeletedRows ?? 0) > 0
    })
  }

  // ── Scheduling + lease ────────────────────────────────────────────────

  /** Enabled destinations whose interval has elapsed and that no live lease holds. */
  async listDue(now: number): Promise<DestinationRecord[]> {
    const rows = (await this.db
      .selectFrom('destinations')
      .select([...PUBLIC_COLUMNS])
      .where('enabled', '=', 1)
      .where((eb) => eb.or([eb('lease_expires_at', 'is', null), eb('lease_expires_at', '<', now)]))
      .orderBy('last_run_at', 'asc')
      .execute()) as DestRow[]
    return rows
      .map((r) => this.toRecord(r))
      .filter((d) => d.lastRunAt === null || d.lastRunAt + d.intervalSec * 1000 <= now)
  }

  /**
   * Take the lease with a conditional UPDATE — only one worker's UPDATE can
   * match a free or expired lease, on either dialect. True when taken.
   */
  async claimLease(id: string, owner: string, now: number, leaseMs: number): Promise<boolean> {
    const res = await this.db
      .updateTable('destinations')
      .set({ lease_owner: owner, lease_expires_at: now + leaseMs })
      .where('id', '=', id)
      .where((eb) => eb.or([eb('lease_expires_at', 'is', null), eb('lease_expires_at', '<', now)]))
      .executeTakeFirst()
    return Number(res.numUpdatedRows ?? 0) === 1
  }

  /** Extend a held lease. False when it was lost (expired and re-taken). */
  async renewLease(id: string, owner: string, now: number, leaseMs: number): Promise<boolean> {
    const res = await this.db
      .updateTable('destinations')
      .set({ lease_expires_at: now + leaseMs })
      .where('id', '=', id)
      .where('lease_owner', '=', owner)
      .executeTakeFirst()
    return Number(res.numUpdatedRows ?? 0) === 1
  }

  async releaseLease(id: string, owner: string): Promise<void> {
    await this.db
      .updateTable('destinations')
      .set({ lease_owner: null, lease_expires_at: null })
      .where('id', '=', id)
      .where('lease_owner', '=', owner)
      .execute()
  }

  async leaseOf(id: string): Promise<{ owner: string | null; expiresAt: number | null } | null> {
    const row = (await this.db
      .selectFrom('destinations')
      .select(['lease_owner', 'lease_expires_at'])
      .where('id', '=', id)
      .executeTakeFirst()) as Pick<DestRow, 'lease_owner' | 'lease_expires_at'> | undefined
    return row ? { owner: row.lease_owner, expiresAt: numOrNull(row.lease_expires_at) } : null
  }

  async markResult(
    id: string,
    status: RunStatus,
    error: string | null,
    lastRunAt: number,
  ): Promise<void> {
    await this.db
      .updateTable('destinations')
      .set({ last_status: status, last_error: error, last_run_at: lastRunAt })
      .where('id', '=', id)
      .execute()
  }

  // ── Cursors ───────────────────────────────────────────────────────────

  async getCursor(id: string, vertical: string, resourceType: string): Promise<CursorRow | null> {
    const row = (await this.db
      .selectFrom('destination_cursors')
      .selectAll()
      .where('destination_id', '=', id)
      .where('vertical', '=', vertical)
      .where('resource_type', '=', resourceType)
      .executeTakeFirst()) as
      | {
          vertical: string
          resource_type: string
          changed_at: number | null
          pk: string | null
          tombstone_id: number | null
          updated_at: number
        }
      | undefined
    return row
      ? {
          vertical: row.vertical,
          resourceType: row.resource_type,
          changedAt: numOrNull(row.changed_at),
          pk: row.pk,
          tombstoneId: numOrNull(row.tombstone_id),
          updatedAt: num(row.updated_at),
        }
      : null
  }

  async listCursors(id: string): Promise<CursorRow[]> {
    const rows = (await this.db
      .selectFrom('destination_cursors')
      .selectAll()
      .where('destination_id', '=', id)
      .orderBy('vertical')
      .orderBy('resource_type')
      .execute()) as Array<{
      vertical: string
      resource_type: string
      changed_at: number | null
      pk: string | null
      tombstone_id: number | null
      updated_at: number
    }>
    return rows.map((row) => ({
      vertical: row.vertical,
      resourceType: row.resource_type,
      changedAt: numOrNull(row.changed_at),
      pk: row.pk,
      tombstoneId: numOrNull(row.tombstone_id),
      updatedAt: num(row.updated_at),
    }))
  }

  async setRowCursor(
    id: string,
    vertical: string,
    resourceType: string,
    changedAt: number,
    pk: string,
  ): Promise<void> {
    const now = this.now()
    await this.db
      .insertInto('destination_cursors')
      .values({
        destination_id: id,
        vertical,
        resource_type: resourceType,
        changed_at: changedAt,
        pk,
        tombstone_id: null,
        updated_at: now,
      })
      .onConflict((oc) =>
        oc
          .columns(['destination_id', 'vertical', 'resource_type'])
          .doUpdateSet({ changed_at: changedAt, pk, updated_at: now }),
      )
      .execute()
  }

  async setTombstoneCursor(id: string, tombstoneId: number): Promise<void> {
    const now = this.now()
    await this.db
      .insertInto('destination_cursors')
      .values({
        destination_id: id,
        vertical: TOMBSTONE_CURSOR_KEY,
        resource_type: TOMBSTONE_CURSOR_KEY,
        changed_at: null,
        pk: null,
        tombstone_id: tombstoneId,
        updated_at: now,
      })
      .onConflict((oc) =>
        oc
          .columns(['destination_id', 'vertical', 'resource_type'])
          .doUpdateSet({ tombstone_id: tombstoneId, updated_at: now }),
      )
      .execute()
  }

  /**
   * Backfill: forget the row watermarks so the next run exports everything
   * in scope again. Optionally one vertical, or one (vertical, resource type).
   *
   * The tombstone watermark is kept: rows the destination already holds may
   * still have deletes pending in the feed, and skipping ahead would leave
   * them in place forever.
   */
  async resetCursors(id: string, filter: { vertical?: string; resourceType?: string } = {}) {
    let q = this.db
      .deleteFrom('destination_cursors')
      .where('destination_id', '=', id)
      .where('vertical', '!=', TOMBSTONE_CURSOR_KEY)
    if (filter.vertical) {
      q = q.where('vertical', '=', filter.vertical)
      if (filter.resourceType) q = q.where('resource_type', '=', filter.resourceType)
    }
    const res = await q.executeTakeFirst()
    return Number(res.numDeletedRows ?? 0)
  }

  // ── Connections seen ──────────────────────────────────────────────────

  async recordConnections(id: string, connections: Map<string, string | null>): Promise<void> {
    if (connections.size === 0) return
    const now = this.now()
    const values = [...connections].map(([connectionId, owner]) => ({
      destination_id: id,
      connection_id: connectionId,
      owner_tenant_id: owner,
      first_seen_at: now,
    }))
    for (let i = 0; i < values.length; i += 200) {
      await this.db
        .insertInto('destination_connections')
        .values(values.slice(i, i + 200))
        .onConflict((oc) => oc.columns(['destination_id', 'connection_id']).doNothing())
        .execute()
    }
  }

  /** connection id → owner tenant, for every connection this destination exported. */
  async knownConnections(id: string): Promise<Map<string, string | null>> {
    const rows = (await this.db
      .selectFrom('destination_connections')
      .select(['connection_id', 'owner_tenant_id'])
      .where('destination_id', '=', id)
      .execute()) as Array<{ connection_id: string; owner_tenant_id: string | null }>
    return new Map(rows.map((r) => [r.connection_id, r.owner_tenant_id]))
  }

  // ── Runs ──────────────────────────────────────────────────────────────

  async startRun(
    destinationId: string,
    trigger: RunTrigger,
    startedAt: number,
    id: string = randomUUID(),
  ): Promise<string> {
    await this.db
      .insertInto('destination_runs')
      .values({
        id,
        destination_id: destinationId,
        trigger,
        status: 'running',
        started_at: startedAt,
        rows_written: 0,
        deletes_written: 0,
        files_json: '[]',
      })
      .execute()
    return id
  }

  async finishRun(
    runId: string,
    result: {
      status: Exclude<RunStatus, 'running'>
      finishedAt: number
      rowsWritten: number
      deletesWritten: number
      files: RunFile[]
      error?: string | null
    },
  ): Promise<void> {
    await this.db
      .updateTable('destination_runs')
      .set({
        status: result.status,
        finished_at: result.finishedAt,
        rows_written: result.rowsWritten,
        deletes_written: result.deletesWritten,
        files_json: JSON.stringify(result.files),
        error: result.error ?? null,
      })
      .where('id', '=', runId)
      .execute()
  }

  async listRuns(destinationId: string, limit = 50): Promise<RunRecord[]> {
    const rows = (await this.db
      .selectFrom('destination_runs')
      .selectAll()
      .where('destination_id', '=', destinationId)
      .orderBy('started_at', 'desc')
      .orderBy('id', 'desc')
      .limit(Math.max(1, Math.min(500, Math.floor(limit))))
      .execute()) as Array<{
      id: string
      destination_id: string
      trigger: string
      status: string
      started_at: number
      finished_at: number | null
      rows_written: number
      deletes_written: number
      files_json: string | null
      error: string | null
    }>
    return rows.map((r) => ({
      id: r.id,
      destinationId: r.destination_id,
      trigger: r.trigger as RunTrigger,
      status: r.status as RunStatus,
      startedAt: num(r.started_at),
      finishedAt: numOrNull(r.finished_at),
      rowsWritten: num(r.rows_written),
      deletesWritten: num(r.deletes_written),
      files: r.files_json ? (JSON.parse(r.files_json) as RunFile[]) : [],
      error: r.error,
    }))
  }

  /**
   * Mark runs left `running` by a crashed process as failed. Called by a
   * worker at start; a run whose lease is still live belongs to someone else
   * and is left alone.
   */
  async failOrphanedRuns(now: number): Promise<number> {
    const orphaned = (await this.db
      .selectFrom('destination_runs as r')
      .innerJoin('destinations as d', 'd.id', 'r.destination_id')
      .select(['r.id'])
      .where('r.status', '=', 'running')
      .where((eb) =>
        eb.or([eb('d.lease_expires_at', 'is', null), eb('d.lease_expires_at', '<', now)]),
      )
      .execute()) as Array<{ id: string }>
    for (const r of orphaned) {
      await this.db
        .updateTable('destination_runs')
        .set({ status: 'failed', finished_at: now, error: 'Interrupted (worker stopped mid-run).' })
        .where('id', '=', r.id)
        .execute()
    }
    return orphaned.length
  }
}
