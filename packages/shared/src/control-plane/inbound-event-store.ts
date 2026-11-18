/**
 * InboundEventStore — durable, queryable log of verified inbound platform
 * webhook events, backed by the dual-backend `DbHandle` seam (SQLite or
 * Postgres).
 *
 * Serves two jobs at once:
 *   1. **Canonical event stream** — customers poll `GET /v1/events?after_seq=`
 *      using the monotonic `seq` cursor to pull every platform event for their
 *      tenant in order.
 *   2. **Idempotency ledger** — the `UNIQUE(dedup_key)` constraint means a
 *      replayed platform delivery `append()`s once and returns `inserted:false`
 *      thereafter, so the consumer's side effects (outbound bridge, cache
 *      refresh) fire at most once per logical event.
 *
 * BORROWER: the handle is owned/closed by the boot layer; this store never
 * closes it.
 */
import { randomUUID } from 'crypto'
import type { DbHandle, DualMigration } from '../db/types'
import { isUniqueViolation } from '../db/sql-errors'

export interface InboundEventInsert {
  dedupKey: string
  tenantId: string | null
  vertical: string
  platform: string
  connectionId: string | null
  eventType: string
  resourceType: string
  action: string
  resourceId: string
  payload: unknown
  receivedAt?: number
}

export interface InboundEventRow {
  seq: number
  id: string
  tenantId: string | null
  vertical: string
  platform: string
  connectionId: string | null
  eventType: string
  resourceType: string
  action: string
  resourceId: string
  payload: unknown
  receivedAt: number
}

interface RawRow {
  seq: number
  id: string
  tenant_id: string | null
  vertical: string
  platform: string
  connection_id: string | null
  event_type: string
  resource_type: string
  action: string
  resource_id: string
  payload: string
  received_at: number
}

// `seq` is the monotonic cursor: SQLite INTEGER PRIMARY KEY AUTOINCREMENT,
// Postgres BIGSERIAL. `id` (UUID) is a separate UNIQUE column. `dedup_key`
// UNIQUE is the idempotency anchor. `received_at` is epoch-ms (INTEGER/BIGINT).
const MIGRATIONS: DualMigration[] = [
  {
    version: 1,
    sqlite: `
      CREATE TABLE IF NOT EXISTS inbound_events (
        seq           INTEGER PRIMARY KEY AUTOINCREMENT,
        id            TEXT NOT NULL UNIQUE,
        dedup_key     TEXT NOT NULL UNIQUE,
        tenant_id     TEXT,
        vertical      TEXT NOT NULL,
        platform      TEXT NOT NULL,
        connection_id TEXT,
        event_type    TEXT NOT NULL,
        resource_type TEXT NOT NULL,
        action        TEXT NOT NULL,
        resource_id   TEXT NOT NULL DEFAULT '',
        payload       TEXT NOT NULL,
        received_at   INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_inbound_events_tenant_seq
        ON inbound_events (tenant_id, seq);
      CREATE INDEX IF NOT EXISTS idx_inbound_events_connection
        ON inbound_events (connection_id, received_at DESC);
    `,
    postgres: `
      CREATE TABLE IF NOT EXISTS inbound_events (
        seq           BIGSERIAL PRIMARY KEY,
        id            TEXT NOT NULL UNIQUE,
        dedup_key     TEXT NOT NULL UNIQUE,
        tenant_id     TEXT,
        vertical      TEXT NOT NULL,
        platform      TEXT NOT NULL,
        connection_id TEXT,
        event_type    TEXT NOT NULL,
        resource_type TEXT NOT NULL,
        action        TEXT NOT NULL,
        resource_id   TEXT NOT NULL DEFAULT '',
        payload       TEXT NOT NULL,
        received_at   BIGINT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_inbound_events_tenant_seq
        ON inbound_events (tenant_id, seq);
      CREATE INDEX IF NOT EXISTS idx_inbound_events_connection
        ON inbound_events (connection_id, received_at DESC);
    `,
  },
]

export class InboundEventStore {
  private constructor(private readonly handle: DbHandle) {}

  static async create(handle: DbHandle): Promise<InboundEventStore> {
    await handle.migrate('inbound_events', MIGRATIONS)
    return new InboundEventStore(handle)
  }

  private hydrate(r: RawRow): InboundEventRow {
    return {
      seq: Number(r.seq),
      id: r.id,
      tenantId: r.tenant_id,
      vertical: r.vertical,
      platform: r.platform,
      connectionId: r.connection_id,
      eventType: r.event_type,
      resourceType: r.resource_type,
      action: r.action,
      resourceId: r.resource_id,
      payload: safeParse(r.payload),
      receivedAt: Number(r.received_at),
    }
  }

  /**
   * Append one event. Idempotent on `dedupKey`: a repeat returns
   * `{ inserted: false }` and writes nothing. Callers gate their side effects
   * on `inserted === true`.
   */
  async append(input: InboundEventInsert): Promise<{ inserted: boolean; id: string }> {
    const id = randomUUID()
    try {
      await this.handle.kysely
        .insertInto('inbound_events')
        .values({
          id,
          dedup_key: input.dedupKey,
          tenant_id: input.tenantId,
          vertical: input.vertical,
          platform: input.platform,
          connection_id: input.connectionId,
          event_type: input.eventType,
          resource_type: input.resourceType,
          action: input.action,
          resource_id: input.resourceId || '',
          payload: JSON.stringify(input.payload ?? null),
          received_at: input.receivedAt ?? Date.now(),
        })
        .execute()
      return { inserted: true, id }
    } catch (err) {
      if (isUniqueViolation(err)) return { inserted: false, id }
      throw err
    }
  }

  /** Customer poll: events for a tenant after a cursor, ascending by seq. */
  async listForTenant(
    tenantId: string,
    opts?: { afterSeq?: number; limit?: number },
  ): Promise<InboundEventRow[]> {
    const limit = Math.min(opts?.limit ?? 100, 500)
    const rows = (await this.handle.kysely
      .selectFrom('inbound_events')
      .selectAll()
      .where('tenant_id', '=', tenantId)
      .where('seq', '>', opts?.afterSeq ?? 0)
      .orderBy('seq', 'asc')
      .limit(limit)
      .execute()) as RawRow[]
    return rows.map((r) => this.hydrate(r))
  }

  /** Maintenance gc: delete events older than `cutoff` (epoch ms). */
  async deleteOlderThan(cutoff: number): Promise<number> {
    const res = await this.handle.kysely
      .deleteFrom('inbound_events')
      .where('received_at', '<', cutoff)
      .executeTakeFirst()
    return Number(res.numDeletedRows ?? 0)
  }
}

function safeParse(s: string): unknown {
  try {
    return JSON.parse(s)
  } catch {
    return null
  }
}
