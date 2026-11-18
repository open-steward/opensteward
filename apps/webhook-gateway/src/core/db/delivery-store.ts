import { randomUUID, createHash } from 'crypto'
import type { DbHandle, DualMigration } from '@opensteward/shared'

export interface DeliveryRow {
  id: string
  platform: string
  vertical: string
  payload_hash: string
  payload_b64: string | null
  headers_json: string | null
  status: 'delivered' | 'failed' | 'dlq'
  status_code: number | null
  attempts: number
  next_retry_at: number | null
  error: string | null
  created_at: number
  updated_at: number
}

/**
 * What the admin log and DLQ endpoints return: a delivery without the replay
 * copy of its body (`payload_b64`) or its stored request headers
 * (`headers_json`). Those headers are what the platform sent, so they can hold
 * an `authorization` credential (webhooks sent with Basic auth) and signature
 * values; only their names are listed. The retry worker reads full rows
 * through `listRetryable`, never through this shape.
 */
export interface DeliverySummary {
  id: string
  platform: string
  vertical: string
  payload_hash: string
  payload: string
  target_url: string
  status: DeliveryRow['status']
  status_code: number | null
  attempts: number
  next_retry_at: number | null
  error: string | null
  created_at: number
  updated_at: number
  /** Names of the stored relay headers, lower-cased and sorted. Never values. */
  headerNames: string[]
}

// An explicit column list, so a column added later is not exposed by default.
// `headers_json` is read only to derive `headerNames` and is dropped in
// toSummary(); `payload_b64` is never selected.
const SUMMARY_COLUMNS = [
  'id',
  'platform',
  'vertical',
  'payload_hash',
  'payload',
  'target_url',
  'status',
  'status_code',
  'attempts',
  'next_retry_at',
  'error',
  'created_at',
  'updated_at',
  'headers_json',
] as const

type SummaryQueryRow = Omit<DeliverySummary, 'headerNames'> & { headers_json: string | null }

function toSummary(row: SummaryQueryRow): DeliverySummary {
  const { headers_json, ...rest } = row
  return { ...rest, headerNames: storedHeaderNames(headers_json) }
}

// One unreadable row must not take down the whole admin log, which is the view
// an operator reaches for when something is already wrong.
function storedHeaderNames(headersJson: string | null): string[] {
  if (!headersJson) return []
  try {
    const parsed: unknown = JSON.parse(headersJson)
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
      ? Object.keys(parsed).sort()
      : []
  } catch {
    return []
  }
}

const RETRY_DELAYS = [1000, 5000, 30_000, 300_000, 1_800_000] // 1s, 5s, 30s, 5m, 30m
const MAX_ATTEMPTS = RETRY_DELAYS.length + 1

// Epoch-millisecond columns are INTEGER on SQLite, BIGINT on Postgres (the
// PostgresDbHandle parses int8 back to a JS number). The partial retry index
// (`WHERE status = 'failed'`) is valid on both dialects.
const MIGRATIONS: DualMigration[] = [
  {
    version: 1,
    sqlite: `
      CREATE TABLE IF NOT EXISTS deliveries (
        id TEXT PRIMARY KEY,
        platform TEXT NOT NULL,
        vertical TEXT NOT NULL,
        payload_hash TEXT NOT NULL,
        payload TEXT NOT NULL,
        target_url TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        status_code INTEGER,
        attempts INTEGER NOT NULL DEFAULT 0,
        next_retry_at INTEGER,
        error TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_deliveries_status ON deliveries(status);
      CREATE INDEX IF NOT EXISTS idx_deliveries_retry ON deliveries(next_retry_at) WHERE status = 'failed';
    `,
    postgres: `
      CREATE TABLE IF NOT EXISTS deliveries (
        id TEXT PRIMARY KEY,
        platform TEXT NOT NULL,
        vertical TEXT NOT NULL,
        payload_hash TEXT NOT NULL,
        payload TEXT NOT NULL,
        target_url TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        status_code INTEGER,
        attempts INTEGER NOT NULL DEFAULT 0,
        next_retry_at BIGINT,
        error TEXT,
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_deliveries_status ON deliveries(status);
      CREATE INDEX IF NOT EXISTS idx_deliveries_retry ON deliveries(next_retry_at) WHERE status = 'failed';
    `,
  },
  {
    version: 2,
    sqlite: `
      ALTER TABLE deliveries ADD COLUMN payload_b64 TEXT;
      ALTER TABLE deliveries ADD COLUMN headers_json TEXT;
    `,
    postgres: `
      ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS payload_b64 TEXT;
      ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS headers_json TEXT;
    `,
  },
]

/** The bytes to replay: exact when stored (v2+), UTF-8 text for older rows. */
export function deliveryBody(row: { payload: string; payload_b64: string | null }): Buffer {
  return row.payload_b64 != null
    ? Buffer.from(row.payload_b64, 'base64')
    : Buffer.from(row.payload, 'utf8')
}

/** The headers to replay; rows written before v2 get the old JSON default. */
export function deliveryHeaders(row: { headers_json: string | null }): Record<string, string> {
  return row.headers_json
    ? (JSON.parse(row.headers_json) as Record<string, string>)
    : { 'content-type': 'application/json' }
}

export class DeliveryStore {
  private constructor(private readonly handle: DbHandle) {}

  static async create(handle: DbHandle): Promise<DeliveryStore> {
    await handle.migrate('deliveries', MIGRATIONS)
    return new DeliveryStore(handle)
  }

  async createDelivery(
    platform: string,
    vertical: string,
    targetUrl: string,
    payload: Buffer,
    headers: Record<string, string>,
  ): Promise<string> {
    const id = randomUUID()
    const payloadHash = createHash('sha256').update(payload).digest('hex').slice(0, 16)
    const now = Date.now()
    await this.handle.kysely
      .insertInto('deliveries')
      .values({
        id,
        platform,
        vertical,
        payload_hash: payloadHash,
        // `payload` stays as UTF-8 text for the admin log; replays use the
        // exact bytes and headers below.
        payload: payload.toString('utf8'),
        payload_b64: payload.toString('base64'),
        headers_json: JSON.stringify(headers),
        target_url: targetUrl,
        status: 'pending',
        attempts: 0,
        created_at: now,
        updated_at: now,
      })
      .execute()
    return id
  }

  async markDelivered(id: string, statusCode: number): Promise<void> {
    // Read-then-increment avoids a raw `attempts + 1` SQL expression so the
    // store needs no kysely import (kysely is ESM-only; we only ever touch the
    // handle's instance). markDelivered runs once per successful delivery.
    const row = await this.getDelivery(id)
    if (!row) return
    await this.handle.kysely
      .updateTable('deliveries')
      .set({
        status: 'delivered',
        status_code: statusCode,
        attempts: row.attempts + 1,
        updated_at: Date.now(),
      })
      .where('id', '=', id)
      .execute()
  }

  async markFailed(id: string, statusCode: number | null, error: string): Promise<void> {
    const row = await this.getDelivery(id)
    if (!row) return
    const attempts = row.attempts + 1
    if (attempts >= MAX_ATTEMPTS) {
      // Move to DLQ
      await this.handle.kysely
        .updateTable('deliveries')
        .set({
          status: 'dlq',
          status_code: statusCode,
          attempts,
          error,
          next_retry_at: null,
          updated_at: Date.now(),
        })
        .where('id', '=', id)
        .execute()
    } else {
      const delay = RETRY_DELAYS[attempts - 1] ?? RETRY_DELAYS[RETRY_DELAYS.length - 1]
      await this.handle.kysely
        .updateTable('deliveries')
        .set({
          status: 'failed',
          status_code: statusCode,
          attempts,
          error,
          next_retry_at: Date.now() + delay,
          updated_at: Date.now(),
        })
        .where('id', '=', id)
        .execute()
    }
  }

  async getDelivery(id: string): Promise<DeliveryRow | null> {
    const row = await this.handle.kysely
      .selectFrom('deliveries')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst()
    return (row as DeliveryRow | undefined) ?? null
  }

  /** Admin log: no replay body copy, no header values. See DeliverySummary. */
  async listRecent(limit = 50): Promise<DeliverySummary[]> {
    const rows = (await this.handle.kysely
      .selectFrom('deliveries')
      .select(SUMMARY_COLUMNS)
      .orderBy('created_at', 'desc')
      .limit(limit)
      .execute()) as SummaryQueryRow[]
    return rows.map(toSummary)
  }

  /** Admin DLQ view: no replay body copy, no header values. See DeliverySummary. */
  async listDLQ(limit = 50): Promise<DeliverySummary[]> {
    const rows = (await this.handle.kysely
      .selectFrom('deliveries')
      .select(SUMMARY_COLUMNS)
      .where('status', '=', 'dlq')
      .orderBy('created_at', 'desc')
      .limit(limit)
      .execute()) as SummaryQueryRow[]
    return rows.map(toSummary)
  }

  async listRetryable(): Promise<Array<DeliveryRow & { payload: string; target_url: string }>> {
    return (await this.handle.kysely
      .selectFrom('deliveries')
      .selectAll()
      .where('status', '=', 'failed')
      .where('next_retry_at', '<=', Date.now())
      .orderBy('next_retry_at', 'asc')
      .execute()) as Array<DeliveryRow & { payload: string; target_url: string }>
  }

  /** Move a DLQ item back to failed for retry. */
  async retryDLQ(id: string): Promise<boolean> {
    const res = await this.handle.kysely
      .updateTable('deliveries')
      .set({ status: 'failed', next_retry_at: Date.now(), attempts: 0, updated_at: Date.now() })
      .where('id', '=', id)
      .where('status', '=', 'dlq')
      .executeTakeFirst()
    return Number(res.numUpdatedRows) > 0
  }

  /** Test-only: make a row look like one written before migration v2. */
  async clearRelayColumnsForTest(id: string): Promise<void> {
    await this.handle.kysely
      .updateTable('deliveries')
      .set({ payload_b64: null, headers_json: null })
      .where('id', '=', id)
      .execute()
  }

  async close(): Promise<void> {
    await this.handle.close()
  }
}
