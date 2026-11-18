/**
 * WebhookSubscriptionStore — registry of outbound webhook subscribers per
 * tenant, backed by the dual-backend `DbHandle` seam (SQLite or Postgres).
 *
 * The integration-server fires events when interesting things happen
 * (customer created/updated/deleted, connect-link created/consumed) and
 * each subscription whose `events` list matches the fired event receives
 * an HMAC-signed POST to its URL.
 *
 * The shared secret is generated server-side, returned once at create
 * time (the receiver needs it to verify the HMAC), and stored encrypted
 * at rest using the same crypto helpers as `EndUserStore`/`CredentialStore`.
 * Encryption stays OUTSIDE the query seam: ciphertext is a base64 TEXT
 * column on both dialects, so it is byte-identical across backends.
 */
import { randomBytes, randomUUID } from 'crypto'
import { encrypt, decrypt } from './crypto'
import type { DbHandle, DualMigration } from '../db/types'
import {
  DEFAULT_WEBHOOK_FORMAT,
  isWebhookFormat,
  type WebhookFormat,
} from '../control-plane/webhook-formats'

const DEFAULT_SALT = 'opensteward-webhooks-v1'

/** Longest label the column accepts. Matches the `max(200)` every other
 *  label-bearing router in the control plane already enforces. */
export const MAX_WEBHOOK_LABEL_LENGTH = 200

/**
 * Collapses "no label" to a single representation. `''`, `'   '`, `null` and
 * `undefined` all become NULL, so the list search and the "unnamed" branch in
 * the admin views only have one empty case to handle rather than four.
 */
function normaliseLabel(label: string | null | undefined): string | null {
  if (label === null || label === undefined) return null
  const trimmed = label.trim()
  return trimmed.length > 0 ? trimmed.slice(0, MAX_WEBHOOK_LABEL_LENGTH) : null
}

export interface WebhookSubscriptionRow {
  id: string
  tenantId: string
  url: string
  /**
   * Operator-supplied name for this subscription, or null for the ones that
   * predate the column. Purely descriptive — nothing routes on it — but it is
   * what the admin list searches, because a random UUID and a long URL are not
   * what an operator arrives knowing.
   */
  label: string | null
  events: string[]
  /** Destination payload shape. See `control-plane/webhook-formats.ts`. */
  format: WebhookFormat
  /**
   * Names of the custom headers this subscription sends — never the values.
   * A header value is a credential; it leaves the database only inside
   * `matching()`/`headersFor()`, on the delivery path.
   */
  headerNames: string[]
  /** When true the subscription is retained but receives no deliveries. */
  paused: boolean
  createdAt: number
  lastFiredAt: number | null
  lastStatus: number | null
  lastError: string | null
}

export interface WebhookSubscriptionWithSecret extends WebhookSubscriptionRow {
  /** Plaintext shared secret. Returned once on create — never refetchable. */
  secret: string
  /**
   * Decrypted custom headers, populated only on the delivery path
   * (`matching()`); null everywhere else. Never serialized to an HTTP
   * response or a view.
   */
  headers: Record<string, string> | null
}

export interface WebhookSubscriptionStoreOptions {
  salt?: string
  /**
   * Ignored — the store always uses the fixed `webhook_subscriptions` table.
   */
  tableName?: string
}

interface RawRow {
  id: string
  tenant_id: string
  url: string
  label: string | null
  secret_encrypted: string
  events: string
  paused: number
  created_at: number
  last_fired_at: number | null
  last_status: number | null
  last_error: string | null
  format: string
  headers_encrypted: string | null
}

// Epoch-millisecond columns (created_at, last_fired_at) are INTEGER on SQLite
// and BIGINT on Postgres (the PostgresDbHandle parses int8 back to a JS
// number). The encrypted signing secret (secret_encrypted) is a base64 TEXT
// column on both dialects — encryption happens in JS, outside the query, so
// the ciphertext is byte-identical across backends. `events` is JSON-as-TEXT
// (parsed/serialised in JS). The composite index is portable verbatim.
const MIGRATIONS: DualMigration[] = [
  {
    version: 1,
    sqlite: `
      CREATE TABLE IF NOT EXISTS webhook_subscriptions (
        id                TEXT PRIMARY KEY,
        tenant_id         TEXT NOT NULL,
        url               TEXT NOT NULL,
        secret_encrypted  TEXT NOT NULL,
        events            TEXT NOT NULL DEFAULT '["*"]',
        created_at        INTEGER NOT NULL,
        last_fired_at     INTEGER,
        last_status       INTEGER,
        last_error        TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_webhook_subscriptions_tenant
        ON webhook_subscriptions (tenant_id, created_at DESC);
    `,
    postgres: `
      CREATE TABLE IF NOT EXISTS webhook_subscriptions (
        id                TEXT PRIMARY KEY,
        tenant_id         TEXT NOT NULL,
        url               TEXT NOT NULL,
        secret_encrypted  TEXT NOT NULL,
        events            TEXT NOT NULL DEFAULT '["*"]',
        created_at        BIGINT NOT NULL,
        last_fired_at     BIGINT,
        last_status       INTEGER,
        last_error        TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_webhook_subscriptions_tenant
        ON webhook_subscriptions (tenant_id, created_at DESC);
    `,
  },
  {
    version: 2,
    sqlite: `ALTER TABLE webhook_subscriptions ADD COLUMN paused INTEGER NOT NULL DEFAULT 0;`,
    postgres: `ALTER TABLE webhook_subscriptions ADD COLUMN paused INTEGER NOT NULL DEFAULT 0;`,
  },
  // v3 adds the destination format and the encrypted custom-header map.
  // Additive and portable: existing rows read back as the default format with
  // no headers, which is exactly what they were sending before. The header
  // ciphertext uses the same salt as the signing secret, so it is covered by
  // the same entry in `sqlite/encrypted-blobs.ts` that rotation reads.
  {
    version: 3,
    sqlite: `
      ALTER TABLE webhook_subscriptions ADD COLUMN format TEXT NOT NULL DEFAULT 'opensteward';
      ALTER TABLE webhook_subscriptions ADD COLUMN headers_encrypted TEXT;
    `,
    postgres: `
      ALTER TABLE webhook_subscriptions ADD COLUMN format TEXT NOT NULL DEFAULT 'opensteward';
      ALTER TABLE webhook_subscriptions ADD COLUMN headers_encrypted TEXT;
    `,
  },
  // v4 adds the operator-supplied label — the same nullable TEXT column
  // api_keys has carried since v1, and for the same reason: an id is a UUID
  // and a URL is long, so neither is what an operator recognises a
  // subscription by. Nullable with no default on purpose: an existing row has
  // no label and "" would be indistinguishable from one the operator cleared.
  // Plaintext, so unlike headers_encrypted it needs no entry in
  // `sqlite/encrypted-blobs.ts`.
  {
    version: 4,
    sqlite: `ALTER TABLE webhook_subscriptions ADD COLUMN label TEXT;`,
    postgres: `ALTER TABLE webhook_subscriptions ADD COLUMN label TEXT;`,
  },
]

export class WebhookSubscriptionStore {
  private constructor(
    private readonly handle: DbHandle,
    private readonly secret: string,
    private readonly salt: string,
  ) {}

  /**
   * Open the store: apply (any pending) migrations against the shared handle,
   * then return the instance. The handle is BORROWED — it is owned and closed
   * by the boot layer, so this store has no `close()`.
   */
  static async create(
    handle: DbHandle,
    secret: string,
    options?: WebhookSubscriptionStoreOptions,
  ): Promise<WebhookSubscriptionStore> {
    await handle.migrate('webhook_subscriptions', MIGRATIONS)
    return new WebhookSubscriptionStore(handle, secret, options?.salt ?? DEFAULT_SALT)
  }

  private hydrate(row: RawRow): WebhookSubscriptionRow {
    let events: string[] = ['*']
    try {
      const parsed = JSON.parse(row.events)
      if (Array.isArray(parsed)) events = parsed as string[]
    } catch {
      /* fallthrough — default to ['*'] */
    }
    return {
      id: row.id,
      tenantId: row.tenant_id,
      url: row.url,
      label: row.label ?? null,
      events,
      format: isWebhookFormat(row.format) ? row.format : DEFAULT_WEBHOOK_FORMAT,
      headerNames: Object.keys(this.decryptHeaders(row.headers_encrypted) ?? {}),
      paused: !!row.paused,
      createdAt: row.created_at,
      lastFiredAt: row.last_fired_at,
      lastStatus: row.last_status,
      lastError: row.last_error,
    }
  }

  /**
   * Decrypts the stored header map. Returns null when there are none. A row
   * whose ciphertext cannot be read (wrong STORE_SECRET, truncated column) is
   * treated as having no custom headers rather than failing the delivery: the
   * event still reaches the receiver, which then answers 401 and says so.
   */
  private decryptHeaders(ciphertext: string | null): Record<string, string> | null {
    if (!ciphertext) return null
    try {
      const parsed = JSON.parse(decrypt(ciphertext, this.secret, this.salt)) as unknown
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return null
      const entries = Object.entries(parsed as Record<string, unknown>).filter(
        (entry): entry is [string, string] => typeof entry[1] === 'string',
      )
      return entries.length > 0 ? Object.fromEntries(entries) : null
    } catch {
      return null
    }
  }

  /** Encrypts a header map, or returns null when the map is empty. */
  private encryptHeaders(headers: Record<string, string> | null | undefined): string | null {
    if (!headers || Object.keys(headers).length === 0) return null
    return encrypt(JSON.stringify(headers), this.secret, this.salt)
  }

  async create(input: {
    tenantId: string
    url: string
    /** Operator-supplied name. Blank/absent stores NULL, never `''`. */
    label?: string | null
    events?: string[]
    /** Defaults to a 32-byte hex secret when omitted. */
    secret?: string
    /** Destination payload shape. Defaults to the unchanged envelope. */
    format?: WebhookFormat
    /**
     * Custom headers sent with every delivery. Validate with
     * `validateHeaders()` before calling — this store encrypts what it is
     * given and does not re-check the grammar.
     */
    headers?: Record<string, string> | null
  }): Promise<WebhookSubscriptionWithSecret> {
    const id = randomUUID()
    const plaintextSecret = input.secret ?? randomBytes(32).toString('hex')
    const ciphertext = encrypt(plaintextSecret, this.secret, this.salt)
    const events = input.events && input.events.length > 0 ? input.events : ['*']
    const format = this.assertFormat(input.format)
    const headersEncrypted = this.encryptHeaders(input.headers)
    const label = normaliseLabel(input.label)
    const now = Date.now()
    await this.handle.kysely
      .insertInto('webhook_subscriptions')
      .values({
        id,
        tenant_id: input.tenantId,
        url: input.url,
        label,
        secret_encrypted: ciphertext,
        events: JSON.stringify(events),
        created_at: now,
        last_fired_at: null,
        last_status: null,
        last_error: null,
        format,
        headers_encrypted: headersEncrypted,
      })
      .execute()
    return {
      id,
      tenantId: input.tenantId,
      url: input.url,
      label,
      events,
      format,
      headerNames: Object.keys(input.headers ?? {}),
      paused: false,
      createdAt: now,
      lastFiredAt: null,
      lastStatus: null,
      lastError: null,
      secret: plaintextSecret,
      // Not the stored headers: create() echoes back what the caller already
      // has. The decrypted map is only ever produced on the delivery path.
      headers: null,
    }
  }

  /**
   * Guards the one value that can reach the renderer from storage. A format
   * the renderer does not know would throw at delivery time, long after the
   * operator who typed it has gone; reject it at the boundary instead.
   */
  private assertFormat(format: WebhookFormat | undefined): WebhookFormat {
    if (format === undefined) return DEFAULT_WEBHOOK_FORMAT
    if (!isWebhookFormat(format)) throw new Error(`unknown webhook format: ${String(format)}`)
    return format
  }

  async list(tenantId?: string): Promise<WebhookSubscriptionRow[]> {
    let q = this.handle.kysely
      .selectFrom('webhook_subscriptions')
      .select([
        'id',
        'tenant_id',
        'url',
        'label',
        'secret_encrypted',
        'events',
        'paused',
        'created_at',
        'last_fired_at',
        'last_status',
        'last_error',
        'format',
        'headers_encrypted',
      ])
    if (tenantId) q = q.where('tenant_id', '=', tenantId)
    const rows = (await q.orderBy('created_at', 'desc').execute()) as RawRow[]
    return rows.map((r) => this.hydrate(r))
  }

  /**
   * Returns subscription rows that should fire for `(tenantId, event)`,
   * decrypted secret included so the caller can sign the body. Filters
   * by the subscription's `events` list (`*` matches anything).
   */
  async matching(tenantId: string, event: string): Promise<WebhookSubscriptionWithSecret[]> {
    const rows = (await this.handle.kysely
      .selectFrom('webhook_subscriptions')
      .select([
        'id',
        'tenant_id',
        'url',
        'label',
        'secret_encrypted',
        'events',
        'paused',
        'created_at',
        'last_fired_at',
        'last_status',
        'last_error',
        'format',
        'headers_encrypted',
      ])
      .where('tenant_id', '=', tenantId)
      .execute()) as RawRow[]
    return rows
      .map((r) => {
        const hydrated = this.hydrate(r)
        if (hydrated.paused) return null
        if (
          hydrated.events.includes('*') ||
          hydrated.events.includes(event) ||
          // Prefix wildcard match: a pattern ending in `*` covers any event
          // whose name starts with the pattern's prefix. Works for both
          // `customer.*` and `customer:*` style separators.
          hydrated.events.some((e) => e.endsWith('*') && event.startsWith(e.slice(0, -1)))
        ) {
          return {
            ...hydrated,
            secret: decrypt(r.secret_encrypted, this.secret, this.salt),
            headers: this.decryptHeaders(r.headers_encrypted),
          }
        }
        return null
      })
      .filter((r): r is WebhookSubscriptionWithSecret => r !== null)
  }

  /**
   * One subscription by id, with its decrypted signing secret and headers —
   * everything needed to deliver to it directly.
   *
   * Distinct from `matching()`, which resolves subscriptions for a fired
   * event and therefore filters by tenant, by the event list, and by
   * `paused`. A test send targets one subscription the operator named, and
   * works on a paused one: they are checking configuration, not resuming
   * delivery.
   */
  async getWithSecret(id: string): Promise<WebhookSubscriptionWithSecret | null> {
    const row = (await this.handle.kysely
      .selectFrom('webhook_subscriptions')
      .select([
        'id',
        'tenant_id',
        'url',
        'label',
        'secret_encrypted',
        'events',
        'paused',
        'created_at',
        'last_fired_at',
        'last_status',
        'last_error',
        'format',
        'headers_encrypted',
      ])
      .where('id', '=', id)
      .executeTakeFirst()) as RawRow | undefined
    if (!row) return null
    return {
      ...this.hydrate(row),
      secret: decrypt(row.secret_encrypted, this.secret, this.salt),
      headers: this.decryptHeaders(row.headers_encrypted),
    }
  }

  /**
   * Decrypted custom headers for one subscription, or null when it has none
   * or no longer exists.
   *
   * The retry worker calls this per attempt rather than reading headers off
   * the delivery row, because a delivery row is written once at enqueue and
   * replayed for hours afterwards. Reading live means a rotated credential
   * takes effect on the next retry, and one subscription's credential exists
   * in exactly one row instead of being copied into every delivery.
   */
  async headersFor(id: string): Promise<Record<string, string> | null> {
    const row = (await this.handle.kysely
      .selectFrom('webhook_subscriptions')
      .select(['headers_encrypted'])
      .where('id', '=', id)
      .executeTakeFirst()) as { headers_encrypted: string | null } | undefined
    if (!row) return null
    return this.decryptHeaders(row.headers_encrypted)
  }

  /**
   * Updates the delivery settings of an existing subscription. Only `format`,
   * `headers` and `label` can change — `url` and `events` are immutable.
   * Headers are replaced wholesale, never merged: a
   * partial merge would leave an operator unable to remove a header they no
   * longer want. Passing an empty map clears them.
   *
   * `label` follows the same rule: passing `null` or a blank string clears it,
   * and omitting the key leaves it alone. That distinction matters — a PATCH
   * that only changes the format must not wipe the name.
   *
   * Returns false when the id is unknown.
   */
  async updateSettings(
    id: string,
    changes: {
      format?: WebhookFormat
      headers?: Record<string, string> | null
      label?: string | null
    },
  ): Promise<boolean> {
    const existing = (await this.handle.kysely
      .selectFrom('webhook_subscriptions')
      .select(['id'])
      .where('id', '=', id)
      .executeTakeFirst()) as { id: string } | undefined
    if (!existing) return false

    const patch: { format?: string; headers_encrypted?: string | null; label?: string | null } = {}
    if (changes.format !== undefined) patch.format = this.assertFormat(changes.format)
    if (changes.headers !== undefined)
      patch.headers_encrypted = this.encryptHeaders(changes.headers)
    if (changes.label !== undefined) patch.label = normaliseLabel(changes.label)
    if (Object.keys(patch).length === 0) return true

    await this.handle.kysely
      .updateTable('webhook_subscriptions')
      .set(patch)
      .where('id', '=', id)
      .execute()
    return true
  }

  async recordResult(
    id: string,
    opts: { status: number | null; error?: string | null },
  ): Promise<void> {
    await this.handle.kysely
      .updateTable('webhook_subscriptions')
      .set({
        last_fired_at: Date.now(),
        last_status: opts.status,
        last_error: opts.error ?? null,
      })
      .where('id', '=', id)
      .execute()
  }

  /** Pause or resume a subscription. Paused subscriptions are retained but
   *  excluded from `matching`, so no deliveries fire. Returns false if the id
   *  is unknown. */
  async setPaused(id: string, paused: boolean): Promise<boolean> {
    const res = await this.handle.kysely
      .updateTable('webhook_subscriptions')
      .set({ paused: paused ? 1 : 0 })
      .where('id', '=', id)
      .executeTakeFirst()
    return Number(res.numUpdatedRows) > 0
  }

  /** Generate a NEW signing secret for a subscription, replacing the old one.
   *  Returns the plaintext once (never refetchable), or null if id is unknown. */
  async rotateSecret(id: string): Promise<string | null> {
    const exists = await this.handle.kysely
      .selectFrom('webhook_subscriptions')
      .select(['id'])
      .where('id', '=', id)
      .executeTakeFirst()
    if (!exists) return null
    const plaintextSecret = randomBytes(32).toString('hex')
    await this.handle.kysely
      .updateTable('webhook_subscriptions')
      .set({ secret_encrypted: encrypt(plaintextSecret, this.secret, this.salt) })
      .where('id', '=', id)
      .execute()
    return plaintextSecret
  }

  async delete(id: string): Promise<boolean> {
    const res = await this.handle.kysely
      .deleteFrom('webhook_subscriptions')
      .where('id', '=', id)
      .executeTakeFirst()
    return Number(res.numDeletedRows) > 0
  }
}
