/**
 * CredentialStore — AES-256-GCM encrypted credential storage over the
 * dual-backend `DbHandle` seam (SQLite by default, Postgres when
 * `DATABASE_URL` is set).
 *
 * Connections are keyed by UUID and carry their own `vertical` + `platform`
 * + `tenant_id` columns. The auth middleware looks them up by id only
 * (`?connection_id=…` on every `/v1/*` request); the per-tenant lookup
 * helpers exist for the webhook fan-out path.
 *
 * The optional `salt` constructor argument exists for backward-compatible
 * key rotation; new deployments should use the default salt and let the
 * encryption-at-rest layer take care of itself.
 *
 * Encryption stays OUTSIDE the query seam: `encrypt()/decrypt()` run in JS,
 * and a base64 string crosses the Kysely boundary. The encrypted column is
 * `TEXT` on both dialects, so the
 * ciphertext is byte-identical across backends.
 *
 * BORROWER: this store does NOT own the `DbHandle`. The boot layer opens it,
 * shares it across sibling stores, and closes it. CredentialStore must never
 * close it — there is intentionally no `close()` method.
 */
import { randomUUID } from 'crypto'
import { DEFAULT_SALT, encrypt, decrypt } from './crypto'
import type { DbHandle, DualMigration } from '../db/types'
import { isUniqueViolation } from '../db/sql-errors'
import type { SyncMode, SyncSchedule } from '../data-store/sync-schedule'

export type Credentials = {
  accessToken: string
  refreshToken?: string
  expiresAt?: Date
  scope?: string
  tenantId?: string
  extra?: Record<string, unknown>
  /** Per-connection webhook signing secret, stored encrypted alongside the
   *  rest of the blob. Lets each connection on the same platform verify
   *  inbound webhooks with its OWN secret (multi-tenant isolation). Falls back
   *  to the static per-platform config secret when unset. */
  webhookSecret?: string
}

export class DuplicateLabelError extends Error {
  /**
   * `tenantId` is nullable because the uniqueness it reports is too. In
   * `optional` tenant mode the index keys on `COALESCE(tenant_id, '')`, so two
   * no-tenant connections on one platform collide on label exactly as two of
   * one tenant's do — admin-tooling connections included.
   */
  constructor(tenantId: string | null, platform: string, label: string) {
    super(
      tenantId
        ? `Connection label '${label}' already exists for tenant '${tenantId}' on platform '${platform}'`
        : `Connection label '${label}' already exists on platform '${platform}'`,
    )
    this.name = 'DuplicateLabelError'
  }
}

interface RawRow {
  data: string
}

/** What a create listener learns — identifiers only, never credentials. */
export interface CreatedConnectionInfo {
  id: string
  platform: string
  vertical: string | null
  tenantId: string | null
  ownerTenantId: string | null
}

export interface ConnectionRow {
  /** Stable UUID for this connection. Wire format: `connection_id`. */
  id: string
  platform: string
  /**
   * Which vertical the connection belongs to (`accounting`, `crm`, …).
   * Nullable in the type; the unified service always sets it.
   */
  vertical: string | null
  tenantId: string | null
  /**
   * Deployment tenant that owns this connection. Populated at OAuth
   * callback from the connect-link session's tenantId; nullable — admin
   * tooling does not populate it.
   */
  ownerTenantId: string | null
  label: string | null
  expiresAt: number | null // Unix ms
  createdAt: number
  updatedAt: number
  /** Most recent refresh attempt (Unix ms), regardless of outcome. NULL when
   *  the keep-alive worker has not yet touched this row. */
  lastRefreshAt: number | null
  /** Outcome of the most recent refresh attempt:
   *  - 'ok'             — succeeded
   *  - 'failed'         — transient error (network/5xx/rate-limit); retry next tick
   *  - 'expired'        — hard failure (invalid_grant / unauthorized_client);
   *                       authorization is dead, the CUSTOMER must re-authorize.
   *  - 'platform_error' — the platform's OAuth client credentials were rejected
   *                       (invalid_client); the OPERATOR must fix the client
   *                       id/secret. Customer re-authorization will not help. */
  lastRefreshStatus: 'ok' | 'failed' | 'expired' | 'platform_error' | null
  /** Why the last refresh attempt failed, in a form an operator can act on —
   *  the OAuth code + description + HTTP status, never the response body (see
   *  `describeRefreshError`). Null when the last attempt succeeded or no
   *  failure has been recorded. */
  lastRefreshError: string | null
  /** How often this connection is re-synced — `default` (the deployment
   *  interval), `custom`, `trigger_only` or `once`. See
   *  `data-store/sync-schedule.ts`. Rows from before v3 read `default`. */
  syncMode: SyncMode
  /** Minutes between syncs when `syncMode` is 'custom'; null otherwise. */
  syncIntervalMinutes: number | null
}

export type RefreshStatus = 'ok' | 'failed' | 'expired' | 'platform_error'

/** What a create guard sees: identifiers only, never credentials. */
export interface ConnectionCreateIntent {
  platform: string
  vertical: string | null
  tenantId: string | null
  ownerTenantId: string | null
}

/**
 * Runs inside `create()` BEFORE the insert, so a throw aborts the create (unlike
 * the post-insert `onCreate` listeners, whose failures are swallowed).
 * integration-server installs the license's connection guard here (P5).
 */
export type ConnectionCreateGuard = (intent: ConnectionCreateIntent) => Promise<void> | void

export interface CredentialStoreOptions {
  salt?: string
  /** Controls whether tenant_id is required. Default: 'optional'. */
  tenantMode?: 'optional' | 'required'
  /** Table name. Default: 'credentials'. */
  tableName?: string
  /** Column name for encrypted data. Default: 'data'. */
  dataColumn?: string
}

/**
 * Selected-column projection (snake_case → camelCase) for `ConnectionRow`.
 * Built once per store because the column list is fixed but the table is
 * configurable. Emitted through Kysely's `.select([...])` with `as` aliases
 * so the row maps straight onto `ConnectionRow` on both dialects.
 */
const CONNECTION_SELECT = [
  'id',
  'platform',
  'vertical',
  'tenant_id as tenantId',
  'owner_tenant_id as ownerTenantId',
  'label',
  'expires_at as expiresAt',
  'created_at as createdAt',
  'updated_at as updatedAt',
  'last_refresh_at as lastRefreshAt',
  'last_refresh_status as lastRefreshStatus',
  'last_refresh_error as lastRefreshError',
  'sync_mode as syncMode',
  'sync_interval_minutes as syncIntervalMinutes',
] as const

/**
 * Build the migration set for a given (table, dataColumn, tenantMode).
 *
 * The store is parametrised: the boot layer uses the defaults
 * (`credentials` / `data` / optional), while the keyed test/sibling paths use
 * `connections` / `encrypted` / required. The DDL differs by tenant mode (the
 * `tenant_id NOT NULL` constraint + which unique index keys on label), so the
 * migration array is produced per-instance and passed to `handle.migrate()`
 * under the table name as the namespace.
 *
 * Dialect translation: epoch-ms `INTEGER` columns become `BIGINT` on Postgres;
 * the encrypted data column and JSON-bearing columns stay `TEXT` on both. The
 * COALESCE-in-index expressions, the partial `WHERE label IS NOT NULL` index,
 * and the UNIQUE constraints are valid verbatim on both backends.
 */
function buildMigrations(
  table: string,
  dataCol: string,
  tenantMode: 'optional' | 'required',
): DualMigration[] {
  const tenantConstraint = tenantMode === 'required' ? 'NOT NULL' : ''
  const uniqueIndex =
    tenantMode === 'optional'
      ? `
        CREATE UNIQUE INDEX IF NOT EXISTS uq_${table}_vertical_platform_tenant_label
          ON ${table} (
            COALESCE(vertical, ''),
            platform,
            COALESCE(tenant_id, ''),
            COALESCE(label, '')
          );
      `
      : `
        CREATE UNIQUE INDEX IF NOT EXISTS uq_${table}_vertical_tenant_platform_label
          ON ${table} (COALESCE(vertical, ''), tenant_id, platform, label)
          WHERE label IS NOT NULL;
        CREATE INDEX IF NOT EXISTS idx_${table}_tenant
          ON ${table} (tenant_id);
      `
  const sqlite = `
    CREATE TABLE IF NOT EXISTS ${table} (
      id                  TEXT PRIMARY KEY,
      ${dataCol}          TEXT NOT NULL,
      created_at          INTEGER NOT NULL,
      updated_at          INTEGER NOT NULL,
      platform            TEXT,
      vertical            TEXT,
      tenant_id           TEXT ${tenantConstraint},
      owner_tenant_id     TEXT,
      expires_at          INTEGER,
      label               TEXT,
      last_refresh_at     INTEGER,
      last_refresh_status TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_${table}_platform_tenant
      ON ${table} (platform, tenant_id);
    CREATE INDEX IF NOT EXISTS idx_${table}_vertical_platform
      ON ${table} (vertical, platform);
    CREATE INDEX IF NOT EXISTS idx_${table}_owner_tenant
      ON ${table} (owner_tenant_id, updated_at DESC);
    ${uniqueIndex}
  `
  const postgres = `
    CREATE TABLE IF NOT EXISTS ${table} (
      id                  TEXT PRIMARY KEY,
      ${dataCol}          TEXT NOT NULL,
      created_at          BIGINT NOT NULL,
      updated_at          BIGINT NOT NULL,
      platform            TEXT,
      vertical            TEXT,
      tenant_id           TEXT ${tenantConstraint},
      owner_tenant_id     TEXT,
      expires_at          BIGINT,
      label               TEXT,
      last_refresh_at     BIGINT,
      last_refresh_status TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_${table}_platform_tenant
      ON ${table} (platform, tenant_id);
    CREATE INDEX IF NOT EXISTS idx_${table}_vertical_platform
      ON ${table} (vertical, platform);
    CREATE INDEX IF NOT EXISTS idx_${table}_owner_tenant
      ON ${table} (owner_tenant_id, updated_at DESC);
    ${uniqueIndex}
  `
  // v2 adds the reason a refresh failed. Additive and nullable: existing rows
  // read back null, which the UI renders as "no reason recorded" rather than
  // pretending the last failure had no cause.
  const addRefreshError = `ALTER TABLE ${table} ADD COLUMN last_refresh_error TEXT;`

  // v3 adds the connection's sync schedule (`data-store/sync-schedule.ts`).
  // Every existing row takes the default schedule — the decision for this
  // release: connections start syncing on the deployment interval after the
  // upgrade (the scheduler staggers the first runs; see SyncScheduler).
  const addSyncSchedule = `
    ALTER TABLE ${table} ADD COLUMN sync_mode TEXT NOT NULL DEFAULT 'default';
    ALTER TABLE ${table} ADD COLUMN sync_interval_minutes INTEGER;
  `

  return [
    { version: 1, sqlite, postgres },
    { version: 2, sqlite: addRefreshError, postgres: addRefreshError },
    { version: 3, sqlite: addSyncSchedule, postgres: addSyncSchedule },
  ]
}

/** Table mapping a platform's external account identifier (Stripe `acct_…`,
 *  Shopify shop domain, Xero tenant id) to the owning connection. Lets inbound
 *  webhooks resolve to exactly ONE connection instead of fanning out to every
 *  connection on the platform. Own migration namespace so it versions
 *  independently of the credentials table. */
const EXTERNAL_ACCOUNTS_TABLE = 'connection_external_accounts'

function buildExternalAccountMigrations(): DualMigration[] {
  const sqlite = `
    CREATE TABLE IF NOT EXISTS ${EXTERNAL_ACCOUNTS_TABLE} (
      platform            TEXT NOT NULL,
      external_account_id TEXT NOT NULL,
      connection_id       TEXT NOT NULL,
      vertical            TEXT,
      created_at          INTEGER NOT NULL,
      PRIMARY KEY (platform, external_account_id)
    );
    CREATE INDEX IF NOT EXISTS idx_${EXTERNAL_ACCOUNTS_TABLE}_connection
      ON ${EXTERNAL_ACCOUNTS_TABLE} (connection_id);
  `
  const postgres = `
    CREATE TABLE IF NOT EXISTS ${EXTERNAL_ACCOUNTS_TABLE} (
      platform            TEXT NOT NULL,
      external_account_id TEXT NOT NULL,
      connection_id       TEXT NOT NULL,
      vertical            TEXT,
      created_at          BIGINT NOT NULL,
      PRIMARY KEY (platform, external_account_id)
    );
    CREATE INDEX IF NOT EXISTS idx_${EXTERNAL_ACCOUNTS_TABLE}_connection
      ON ${EXTERNAL_ACCOUNTS_TABLE} (connection_id);
  `
  return [{ version: 1, sqlite, postgres }]
}

/** Raised when an external account is already linked to a DIFFERENT connection.
 *  The `(platform, external_account_id)` primary key enforces one-account →
 *  one-connection, which is the multi-tenant isolation guard. */
export class DuplicateExternalAccountError extends Error {
  constructor(platform: string, externalAccountId: string) {
    super(
      `External account '${externalAccountId}' on '${platform}' is already linked to a connection`,
    )
    this.name = 'DuplicateExternalAccountError'
  }
}

export class CredentialStore {
  private constructor(
    private readonly handle: DbHandle,
    private readonly secret: string,
    private readonly salt: string,
    private readonly table: string,
    private readonly dataCol: string,
    private readonly tenantMode: 'optional' | 'required',
  ) {}

  /**
   * Open the store against a SHARED `DbHandle` (owned by the boot layer),
   * applying migrations under the table name as the namespace. The handle is
   * borrowed — the store never closes it.
   */
  static async create(
    handle: DbHandle,
    secret: string,
    options?: CredentialStoreOptions,
  ): Promise<CredentialStore> {
    const salt = options?.salt ?? DEFAULT_SALT
    const tenantMode = options?.tenantMode ?? 'optional'
    const table = options?.tableName ?? 'credentials'
    const dataCol = options?.dataColumn ?? 'data'
    await handle.migrate(table, buildMigrations(table, dataCol, tenantMode))
    await handle.migrate(EXTERNAL_ACCOUNTS_TABLE, buildExternalAccountMigrations())
    return new CredentialStore(handle, secret, salt, table, dataCol, tenantMode)
  }

  /** The shared backend handle, for sibling stores / ops tooling. The store is
   *  a borrower: callers MUST NOT close it. */
  getHandle(): DbHandle {
    return this.handle
  }

  // ── Canonical API (UUID-keyed, no tenant scope) ─────────────────────────────

  /**
   * Insert a new connection. Returns the generated connection_id.
   *
   * `vertical` is optional in the signature; the unified service always
   * passes it. Two connections with the
   * same `(platform, tenant, label)` can coexist as long as their `vertical`
   * differs — the unique index keys on vertical too.
   */
  async create(
    platform: string,
    tenantId: string | null,
    credentials: Credentials,
    label?: string | null,
    vertical?: string | null,
    ownerTenantId?: string | null,
    syncSchedule?: SyncSchedule | null,
  ): Promise<string> {
    if (this.tenantMode === 'required' && !tenantId) {
      throw new Error('tenantId is required')
    }
    // License (integration-server): vertical entitlement and the connection
    // limit. Every create path funnels through here (OAuth callback, credential
    // form, admin tooling), so this is the authority. A throw ABORTS the create.
    if (this.createGuard) {
      await this.createGuard({
        platform,
        vertical: vertical ?? null,
        tenantId,
        ownerTenantId: ownerTenantId ?? null,
      })
    }
    const id = randomUUID()
    const data = encrypt(JSON.stringify(credentials), this.secret, this.salt)
    const now = Date.now()
    const expiresAt = credentials.expiresAt ? credentials.expiresAt.getTime() : null

    try {
      await this.handle.kysely
        .insertInto(this.table)
        .values({
          id,
          [this.dataCol]: data,
          platform,
          vertical: vertical ?? null,
          tenant_id: tenantId,
          owner_tenant_id: ownerTenantId ?? null,
          label: label ?? null,
          expires_at: expiresAt,
          created_at: now,
          updated_at: now,
          // Omitted = the column default, 'default'. The interval is kept only
          // for 'custom' so a later switch to custom never inherits a stale one.
          sync_mode: syncSchedule?.mode ?? 'default',
          sync_interval_minutes:
            syncSchedule?.mode === 'custom' ? (syncSchedule.intervalMinutes ?? null) : null,
        })
        .execute()
    } catch (err) {
      // Keyed on `label`, not on `label && tenantId`. The unique index in
      // `optional` mode coalesces a null tenant to '', so a duplicate
      // admin-tooling label violates it just as a tenant's does — without
      // this catch it would escape as a raw driver error and a 500, on the
      // OAuth callback as well as here. `label` still guards the case:
      // without one there is nothing for this index to conflict on, and the
      // error is something else.
      if (isUniqueViolation(err) && label) {
        throw new DuplicateLabelError(tenantId, platform, label)
      }
      throw err
    }

    for (const fn of this.createListeners) {
      try {
        await fn({
          id,
          platform,
          vertical: vertical ?? null,
          tenantId,
          ownerTenantId: ownerTenantId ?? null,
        })
      } catch {
        /* listeners must not break the create */
      }
    }

    return id
  }

  /** Load decrypted credentials by connection_id. */
  async loadById(connectionId: string): Promise<Credentials | null> {
    const row = (await this.handle.kysely
      .selectFrom(this.table)
      .select(`${this.dataCol} as data`)
      .where('id', '=', connectionId)
      .executeTakeFirst()) as RawRow | undefined
    if (!row) return null
    const parsed = JSON.parse(decrypt(row.data, this.secret, this.salt)) as Credentials
    if (parsed.expiresAt) parsed.expiresAt = new Date(parsed.expiresAt as unknown as string)
    return parsed
  }

  /** Update encrypted credentials for an existing connection (e.g. after refresh). */
  async updateById(connectionId: string, credentials: Credentials): Promise<void> {
    const data = encrypt(JSON.stringify(credentials), this.secret, this.salt)
    const expiresAt = credentials.expiresAt ? credentials.expiresAt.getTime() : null
    await this.handle.kysely
      .updateTable(this.table)
      .set({ [this.dataCol]: data, expires_at: expiresAt, updated_at: Date.now() })
      .where('id', '=', connectionId)
      .execute()
  }

  /** Record the outcome of a refresh attempt (success or failure) without
   *  touching the encrypted credentials blob. Called by both the on-request
   *  refresh path and the keep-alive worker. */
  async updateRefreshStatus(
    connectionId: string,
    status: RefreshStatus,
    at: number = Date.now(),
    reason?: string | null,
  ): Promise<void> {
    await this.handle.kysely
      .updateTable(this.table)
      .set({
        last_refresh_at: at,
        last_refresh_status: status,
        // Cleared on success, so a stale reason never sits beside a healthy
        // connection. `undefined` means the caller had nothing to say and the
        // previous value stands.
        ...(status === 'ok'
          ? { last_refresh_error: null }
          : reason !== undefined
            ? { last_refresh_error: reason }
            : {}),
      })
      .where('id', '=', connectionId)
      .execute()
  }

  /** Returns the connections the keep-alive worker should attempt to refresh
   *  on the next tick. Filters out:
   *  - rows refreshed within `skipWindowMs` (already up-to-date)
   *  - rows marked `'expired'` or `'platform_error'` more recently than
   *    `deadRetryMs` ago (don't hammer dead authorizations / known-bad
   *    platform creds; one retry per `deadRetryMs` lets us pick up the case
   *    where the customer re-authorized or the operator fixed the secret)
   *  - rows missing a vertical (the worker cannot pick an adapter for them) */
  async listRefreshCandidates(opts: {
    /** Anti-thrash floor: never re-pick a row refreshed this recently. */
    skipWindowMs: number
    deadRetryMs: number
    limit: number
    now?: number
    /**
     * Expiry-driven selection. When set, a row whose access token lapses
     * inside this window is a candidate however recently it refreshed —
     * which is what keeps tokens live between requests. Access tokens are
     * short (Fortnox: one hour), so time-since-refresh alone would leave
     * them lapsed for most of the day and the UI would report the connection
     * as expired even though any request would have renewed it.
     *
     * Omit for pure time-since-refresh selection.
     */
    expiringWithinMs?: number
    /**
     * Cadence for rows with no access-token expiry, used only alongside
     * `expiringWithinMs`. There is no token to keep fresh there — the point
     * is exercising the grant occasionally so providers that expire unused
     * refresh tokens don't drop it. Defaults to the skip window.
     */
    keepWarmMs?: number
  }): Promise<ConnectionRow[]> {
    const now = opts.now ?? Date.now()
    const skipBefore = now - opts.skipWindowMs
    const deadBefore = now - opts.deadRetryMs
    const expiringBefore = opts.expiringWithinMs === undefined ? null : now + opts.expiringWithinMs
    const warmBefore = now - (opts.keepWarmMs ?? opts.skipWindowMs)
    return (
      (await this.handle.kysely
        .selectFrom(this.table)
        .select(CONNECTION_SELECT)
        .where('vertical', 'is not', null)
        // Anti-thrash: whatever else is true, don't re-pick a row we just did.
        .where((eb) =>
          eb.or([eb('last_refresh_at', 'is', null), eb('last_refresh_at', '<', skipBefore)]),
        )
        .where((eb) =>
          expiringBefore === null
            ? // No expiry window configured: due purely on time since last refresh.
              eb.or([eb('last_refresh_at', 'is', null), eb('last_refresh_at', '<', skipBefore)])
            : eb.or([
                // Token lapsing (or already lapsed) — renew it.
                eb.and([eb('expires_at', 'is not', null), eb('expires_at', '<', expiringBefore)]),
                // No token expiry to chase; just exercise the grant now and then.
                eb.and([
                  eb('expires_at', 'is', null),
                  eb.or([
                    eb('last_refresh_at', 'is', null),
                    eb('last_refresh_at', '<', warmBefore),
                  ]),
                ]),
              ]),
        )
        .where((eb) =>
          eb.or([
            eb('last_refresh_status', 'is', null),
            eb('last_refresh_status', '=', 'ok'),
            eb('last_refresh_status', '=', 'failed'),
            eb.and([
              eb('last_refresh_status', 'in', ['expired', 'platform_error']),
              eb('last_refresh_at', '<', deadBefore),
            ]),
          ]),
        )
        // Never-refreshed rows come first, then oldest-refreshed; created_at
        // breaks ties. Postgres defaults NULLS LAST on ASC, so the NULLS
        // FIRST modifier is spelled out for cross-dialect parity.
        .orderBy('last_refresh_at', (ob) => ob.asc().nullsFirst())
        .orderBy('created_at', 'asc')
        .limit(opts.limit)
        .execute()) as ConnectionRow[]
    )
  }

  /**
   * Update connection metadata (label and/or tenantId). Throws on UNIQUE-constraint
   * violations so callers can surface a 409. Pass `undefined` to leave a field unchanged;
   * pass `null` to clear it explicitly.
   */
  async updateMetadata(
    connectionId: string,
    patch: { label?: string | null | undefined; tenantId?: string | null | undefined },
  ): Promise<ConnectionRow> {
    const existing = await this.getRow(connectionId)
    if (!existing) throw new Error(`Connection not found: ${connectionId}`)

    const nextLabel = patch.label === undefined ? existing.label : patch.label
    const nextTenantId = patch.tenantId === undefined ? existing.tenantId : patch.tenantId

    try {
      await this.handle.kysely
        .updateTable(this.table)
        .set({ label: nextLabel, tenant_id: nextTenantId, updated_at: Date.now() })
        .where('id', '=', connectionId)
        .execute()
    } catch (err) {
      // The same collision `updateMetadataForOwner` already reports: the label
      // index is per (tenant, platform). Without this translation the admin
      // PATCH raised the raw driver error, so the router's `DuplicateLabelError`
      // branch — which is written, and documented as a 409 — could never fire,
      // and renaming onto a taken label answered 500 with a SQLite message.
      if (isUniqueViolation(err) && nextLabel) {
        throw new DuplicateLabelError(nextTenantId, existing.platform, nextLabel)
      }
      throw err
    }

    return (await this.getRow(connectionId))!
  }

  /**
   * Set a connection's sync schedule. The caller validates it first
   * (`SyncScheduleSchema`); the interval is stored only for 'custom'.
   * Returns the updated row, or null when no connection has that id.
   */
  async updateSyncSchedule(
    connectionId: string,
    schedule: SyncSchedule,
  ): Promise<ConnectionRow | null> {
    const res = await this.handle.kysely
      .updateTable(this.table)
      .set({
        sync_mode: schedule.mode,
        sync_interval_minutes:
          schedule.mode === 'custom' ? (schedule.intervalMinutes ?? null) : null,
        updated_at: Date.now(),
      })
      .where('id', '=', connectionId)
      .executeTakeFirst()
    if (Number(res.numUpdatedRows) === 0) return null
    return this.getRow(connectionId)
  }

  /**
   * The connections the sync scheduler considers: in a vertical, and in any
   * mode but trigger_only. `once` is included so a connection made without a
   * first sync still gets one; an unrecognised mode is included because it
   * reads as `default` (see `parseSyncMode`). Whether each is actually due is
   * `describeConnectionSync`'s call, not this query's.
   */
  async listSyncScheduled(): Promise<ConnectionRow[]> {
    return (await this.handle.kysely
      .selectFrom(this.table)
      .select(CONNECTION_SELECT)
      .where('vertical', 'is not', null)
      .where('sync_mode', '!=', 'trigger_only')
      .orderBy('created_at', 'asc')
      .execute()) as ConnectionRow[]
  }

  /**
   * Create a connection, disambiguating a colliding label instead of failing.
   *
   * For the Connect Link flow, a `DuplicateLabelError` arrives at the worst
   * possible moment: the customer has already logged in to the platform and
   * granted consent, and the tokens are in hand. Refusing there discards a
   * completed authorization over a naming detail — the customer has to be sent
   * a fresh link and consent all over again, and the operator may never learn
   * why. A label is a human convenience, not identity; it is not worth a grant.
   *
   * So the label gets a numeric suffix and the connection is created. The
   * operator can rename it in one click from the connection page, which is
   * strictly better than not having the connection.
   *
   * Deliberately NOT used by the operator-facing create paths
   * (`POST /auth/{vertical}/{platform}/connect`, the credential form): there a
   * 409 is actionable — the caller chose the label a moment ago and can simply
   * choose another. This is only for the flow where the expensive, unrepeatable
   * work is already done.
   *
   * Returns the label actually used, so callers can log or surface the change.
   */
  async createWithUniqueLabel(
    platform: string,
    tenantId: string | null,
    credentials: Credentials,
    label: string | null | undefined,
    vertical?: string | null,
    ownerTenantId?: string | null,
    syncSchedule?: SyncSchedule | null,
  ): Promise<{ id: string; label: string | null }> {
    // No label cannot collide — the unique index only covers non-null labels.
    if (!label) {
      const id = await this.create(
        platform,
        tenantId,
        credentials,
        label,
        vertical,
        ownerTenantId,
        syncSchedule,
      )
      return { id, label: label ?? null }
    }
    // Bounded: a suffix race that loses 25 times running is a different fault,
    // and an unbounded retry against a failing index would spin.
    for (let attempt = 1; attempt <= 25; attempt++) {
      const candidate = attempt === 1 ? label : `${label} (${attempt})`
      try {
        const id = await this.create(
          platform,
          tenantId,
          credentials,
          candidate,
          vertical,
          ownerTenantId,
          syncSchedule,
        )
        return { id, label: candidate }
      } catch (err) {
        if (err instanceof DuplicateLabelError) continue
        throw err
      }
    }
    // Every candidate taken. Fall back to no label rather than lose the grant.
    const id = await this.create(
      platform,
      tenantId,
      credentials,
      null,
      vertical,
      ownerTenantId,
      syncSchedule,
    )
    return { id, label: null }
  }

  /** Listeners notified after a connection is deleted. Used to cascade-clean
   *  downstream stores (e.g. `ResourceStore.deleteConnection`). */
  private deleteListeners: Array<(row: ConnectionRow) => void | Promise<void>> = []
  private createListeners: Array<(row: CreatedConnectionInfo) => void | Promise<void>> = []

  /** Register a callback fired after each successful delete. Returns an unregister fn. */
  onDelete(fn: (row: ConnectionRow) => void | Promise<void>): () => void {
    this.deleteListeners.push(fn)
    return () => {
      const i = this.deleteListeners.indexOf(fn)
      if (i >= 0) this.deleteListeners.splice(i, 1)
    }
  }

  /**
   * Register a callback fired after each successful create — every path
   * funnels through `create()` (OAuth callback, credential form, admin
   * tooling), so this is the one place "a connection now exists" is knowable.
   * Listeners must not break the create; failures are swallowed.
   */
  onCreate(fn: (row: CreatedConnectionInfo) => void | Promise<void>): () => void {
    this.createListeners.push(fn)
    return () => {
      const i = this.createListeners.indexOf(fn)
      if (i >= 0) this.createListeners.splice(i, 1)
    }
  }

  async deleteById(connectionId: string): Promise<boolean> {
    const row = await this.getRow(connectionId)
    const res = await this.handle.kysely
      .deleteFrom(this.table)
      .where('id', '=', connectionId)
      .executeTakeFirst()
    const deleted = Number(res.numDeletedRows) > 0
    if (deleted) {
      // Drop external-account links so a future connection can reclaim the id.
      await this.unlinkExternalAccounts(connectionId).catch(() => undefined)
    }
    if (deleted && row) {
      for (const fn of this.deleteListeners) {
        try {
          await fn(row)
        } catch {
          /* listeners must not break the delete */
        }
      }
    }
    return deleted
  }

  /**
   * Find all connections in a vertical, optionally narrowed by platform and/or
   * tenant. Drives the unified service's "show me every accounting connection"
   * style queries.
   *
   * Pass `undefined` to match any value for that field; pass `null` to match
   * NULL explicitly.
   */
  async findByVertical(
    vertical: string,
    platform?: string,
    tenantId?: string | null,
  ): Promise<ConnectionRow[]> {
    let q = this.handle.kysely
      .selectFrom(this.table)
      .select(CONNECTION_SELECT)
      .where('vertical', '=', vertical)
    if (platform !== undefined) q = q.where('platform', '=', platform)
    // SQLite `col IS ?` null-safe equality: a null candidate matches NULL rows,
    // a value matches by `=`.
    if (tenantId !== undefined) {
      q = tenantId === null ? q.where('tenant_id', 'is', null) : q.where('tenant_id', '=', tenantId)
    }
    return (await q.orderBy('created_at', 'asc').execute()) as ConnectionRow[]
  }

  /** Find all connections matching (platform, tenantId). tenantId may be undefined to match any. */
  async findByPlatformTenant(
    platform: string,
    tenantId?: string | null,
    vertical?: string,
  ): Promise<ConnectionRow[]> {
    let q = this.handle.kysely
      .selectFrom(this.table)
      .select(CONNECTION_SELECT)
      .where('platform', '=', platform)
    if (vertical !== undefined) q = q.where('vertical', '=', vertical)
    if (tenantId !== undefined) {
      q = tenantId === null ? q.where('tenant_id', 'is', null) : q.where('tenant_id', '=', tenantId)
    }
    return (await q.orderBy('created_at', 'asc').execute()) as ConnectionRow[]
  }

  // ── External-account ↔ connection mapping (inbound webhook routing) ─────────

  /**
   * Link a platform's external account id to a connection. Enforces one
   * external account → one connection via the PK; a second connection
   * claiming the same account raises `DuplicateExternalAccountError`.
   * Idempotent for the SAME connection (re-linking is a no-op).
   */
  async linkExternalAccount(
    platform: string,
    externalAccountId: string,
    connectionId: string,
    vertical?: string | null,
  ): Promise<void> {
    if (!externalAccountId) return
    const existing = await this.handle.kysely
      .selectFrom(EXTERNAL_ACCOUNTS_TABLE)
      .select(['connection_id as connectionId'])
      .where('platform', '=', platform)
      .where('external_account_id', '=', externalAccountId)
      .executeTakeFirst()
    if (existing) {
      if ((existing as { connectionId: string }).connectionId === connectionId) return
      throw new DuplicateExternalAccountError(platform, externalAccountId)
    }
    try {
      await this.handle.kysely
        .insertInto(EXTERNAL_ACCOUNTS_TABLE)
        .values({
          platform,
          external_account_id: externalAccountId,
          connection_id: connectionId,
          vertical: vertical ?? null,
          created_at: Date.now(),
        })
        .execute()
    } catch (err) {
      if (isUniqueViolation(err))
        throw new DuplicateExternalAccountError(platform, externalAccountId)
      throw err
    }
  }

  /** Resolve (platform, externalAccountId) → ConnectionRow, optionally scoped
   *  by vertical. Returns null when unmapped. */
  async findByExternalAccount(
    platform: string,
    externalAccountId: string,
    vertical?: string,
  ): Promise<ConnectionRow | null> {
    if (!externalAccountId) return null
    const link = await this.handle.kysely
      .selectFrom(EXTERNAL_ACCOUNTS_TABLE)
      .select(['connection_id as connectionId'])
      .where('platform', '=', platform)
      .where('external_account_id', '=', externalAccountId)
      .executeTakeFirst()
    if (!link) return null
    const row = await this.getRow((link as { connectionId: string }).connectionId)
    if (!row) return null
    if (vertical !== undefined && row.vertical !== vertical) return null
    return row
  }

  /** Remove all external-account links for a connection (delete cascade). */
  async unlinkExternalAccounts(connectionId: string): Promise<void> {
    await this.handle.kysely
      .deleteFrom(EXTERNAL_ACCOUNTS_TABLE)
      .where('connection_id', '=', connectionId)
      .execute()
  }

  // ── Per-connection webhook signing secret ───────────────────────────────────

  /** Read a connection's webhook signing secret (null when unset). */
  async getWebhookSecret(connectionId: string): Promise<string | null> {
    const creds = await this.loadById(connectionId)
    return creds?.webhookSecret ?? null
  }

  /** Set/replace a connection's webhook signing secret (merged into the blob). */
  async setWebhookSecret(connectionId: string, secret: string): Promise<void> {
    const creds = await this.loadById(connectionId)
    if (!creds) throw new Error(`connection ${connectionId} not found`)
    await this.updateById(connectionId, { ...creds, webhookSecret: secret })
  }

  /** List the per-connection secrets for every connection on (vertical,
   *  platform) that has one. Bounded by connection count — used by the
   *  webhook router's "try each candidate secret" verification fallback. */
  async listWebhookSecretsFor(
    platform: string,
    vertical: string,
  ): Promise<Array<{ connectionId: string; secret: string }>> {
    const rows = await this.findByVertical(vertical, platform)
    const out: Array<{ connectionId: string; secret: string }> = []
    for (const row of rows) {
      const secret = await this.getWebhookSecret(row.id)
      if (secret) out.push({ connectionId: row.id, secret })
    }
    return out
  }

  /** Resolve a composite id (`"platform[:tenantId]"`, stored in the `legacy_id` column) to its UUID row. */
  async findByLegacyId(legacyId: string): Promise<ConnectionRow | null> {
    const row = (await this.handle.kysely
      .selectFrom(this.table)
      .select(CONNECTION_SELECT)
      .where('legacy_id', '=', legacyId)
      .limit(1)
      .executeTakeFirst()) as ConnectionRow | undefined
    return row ?? null
  }

  /** Get a single row by UUID without decrypting. */
  async getRow(connectionId: string): Promise<ConnectionRow | null> {
    const row = (await this.handle.kysely
      .selectFrom(this.table)
      .select(CONNECTION_SELECT)
      .where('id', '=', connectionId)
      .executeTakeFirst()) as ConnectionRow | undefined
    return row ?? null
  }

  /** List all stored connections without decrypting any credential data. */
  async list(): Promise<ConnectionRow[]> {
    return (await this.handle.kysely
      .selectFrom(this.table)
      .select(CONNECTION_SELECT)
      .orderBy('updated_at', 'desc')
      .execute()) as ConnectionRow[]
  }

  private createGuard: ConnectionCreateGuard | null = null

  /** Install the single pre-insert guard; null removes it. */
  setCreateGuard(guard: ConnectionCreateGuard | null): void {
    this.createGuard = guard
  }

  /** Every connection row, deployment-wide: the license limit counts them all. */
  async count(): Promise<number> {
    const row = (await this.handle.kysely
      .selectFrom(this.table)
      .select((eb) => eb.fn.countAll().as('n'))
      .executeTakeFirst()) as { n: number | string | bigint } | undefined
    return Number(row?.n ?? 0)
  }

  /** Connection ids oldest first, by (created_at, id), so "the oldest N" is deterministic (P6). */
  async listIdsInCreationOrder(limit?: number): Promise<string[]> {
    let q = this.handle.kysely
      .selectFrom(this.table)
      .select('id')
      .orderBy('created_at', 'asc')
      .orderBy('id', 'asc')
    if (limit !== undefined) q = q.limit(limit)
    return ((await q.execute()) as Array<{ id: string }>).map((r) => r.id)
  }

  // ── Owner-tenant scoped API (developer /v1/connections) ──────────────────

  /**
   * List connections owned by a deployment tenant (the `owner_tenant_id`
   * column populated at OAuth-callback time). Optional `vertical`/`platform`
   * filters narrow the result. Connections with NULL `owner_tenant_id`
   * (admin-tooling-created rows) are never returned.
   */
  async listForOwner(
    ownerTenantId: string,
    filters?: { vertical?: string; platform?: string },
  ): Promise<ConnectionRow[]> {
    let q = this.handle.kysely
      .selectFrom(this.table)
      .select(CONNECTION_SELECT)
      .where('owner_tenant_id', '=', ownerTenantId)
    if (filters?.vertical) q = q.where('vertical', '=', filters.vertical)
    if (filters?.platform) q = q.where('platform', '=', filters.platform)
    return (await q.orderBy('updated_at', 'desc').execute()) as ConnectionRow[]
  }

  /** Single-row lookup that 404s on cross-tenant access. */
  async getRowForOwner(ownerTenantId: string, connectionId: string): Promise<ConnectionRow | null> {
    const row = (await this.handle.kysely
      .selectFrom(this.table)
      .select(CONNECTION_SELECT)
      .where('id', '=', connectionId)
      .where('owner_tenant_id', '=', ownerTenantId)
      .executeTakeFirst()) as ConnectionRow | undefined
    return row ?? null
  }

  /**
   * Owner-scoped label rename. Returns null when the row doesn't exist or
   * doesn't belong to the calling tenant — caller turns that into a 404.
   */
  async updateMetadataForOwner(
    ownerTenantId: string,
    connectionId: string,
    patch: { label?: string | null | undefined },
  ): Promise<ConnectionRow | null> {
    const existing = await this.getRowForOwner(ownerTenantId, connectionId)
    if (!existing) return null
    const nextLabel = patch.label === undefined ? existing.label : patch.label
    try {
      await this.handle.kysely
        .updateTable(this.table)
        .set({ label: nextLabel, updated_at: Date.now() })
        .where('id', '=', connectionId)
        .where('owner_tenant_id', '=', ownerTenantId)
        .execute()
    } catch (err) {
      if (isUniqueViolation(err) && nextLabel && existing.tenantId) {
        throw new DuplicateLabelError(existing.tenantId, existing.platform, nextLabel)
      }
      throw err
    }
    return this.getRowForOwner(ownerTenantId, connectionId)
  }

  /** Owner-scoped delete. Returns false when the row doesn't belong to the tenant. */
  async deleteForOwner(ownerTenantId: string, connectionId: string): Promise<boolean> {
    // Load first so listeners get the row; the tenant-scoped WHERE below is
    // still what decides whether anything is deleted.
    const row = await this.getRow(connectionId)
    const res = await this.handle.kysely
      .deleteFrom(this.table)
      .where('id', '=', connectionId)
      .where('owner_tenant_id', '=', ownerTenantId)
      .executeTakeFirst()
    const deleted = Number(res.numDeletedRows) > 0
    if (deleted) {
      // Same cascade as deleteById: drop external-account links so a future
      // connection can reclaim the id, and let listeners clear derived state
      // (cached resources, sync jobs). Skipping these would leave orphaned
      // rows behind every developer-initiated delete.
      await this.unlinkExternalAccounts(connectionId).catch(() => undefined)
      if (row) {
        for (const fn of this.deleteListeners) {
          try {
            await fn(row)
          } catch {
            /* listeners must not break the delete */
          }
        }
      }
    }
    return deleted
  }

  // ── Tenant-scoped API ─────────────────────────────────────────────────────

  /** Load decrypted credentials scoped by tenant + connection id. */
  async getByTenant(tenantId: string, connectionId: string): Promise<Credentials | null> {
    const row = (await this.handle.kysely
      .selectFrom(this.table)
      .select(`${this.dataCol} as data`)
      .where('id', '=', connectionId)
      .where('tenant_id', '=', tenantId)
      .executeTakeFirst()) as RawRow | undefined
    if (!row) return null
    const parsed = JSON.parse(decrypt(row.data, this.secret, this.salt)) as Credentials
    if (parsed.expiresAt) parsed.expiresAt = new Date(parsed.expiresAt as unknown as string)
    return parsed
  }

  /** Update encrypted credentials scoped by tenant. */
  async updateByTenant(
    tenantId: string,
    connectionId: string,
    credentials: Credentials,
  ): Promise<void> {
    const data = encrypt(JSON.stringify(credentials), this.secret, this.salt)
    const expiresAt = credentials.expiresAt ? credentials.expiresAt.getTime() : null
    await this.handle.kysely
      .updateTable(this.table)
      .set({ [this.dataCol]: data, expires_at: expiresAt, updated_at: Date.now() })
      .where('id', '=', connectionId)
      .where('tenant_id', '=', tenantId)
      .execute()
  }

  /** Delete a connection scoped by tenant. */
  async deleteByTenant(tenantId: string, connectionId: string): Promise<boolean> {
    const res = await this.handle.kysely
      .deleteFrom(this.table)
      .where('id', '=', connectionId)
      .where('tenant_id', '=', tenantId)
      .executeTakeFirst()
    return Number(res.numDeletedRows) > 0
  }

  /** List all connections for a given tenant. */
  async listByTenant(tenantId: string): Promise<ConnectionRow[]> {
    return (await this.handle.kysely
      .selectFrom(this.table)
      .select(CONNECTION_SELECT)
      .where('tenant_id', '=', tenantId)
      .orderBy('updated_at', 'desc')
      .execute()) as ConnectionRow[]
  }

  /** Get a single row by tenant + UUID without decrypting. */
  async getRowByTenant(tenantId: string, connectionId: string): Promise<ConnectionRow | null> {
    const row = (await this.handle.kysely
      .selectFrom(this.table)
      .select(CONNECTION_SELECT)
      .where('id', '=', connectionId)
      .where('tenant_id', '=', tenantId)
      .executeTakeFirst()) as ConnectionRow | undefined
    return row ?? null
  }

  /** Find connections by tenant and platform. */
  async findByTenantAndPlatform(tenantId: string, platform: string): Promise<ConnectionRow[]> {
    return (await this.handle.kysely
      .selectFrom(this.table)
      .select(CONNECTION_SELECT)
      .where('tenant_id', '=', tenantId)
      .where('platform', '=', platform)
      .orderBy('updated_at', 'desc')
      .execute()) as ConnectionRow[]
  }

  /**
   * Rename a connection's label. Pass `null` to clear it. Throws
   * `DuplicateLabelError` if another connection in the same (tenant, platform)
   * already uses the new label. Returns false if no row matched.
   */
  async rename(tenantId: string, connectionId: string, label: string | null): Promise<boolean> {
    try {
      const res = await this.handle.kysely
        .updateTable(this.table)
        .set({ label, updated_at: Date.now() })
        .where('id', '=', connectionId)
        .where('tenant_id', '=', tenantId)
        .executeTakeFirst()
      return Number(res.numUpdatedRows) > 0
    } catch (err) {
      if (isUniqueViolation(err) && label) {
        const row = await this.getRowByTenant(tenantId, connectionId)
        throw new DuplicateLabelError(tenantId, row?.platform ?? '?', label)
      }
      throw err
    }
  }
}
