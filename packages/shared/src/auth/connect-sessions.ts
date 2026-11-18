/**
 * ConnectSessionStore — dual-backend store for Connect Link sessions.
 *
 * Sits on the same shared `DbHandle` as `CredentialStore` and
 * `EndUserStore` so a single backend connection (SQLite by default,
 * Postgres when `DATABASE_URL` is set) owns everything related to the
 * host deployment's connection lifecycle. Tokens are 32 random bytes
 * (hex-encoded) — used in the public URL and looked up via a unique
 * index.
 *
 * Lifecycle:
 *   - `active`   row inserted by admin, no `consumed_at`, `expires_at` in the future
 *   - `consumed` end-customer completed the flow; `connection_id` populated
 *   - `expired`  TTL passed without consumption (computed at read time, not stored)
 *
 * Revoking a session simply backdates `expires_at` so the same code path
 * that handles natural expiry handles revocation.
 */
import { randomBytes, randomUUID } from 'crypto'
import type { DbHandle, DualMigration } from '../db/types'
import {
  type ConnectAllowedPlatform,
  type ConnectSessionStatus,
  deriveStatus,
} from '../schemas/connect-session'
import { SyncScheduleSchema, type SyncSchedule } from '../data-store/sync-schedule'

const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

/**
 * How a link's OAuth scopes are decided, resolved per-platform at OAuth-start:
 *   - `read_only`        → the chosen platform's curated read-only scopes
 *                          (`readScopes`); falls back to the platform default
 *                          when the platform has none catalogued.
 *   - `platform_default` → no override; the platform/dev-app default scopes.
 *   - `custom`           → the explicit `scopes` array on the session.
 */
export type ScopePolicy = 'read_only' | 'platform_default' | 'custom'

function parseScopes(raw: string | null): string[] | null {
  if (raw === null || raw === '') return null
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.map(String) : null
  } catch {
    return null
  }
}

/**
 * Map the stored `scope_policy` column to a {@link ScopePolicy}. A NULL
 * `scope_policy` maps from `scopes`: a non-empty array reads as 'custom',
 * otherwise 'platform_default'.
 */
function normalizeScopePolicy(raw: string | null, scopes: string[] | null): ScopePolicy {
  if (raw === 'read_only' || raw === 'platform_default' || raw === 'custom') return raw
  return scopes && scopes.length > 0 ? 'custom' : 'platform_default'
}

export interface ConnectSessionRow {
  id: string
  token: string
  tenantId: string
  endUserId: string | null
  label: string
  allowedVerticals: string[]
  allowedPlatforms: ConnectAllowedPlatform[]
  redirectUrl: string | null
  expiresAt: number
  consumedAt: number | null
  connectionId: string | null
  createdAt: number
  createdBy: string | null
  status: ConnectSessionStatus
  /** When true, the connection produced by this session is auto-deleted
   *  after the post-OAuth sync job completes successfully. Pair with a
   *  read-only scope group on the platform's configure page so the OAuth
   *  grant is provider-enforced read-only too. */
  oneTimeOnly: boolean
  /** Per-link OAuth scope override used when `scopePolicy === 'custom'`. NULL
   *  otherwise. Applied at OAuth-start as the `overrideScopes` arg to
   *  `adapter.getAuthUrl(state, overrideScopes)`. */
  scopes: string[] | null
  /** How scopes are decided for this link. See {@link ScopePolicy}. New links
   *  default to 'read_only'; rows with NULL `scope_policy` map from
   *  `scopes` (see `normalizeScopePolicy`). */
  scopePolicy: ScopePolicy
  /** When true and `endUserId` is null, the customer-facing landing page
   *  shows an email-capture form before the adapter picker. Submitting the
   *  form calls `attachEndUser` to upgrade the link to a customer-bound
   *  one. Links created without the flag default to false so they don't
   *  silently become public sign-up surfaces. */
  allowSelfRegister: boolean
  /** The sync schedule the connection this link creates starts with. Null =
   *  the deployment default. A one-time link is always `{ mode: 'once' }`. */
  syncSchedule: SyncSchedule | null
}

/** Reserved for future per-instance options. */
export type ConnectSessionStoreOptions = Record<string, never>

interface RawRow {
  id: string
  token: string
  tenant_id: string
  end_user_id: string | null
  label: string
  allowed_verticals: string
  allowed_platforms: string
  redirect_url: string | null
  expires_at: number
  consumed_at: number | null
  connection_id: string | null
  created_at: number
  created_by: string | null
  one_time_only: number | null
  scopes: string | null
  scope_policy: string | null
  allow_self_register: number | null
  sync_mode: string | null
  sync_interval_minutes: number | null
}

// Epoch-millisecond columns (expires_at, consumed_at, created_at) are INTEGER
// on SQLite and BIGINT on Postgres (the PostgresDbHandle parses int8 back to a
// JS number). JSON-as-TEXT columns (allowed_verticals, allowed_platforms,
// scopes) and boolean-as-INTEGER columns (one_time_only, allow_self_register)
// stay TEXT / INTEGER on BOTH dialects — the store still parses / serialises in
// JS. The UNIQUE constraint on `token` and the lookup indexes are valid
// verbatim on both backends.
const MIGRATIONS: DualMigration[] = [
  {
    version: 1,
    sqlite: `
      CREATE TABLE IF NOT EXISTS connect_sessions (
        id                  TEXT PRIMARY KEY,
        token               TEXT NOT NULL UNIQUE,
        tenant_id           TEXT NOT NULL,
        end_user_id         TEXT,
        label               TEXT NOT NULL,
        allowed_verticals   TEXT NOT NULL DEFAULT '[]',
        allowed_platforms   TEXT NOT NULL DEFAULT '[]',
        redirect_url        TEXT,
        expires_at          INTEGER NOT NULL,
        consumed_at         INTEGER,
        connection_id       TEXT,
        created_at          INTEGER NOT NULL,
        created_by          TEXT,
        one_time_only       INTEGER NOT NULL DEFAULT 0,
        scopes              TEXT,
        allow_self_register INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_connect_sessions_tenant
        ON connect_sessions (tenant_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_connect_sessions_end_user
        ON connect_sessions (end_user_id);
      CREATE INDEX IF NOT EXISTS idx_connect_sessions_connection
        ON connect_sessions (connection_id);
    `,
    postgres: `
      CREATE TABLE IF NOT EXISTS connect_sessions (
        id                  TEXT PRIMARY KEY,
        token               TEXT NOT NULL UNIQUE,
        tenant_id           TEXT NOT NULL,
        end_user_id         TEXT,
        label               TEXT NOT NULL,
        allowed_verticals   TEXT NOT NULL DEFAULT '[]',
        allowed_platforms   TEXT NOT NULL DEFAULT '[]',
        redirect_url        TEXT,
        expires_at          BIGINT NOT NULL,
        consumed_at         BIGINT,
        connection_id       TEXT,
        created_at          BIGINT NOT NULL,
        created_by          TEXT,
        one_time_only       INTEGER NOT NULL DEFAULT 0,
        scopes              TEXT,
        allow_self_register INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_connect_sessions_tenant
        ON connect_sessions (tenant_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_connect_sessions_end_user
        ON connect_sessions (end_user_id);
      CREATE INDEX IF NOT EXISTS idx_connect_sessions_connection
        ON connect_sessions (connection_id);
    `,
  },
  {
    // Per-link scope policy. Resolved per-platform at OAuth-start so a
    // multi-platform link can still mean "read-only" without storing a fixed
    // (and platform-specific) scope array. Rows with NULL scope_policy are
    // mapped in `hydrate`: scopes present → 'custom', else → 'platform_default'.
    // New links default to 'read_only' at the
    // creation layer (customers-router / admin), not in this store.
    version: 2,
    sqlite: `ALTER TABLE connect_sessions ADD COLUMN scope_policy TEXT;`,
    postgres: `ALTER TABLE connect_sessions ADD COLUMN scope_policy TEXT;`,
  },
  {
    // v3: the sync schedule the link's connection starts with. NULL = the
    // deployment default. See data-store/sync-schedule.ts.
    version: 3,
    sqlite: `
      ALTER TABLE connect_sessions ADD COLUMN sync_mode TEXT;
      ALTER TABLE connect_sessions ADD COLUMN sync_interval_minutes INTEGER;
    `,
    postgres: `
      ALTER TABLE connect_sessions ADD COLUMN sync_mode TEXT;
      ALTER TABLE connect_sessions ADD COLUMN sync_interval_minutes INTEGER;
    `,
  },
]

/** A stored link schedule, re-validated on the way out; a row that no longer
 *  parses (a hand edit) reads as "the deployment default" rather than throwing. */
function hydrateSyncSchedule(mode: string | null, interval: number | null): SyncSchedule | null {
  if (mode === null) return null
  const parsed = SyncScheduleSchema.safeParse(
    mode === 'custom' ? { mode, intervalMinutes: interval } : { mode },
  )
  return parsed.success ? parsed.data : null
}

export class ConnectSessionStore {
  private constructor(private readonly handle: DbHandle) {}

  /**
   * Open the store against the shared handle, applying (any pending)
   * migrations for the `connect_sessions` namespace. The handle is owned by
   * the boot layer and SHARED with sibling stores — this store never closes
   * it.
   */
  static async create(
    handle: DbHandle,
    _options?: ConnectSessionStoreOptions,
  ): Promise<ConnectSessionStore> {
    await handle.migrate('connect_sessions', MIGRATIONS)
    return new ConnectSessionStore(handle)
  }

  /**
   * True iff at least one consumed session links the given connection to the
   * given deployment tenant. Used by the developer-key middleware to decide
   * whether a tenant-scoped key may operate on a `connection_id`.
   */
  async connectionBelongsToTenant(connectionId: string, tenantId: string): Promise<boolean> {
    const row = await this.handle.kysely
      .selectFrom('connect_sessions')
      .select('id')
      .where('connection_id', '=', connectionId)
      .where('tenant_id', '=', tenantId)
      .limit(1)
      .executeTakeFirst()
    return row !== undefined
  }

  /**
   * End-user variant: true iff at least one consumed session links this
   * connection to the given end-user record. Used by the end-user-token
   * middleware so an `eut_*` bearer can only operate on the customer's
   * own connections.
   */
  async connectionBelongsToEndUser(connectionId: string, endUserId: string): Promise<boolean> {
    const row = await this.handle.kysely
      .selectFrom('connect_sessions')
      .select('id')
      .where('connection_id', '=', connectionId)
      .where('end_user_id', '=', endUserId)
      .limit(1)
      .executeTakeFirst()
    return row !== undefined
  }

  /**
   * List every `connection_id` the given end-user owns (i.e. that appears
   * on any consumed session for them). Used by `GET /v1/me/connections`.
   */
  async connectionsForEndUser(endUserId: string): Promise<string[]> {
    const rows = (await this.handle.kysely
      .selectFrom('connect_sessions')
      .select('connection_id')
      .distinct()
      .where('end_user_id', '=', endUserId)
      .where('connection_id', 'is not', null)
      .execute()) as Array<{ connection_id: string }>
    return rows.map((r) => r.connection_id)
  }

  private hydrate(row: RawRow, now: number = Date.now()): ConnectSessionRow {
    const allowedVerticals = JSON.parse(row.allowed_verticals) as string[]
    const allowedPlatforms = JSON.parse(row.allowed_platforms) as ConnectAllowedPlatform[]
    return {
      id: row.id,
      token: row.token,
      tenantId: row.tenant_id,
      endUserId: row.end_user_id,
      label: row.label,
      allowedVerticals,
      allowedPlatforms,
      redirectUrl: row.redirect_url,
      expiresAt: row.expires_at,
      consumedAt: row.consumed_at,
      connectionId: row.connection_id,
      createdAt: row.created_at,
      createdBy: row.created_by,
      status: deriveStatus({ consumedAt: row.consumed_at, expiresAt: row.expires_at }, now),
      oneTimeOnly: row.one_time_only === 1,
      scopes: parseScopes(row.scopes),
      scopePolicy: normalizeScopePolicy(row.scope_policy, parseScopes(row.scopes)),
      allowSelfRegister: row.allow_self_register === 1,
      // A one-time link reads `once` whatever was stored: the developer-API
      // mint path stores one-time links with no schedule, and the connection
      // such a link makes is `once` regardless (see auth-router/connect-router).
      syncSchedule:
        row.one_time_only === 1
          ? { mode: 'once' }
          : hydrateSyncSchedule(row.sync_mode, row.sync_interval_minutes),
    }
  }

  // ── Public API ────────────────────────────────────────────────────────────

  async create(input: {
    tenantId: string
    label: string
    endUserId?: string | null
    allowedVerticals?: string[]
    allowedPlatforms?: ConnectAllowedPlatform[]
    redirectUrl?: string | null
    expiresAt?: number
    createdBy?: string | null
    oneTimeOnly?: boolean
    /** Per-link OAuth scope override, used when `scopePolicy === 'custom'`.
     *  Omit otherwise. */
    scopes?: string[] | null
    /** How scopes are decided for this link. Defaults are NOT applied here —
     *  the creation layer (customers-router / admin) passes 'read_only' for new
     *  links. When omitted, falls back to 'custom' if `scopes` is non-empty,
     *  else 'platform_default'. */
    scopePolicy?: ScopePolicy
    /** Allow the customer to self-register (provide their own email) when
     *  `endUserId` is null. Defaults to false for safety. */
    allowSelfRegister?: boolean
    /** The connection's starting sync schedule. Omit or null for the deployment default. */
    syncSchedule?: SyncSchedule | null
  }): Promise<ConnectSessionRow> {
    const id = randomUUID()
    const token = randomBytes(32).toString('hex')
    const now = Date.now()
    const expiresAt = input.expiresAt ?? now + DEFAULT_TTL_MS
    const hasScopes = Array.isArray(input.scopes) && input.scopes.length > 0
    const scopePolicy: ScopePolicy =
      input.scopePolicy ?? (hasScopes ? 'custom' : 'platform_default')
    // Only retain the explicit scope array for the 'custom' policy.
    const scopesJson = scopePolicy === 'custom' && hasScopes ? JSON.stringify(input.scopes) : null
    await this.handle.kysely
      .insertInto('connect_sessions')
      .values({
        id,
        token,
        tenant_id: input.tenantId,
        end_user_id: input.endUserId ?? null,
        label: input.label,
        allowed_verticals: JSON.stringify(input.allowedVerticals ?? []),
        allowed_platforms: JSON.stringify(input.allowedPlatforms ?? []),
        redirect_url: input.redirectUrl ?? null,
        expires_at: expiresAt,
        consumed_at: null,
        connection_id: null,
        created_at: now,
        created_by: input.createdBy ?? null,
        one_time_only: input.oneTimeOnly ? 1 : 0,
        scopes: scopesJson,
        scope_policy: scopePolicy,
        allow_self_register: input.allowSelfRegister ? 1 : 0,
        sync_mode: input.syncSchedule?.mode ?? null,
        sync_interval_minutes:
          input.syncSchedule?.mode === 'custom'
            ? (input.syncSchedule.intervalMinutes ?? null)
            : null,
      })
      .execute()
    return (await this.getById(id))!
  }

  async getById(id: string): Promise<ConnectSessionRow | null> {
    const row = (await this.handle.kysely
      .selectFrom('connect_sessions')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst()) as RawRow | undefined
    return row ? this.hydrate(row) : null
  }

  async getByToken(token: string): Promise<ConnectSessionRow | null> {
    const row = (await this.handle.kysely
      .selectFrom('connect_sessions')
      .selectAll()
      .where('token', '=', token)
      .executeTakeFirst()) as RawRow | undefined
    return row ? this.hydrate(row) : null
  }

  /** Find the consuming session for a connection. Used by the post-sync
   *  cleanup hook to look up the originating session and check its
   *  `oneTimeOnly` flag. Returns null when no session ever consumed this
   *  connection (e.g. admin-tooling-created connections). */
  async getByConnectionId(connectionId: string): Promise<ConnectSessionRow | null> {
    const row = (await this.handle.kysely
      .selectFrom('connect_sessions')
      .selectAll()
      .where('connection_id', '=', connectionId)
      .limit(1)
      .executeTakeFirst()) as RawRow | undefined
    return row ? this.hydrate(row) : null
  }

  async list(opts?: {
    tenantId?: string
    endUserId?: string
    status?: ConnectSessionStatus
    limit?: number
    offset?: number
  }): Promise<ConnectSessionRow[]> {
    let q = this.handle.kysely.selectFrom('connect_sessions').selectAll()
    if (opts?.tenantId) {
      q = q.where('tenant_id', '=', opts.tenantId)
    }
    if (opts?.endUserId) {
      q = q.where('end_user_id', '=', opts.endUserId)
    }
    const limit = Math.min(opts?.limit ?? 100, 500)
    const offset = Math.max(opts?.offset ?? 0, 0)
    const rows = (await q
      .orderBy('created_at', 'desc')
      .limit(limit)
      .offset(offset)
      .execute()) as RawRow[]
    const now = Date.now()
    const hydrated = rows.map((r) => this.hydrate(r, now))
    return opts?.status ? hydrated.filter((s) => s.status === opts.status) : hydrated
  }

  /** Mark a session consumed by attaching a freshly-created `connection_id`. */
  async markConsumed(id: string, connectionId: string): Promise<ConnectSessionRow | null> {
    const now = Date.now()
    await this.handle.kysely
      .updateTable('connect_sessions')
      .set({ consumed_at: now, connection_id: connectionId })
      .where('id', '=', id)
      .where('consumed_at', 'is', null)
      .execute()
    return this.getById(id)
  }

  /** Revoke by backdating expiry; idempotent. */
  async revoke(id: string): Promise<boolean> {
    const now = Date.now()
    const res = await this.handle.kysely
      .updateTable('connect_sessions')
      .set({ expires_at: now - 1 })
      .where('id', '=', id)
      .where('consumed_at', 'is', null)
      .where('expires_at', '>', now)
      .executeTakeFirst()
    return Number(res.numUpdatedRows) > 0
  }

  /** Attach a customer to a self-register link. Idempotent: only writes
   *  when the row currently has `end_user_id IS NULL` AND
   *  `allow_self_register = 1`, so a second call from a stale tab can't
   *  rebind the link to a different customer. Returns the updated row,
   *  or null when the link was already bound or doesn't allow self-register. */
  async attachEndUser(id: string, endUserId: string): Promise<ConnectSessionRow | null> {
    const res = await this.handle.kysely
      .updateTable('connect_sessions')
      .set({ end_user_id: endUserId })
      .where('id', '=', id)
      .where('end_user_id', 'is', null)
      .where('allow_self_register', '=', 1)
      .executeTakeFirst()
    if (Number(res.numUpdatedRows) === 0) return null
    return this.getById(id)
  }

  /** Used by the GDPR delete path: nulls every `end_user_id` that points at the given user id. */
  async detachEndUser(endUserId: string): Promise<number> {
    const res = await this.handle.kysely
      .updateTable('connect_sessions')
      .set({ end_user_id: null })
      .where('end_user_id', '=', endUserId)
      .executeTakeFirst()
    return Number(res.numUpdatedRows)
  }
}
