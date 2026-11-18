/**
 * ApiKeyStore — dual-backend store for tenant-scoped developer API keys.
 *
 * Plaintext format:  osk_<tenant-suffix>_<random-hex>            (live keys)
 *                     osk_test_<tenant-suffix>_<random-hex>       (test keys)
 *   - `osk_` prefix is a static brand marker.
 *   - `test_` marks a sandbox key. It is a DISPLAY marker only: the
 *     authoritative mode is the `mode` column, never the string. A tenant
 *     literally named `test` mints a *live* key whose plaintext also reads
 *     `osk_test_…`, so sniffing the prefix would be a privilege-escalation
 *     bug. `apiKeyPrefixOf` handles both shapes for the indexed lookup.
 *   - `<tenant-suffix>` is up to 24 lowercase chars derived from the
 *     tenantId, kept human-recognisable in CLI output and logs.
 *   - `<random-hex>` is 32 random hex chars (16 bytes).
 *
 * The first 12 chars of the plaintext (`osk_<8-char prefix>`) are stored
 * unencrypted as `prefix` so verification is an indexed lookup followed
 * by a constant-time hash compare against the rest of the secret.
 *
 * Salt is deliberately distinct from `CredentialStore` and `EndUserStore`
 * so the same `STORE_SECRET` produces different key material.
 *
 * Sits on the shared `DbHandle` (SQLite by default, Postgres when
 * `DATABASE_URL` is set) so a single backend connection owns every
 * deployment-side store. Hashing stays OUTSIDE the query seam: scrypt
 * happens in JS and the base64 `hash` column is a TEXT column on both
 * dialects, byte-identical across backends. The handle is owned by boot
 * and SHARED with sibling stores — this store never closes it.
 */
import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'crypto'
import type { DbHandle, DualMigration } from '../db/types'

const DEFAULT_SALT = 'opensteward-api-keys-v1'
const DEFAULT_TABLE = 'developer_api_keys'
const KEY_PREFIX = 'osk_'
/**
 * Sandbox marker, immediately after `KEY_PREFIX`. Display only — see the
 * module docstring and `apiKeyPrefixOf`.
 */
const TEST_MARKER = 'test_'
const HASH_LEN = 32
const RANDOM_LEN = 16 // bytes -> 32 hex chars
const TENANT_SUFFIX_MAX = 24

/**
 * Which surface a key addresses. `live` keys work on `/v1/*`; `test` keys work
 * on `/test/v1/*`. Crossing is refused in both directions — see
 * `resolveApiKey` in `control-plane/api-key-middleware.ts`.
 */
export type ApiKeyMode = 'live' | 'test'

export interface ApiKeyRow {
  id: string
  tenantId: string
  prefix: string
  label: string | null
  scopes: string[]
  mode: ApiKeyMode
  createdAt: number
  lastUsedAt: number | null
  revokedAt: number | null
  /** Hard expiry (epoch ms). Past this, verify refuses the key. Null = never. */
  expiresAt: number | null
  /** Scheduled revocation from a rotation's grace window (epoch ms). */
  revokeAt: number | null
  /** Id of the key this one replaced, when minted by `rotate`. */
  rotatedFrom: string | null
}

export interface MintResult {
  id: string
  tenantId: string
  prefix: string
  label: string | null
  scopes: string[]
  mode: ApiKeyMode
  /** The plaintext key. Returned ONCE on mint and never persisted. */
  plaintext: string
  createdAt: number
  /** Always null on a fresh key — present so the mint response is a
   *  complete key record (matches the `lastUsedAt`/`revokedAt` columns
   *  returned by `list`/`get`, and the admin-api `ApiKeyMint` schema). */
  lastUsedAt: number | null
  revokedAt: number | null
  expiresAt: number | null
  revokeAt: number | null
  rotatedFrom: string | null
}

/**
 * Result of `rotate`: a full mint of the replacement key plus when the old
 * key stops working.
 */
export interface RotateResult extends MintResult {
  /** When the replaced key's grace window ends (epoch ms). */
  oldKeyRevokeAt: number
}

/**
 * Returns true when `grants` (the scope list on a key) covers `required`
 * (the scope a route demands). `*` grants everything; `<resource>:*` grants
 * any action on that resource (e.g. `customers:*` covers `customers:read`
 * and `customers:write`).
 */
export function hasScope(grants: readonly string[], required: string): boolean {
  if (grants.includes('*') || grants.includes(required)) return true
  const colon = required.indexOf(':')
  if (colon > 0) {
    const resource = required.slice(0, colon)
    if (grants.includes(`${resource}:*`)) return true
  }
  return false
}

/**
 * Returns true when the scope grants a write action. `*` and any
 * `<resource>:*` grant; `*:write` grants; the explicit
 * `vertical:write`, `customers:write`, etc. all grant.
 *
 * Used by `mcp:read` enforcement at mint time — a key flagged for MCP
 * usage cannot coexist with any write authority on the same row.
 */
function grantsWriteAuthority(scope: string): boolean {
  if (scope === '*') return true
  if (scope.endsWith(':*')) return true
  if (scope.endsWith(':write')) return true
  return false
}

export class IncompatibleMcpScopesError extends Error {
  constructor(public readonly conflictingScopes: string[]) {
    super(
      `mcp:read cannot coexist with write-granting scopes on the same key. ` +
        `Conflicting: ${conflictingScopes.join(', ')}. ` +
        `Mint a separate key for write traffic.`,
    )
    this.name = 'IncompatibleMcpScopesError'
  }
}

/**
 * Throw IncompatibleMcpScopesError if `scopes` contains `mcp:read`
 * alongside any write-granting scope. The check is purely structural —
 * the auth middleware *also* refuses non-GET methods at request time
 * (defence in depth), but rejecting the mint surfaces the mistake
 * immediately rather than at the first write attempt.
 */
export function assertMcpScopesCompatible(scopes: readonly string[]): void {
  if (!scopes.includes('mcp:read')) return
  const conflicts = scopes.filter(grantsWriteAuthority)
  if (conflicts.length > 0) throw new IncompatibleMcpScopesError(conflicts)
}

export interface ApiKeyStoreOptions {
  salt?: string
  tableName?: string
}

function tenantSuffix(tenantId: string): string {
  return (
    tenantId
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, TENANT_SUFFIX_MAX) || 't'
  )
}

/**
 * The indexed-lookup prefix for a plaintext key: the brand marker (plus the
 * `test_` marker when present) followed by 8 characters of tenant suffix.
 *
 * `mint` and `verify` MUST both go through this. Hardcoding
 * `slice(0, KEY_PREFIX.length + 8)` at either call site would, on a test key,
 * consume 5 of those 8 characters with the literal `test_` — leaving 3 chars
 * of tenant suffix and collapsing index selectivity to "every test key". Not a
 * DoS (scrypt runs once, outside the candidate loop), but the index stops
 * doing its job. Sharing one function also means the two sides cannot drift.
 */
export function apiKeyPrefixOf(plaintext: string): string {
  const base = plaintext.startsWith(KEY_PREFIX + TEST_MARKER)
    ? KEY_PREFIX + TEST_MARKER
    : KEY_PREFIX
  return plaintext.slice(0, base.length + 8)
}

function hash(plaintext: string, secret: string, salt: string): Buffer {
  return scryptSync(plaintext, `${salt}|${secret}`, HASH_LEN, { N: 16384, r: 8, p: 1 })
}

// Epoch-millisecond columns (created_at, last_used_at, revoked_at,
// v_write_migrated_at) are INTEGER on SQLite and BIGINT on Postgres (the
// PostgresDbHandle parses int8 back to a JS number). The `hash` column stays
// TEXT on both dialects — scrypt runs in JS and a base64 string crosses the
// query seam, byte-identical across backends. `scopes` is a JSON-as-TEXT
// column (the store parses/serialises in JS). The prefix-lookup and
// tenant-listing indexes are valid verbatim on both backends.
const MIGRATIONS: DualMigration[] = [
  {
    version: 1,
    sqlite: `
      CREATE TABLE IF NOT EXISTS developer_api_keys (
        id                   TEXT PRIMARY KEY,
        tenant_id            TEXT NOT NULL,
        prefix               TEXT NOT NULL,
        hash                 TEXT NOT NULL,
        label                TEXT,
        scopes               TEXT NOT NULL DEFAULT '["*"]',
        created_at           INTEGER NOT NULL,
        last_used_at         INTEGER,
        revoked_at           INTEGER,
        v_write_migrated_at  INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_developer_api_keys_prefix ON developer_api_keys (prefix);
      CREATE INDEX IF NOT EXISTS idx_developer_api_keys_tenant ON developer_api_keys (tenant_id, created_at DESC);
    `,
    postgres: `
      CREATE TABLE IF NOT EXISTS developer_api_keys (
        id                   TEXT PRIMARY KEY,
        tenant_id            TEXT NOT NULL,
        prefix               TEXT NOT NULL,
        hash                 TEXT NOT NULL,
        label                TEXT,
        scopes               TEXT NOT NULL DEFAULT '["*"]',
        created_at           BIGINT NOT NULL,
        last_used_at         BIGINT,
        revoked_at           BIGINT,
        v_write_migrated_at  BIGINT
      );
      CREATE INDEX IF NOT EXISTS idx_developer_api_keys_prefix ON developer_api_keys (prefix);
      CREATE INDEX IF NOT EXISTS idx_developer_api_keys_tenant ON developer_api_keys (tenant_id, created_at DESC);
    `,
  },
  // `mode` discriminates the live `/v1/*` surface from the `/test/v1/*`
  // sandbox. Defaulting to 'live' backfills every existing row to exactly the
  // behaviour it already had, so no key needs re-minting. The same DDL is
  // valid on both dialects.
  {
    version: 2,
    sqlite: `ALTER TABLE developer_api_keys ADD COLUMN mode TEXT NOT NULL DEFAULT 'live';`,
    postgres: `ALTER TABLE developer_api_keys ADD COLUMN mode TEXT NOT NULL DEFAULT 'live';`,
  },
  // Key lifecycle: optional expiry (checked at verify), rotation grace window
  // (`revoke_at` — a scheduled revocation stamped lazily on the first verify
  // past it, so no sweeper process is needed), and rotation lineage
  // (`rotated_from` — the id of the key this one replaced). All nullable, so
  // every existing row keeps exactly the behaviour it had.
  {
    version: 3,
    sqlite: `
      ALTER TABLE developer_api_keys ADD COLUMN expires_at INTEGER;
      ALTER TABLE developer_api_keys ADD COLUMN revoke_at INTEGER;
      ALTER TABLE developer_api_keys ADD COLUMN rotated_from TEXT;
    `,
    postgres: `
      ALTER TABLE developer_api_keys ADD COLUMN expires_at BIGINT;
      ALTER TABLE developer_api_keys ADD COLUMN revoke_at BIGINT;
      ALTER TABLE developer_api_keys ADD COLUMN rotated_from TEXT;
    `,
  },
]

export class ApiKeyStore {
  private constructor(
    private readonly handle: DbHandle,
    private readonly secret: string,
    private readonly salt: string,
    private readonly table: string,
  ) {}

  /**
   * Open the store against the shared handle, applying (any pending)
   * migrations for the `developer_api_keys` namespace. The handle is owned by
   * the boot layer and SHARED with sibling stores — this store never closes it.
   */
  static async create(
    handle: DbHandle,
    secret: string,
    options?: ApiKeyStoreOptions,
  ): Promise<ApiKeyStore> {
    await handle.migrate('developer_api_keys', MIGRATIONS)
    return new ApiKeyStore(
      handle,
      secret,
      options?.salt ?? DEFAULT_SALT,
      options?.tableName ?? DEFAULT_TABLE,
    )
  }

  private parseScopes(raw: string | null): string[] {
    if (!raw) return ['*']
    try {
      const arr = JSON.parse(raw)
      return Array.isArray(arr) ? (arr as string[]) : ['*']
    } catch {
      return ['*']
    }
  }

  /**
   * Anything that is not exactly `'test'` reads as `'live'` — a NULL column on
   * a row written before the v2 migration, or a value corrupted by hand. Live
   * is the safe default in both directions: it grants nothing the key did not
   * already have, and it refuses on `/test/v1/*`.
   */
  private parseMode(raw: string | null | undefined): ApiKeyMode {
    return raw === 'test' ? 'test' : 'live'
  }

  private hydrate(row: {
    id: string
    tenant_id: string
    prefix: string
    label: string | null
    scopes?: string | null
    mode?: string | null
    created_at: number
    last_used_at: number | null
    revoked_at: number | null
    expires_at?: number | null
    revoke_at?: number | null
    rotated_from?: string | null
  }): ApiKeyRow {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      prefix: row.prefix,
      label: row.label,
      scopes: this.parseScopes(row.scopes ?? null),
      mode: this.parseMode(row.mode),
      createdAt: row.created_at,
      lastUsedAt: row.last_used_at,
      revokedAt: row.revoked_at,
      expiresAt: row.expires_at ?? null,
      revokeAt: row.revoke_at ?? null,
      rotatedFrom: row.rotated_from ?? null,
    }
  }

  /**
   * Mint a fresh key for a tenant. Returns the plaintext exactly once —
   * after this call the secret is unrecoverable.
   */
  async mint(input: {
    tenantId: string
    label?: string | null
    scopes?: string[]
    /** Defaults to `'live'`. */
    mode?: ApiKeyMode
    /** Optional hard expiry (epoch ms). Verify refuses the key past it. */
    expiresAt?: number | null
  }): Promise<MintResult> {
    const id = randomUUID()
    const mode: ApiKeyMode = input.mode === 'test' ? 'test' : 'live'
    const random = randomBytes(RANDOM_LEN).toString('hex')
    const marker = mode === 'test' ? TEST_MARKER : ''
    const plaintext = `${KEY_PREFIX}${marker}${tenantSuffix(input.tenantId)}_${random}`
    const prefix = apiKeyPrefixOf(plaintext)
    const hashBuf = hash(plaintext, this.secret, this.salt).toString('base64')
    const scopes = input.scopes && input.scopes.length > 0 ? input.scopes : ['*']
    assertMcpScopesCompatible(scopes)
    const now = Date.now()
    await this.handle.kysely
      .insertInto(this.table)
      .values({
        id,
        tenant_id: input.tenantId,
        prefix,
        hash: hashBuf,
        label: input.label ?? null,
        scopes: JSON.stringify(scopes),
        mode,
        created_at: now,
        last_used_at: null,
        revoked_at: null,
        expires_at: input.expiresAt ?? null,
        revoke_at: null,
        rotated_from: null,
      })
      .execute()
    return {
      id,
      tenantId: input.tenantId,
      prefix,
      label: input.label ?? null,
      scopes,
      mode,
      plaintext,
      createdAt: now,
      lastUsedAt: null,
      revokedAt: null,
      expiresAt: input.expiresAt ?? null,
      revokeAt: null,
      rotatedFrom: null,
    }
  }

  /**
   * Validate a plaintext key and return the row that owns it. Updates
   * `last_used_at` on success. Returns `null` for unknown/revoked keys.
   */
  async verify(plaintext: string): Promise<ApiKeyRow | null> {
    if (!plaintext.startsWith(KEY_PREFIX)) return null
    const prefix = apiKeyPrefixOf(plaintext)
    const candidates = (await this.handle.kysely
      .selectFrom(this.table)
      .select([
        'id',
        'tenant_id',
        'prefix',
        'hash',
        'label',
        'scopes',
        'mode',
        'created_at',
        'last_used_at',
        'revoked_at',
        'expires_at',
        'revoke_at',
        'rotated_from',
      ])
      .where('prefix', '=', prefix)
      .where('revoked_at', 'is', null)
      .execute()) as Array<{
      id: string
      tenant_id: string
      prefix: string
      hash: string
      label: string | null
      scopes: string | null
      mode: string | null
      created_at: number
      last_used_at: number | null
      revoked_at: number | null
      expires_at: number | null
      revoke_at: number | null
      rotated_from: string | null
    }>
    if (candidates.length === 0) return null

    const incoming = hash(plaintext, this.secret, this.salt)
    for (const c of candidates) {
      const stored = Buffer.from(c.hash, 'base64')
      if (stored.length === incoming.length && timingSafeEqual(stored, incoming)) {
        const now = Date.now()
        if (c.expires_at !== null && c.expires_at <= now) return null
        if (c.revoke_at !== null && c.revoke_at <= now) {
          // A rotation's grace window has ended. Stamp the revocation lazily
          // — done here, on the first verify past the deadline, so no sweeper
          // process is needed and `list` shows the row as revoked from the
          // moment anyone would notice.
          await this.handle.kysely
            .updateTable(this.table)
            .set({ revoked_at: c.revoke_at })
            .where('id', '=', c.id)
            .where('revoked_at', 'is', null)
            .execute()
          return null
        }
        await this.handle.kysely
          .updateTable(this.table)
          .set({ last_used_at: now })
          .where('id', '=', c.id)
          .execute()
        return this.hydrate({ ...c, last_used_at: now })
      }
    }
    return null
  }

  async list(tenantId?: string, options?: { mode?: ApiKeyMode }): Promise<ApiKeyRow[]> {
    let q = this.handle.kysely
      .selectFrom(this.table)
      .select([
        'id',
        'tenant_id',
        'prefix',
        'label',
        'scopes',
        'mode',
        'created_at',
        'last_used_at',
        'revoked_at',
        'expires_at',
        'revoke_at',
        'rotated_from',
      ])
    if (tenantId) q = q.where('tenant_id', '=', tenantId)
    // Filtering for 'live' has to include rows whose column is NULL: a key
    // minted before the v2 migration is live, and `parseMode` already reads it
    // that way. Filtering on the column alone would hide them.
    if (options?.mode === 'test') q = q.where('mode', '=', 'test')
    else if (options?.mode === 'live') {
      q = q.where((eb) => eb.or([eb('mode', 'is', null), eb('mode', '!=', 'test')]))
    }
    const rows = (await q.orderBy('created_at', 'desc').execute()) as Array<{
      id: string
      tenant_id: string
      prefix: string
      label: string | null
      scopes: string | null
      mode: string | null
      created_at: number
      last_used_at: number | null
      revoked_at: number | null
      expires_at: number | null
      revoke_at: number | null
      rotated_from: string | null
    }>
    return rows.map((r) => this.hydrate(r))
  }

  async revoke(id: string): Promise<boolean> {
    const res = await this.handle.kysely
      .updateTable(this.table)
      .set({ revoked_at: Date.now() })
      .where('id', '=', id)
      .where('revoked_at', 'is', null)
      .executeTakeFirst()
    return Number(res.numUpdatedRows) > 0
  }

  /** Default rotation grace window: the old key keeps working this long. */
  static readonly DEFAULT_ROTATE_OVERLAP_MS = 24 * 3_600_000

  /**
   * Rotate a key: mint a replacement with the same tenant, label, scopes and
   * mode, and schedule the old key's revocation `overlapMs` from now — the
   * grace window in which BOTH keys verify, so the caller can redeploy
   * without a downtime gap. The old key's revocation is enforced lazily by
   * `verify`, no sweeper needed.
   *
   * The replacement gets `expiresAt` from the options, NOT inherited from
   * the old row: expiry is a policy about issuance date, and carrying the
   * old absolute date over would make a rotated key die on the original
   * key's schedule.
   *
   * Returns null when the key does not exist, is revoked, or is expired.
   * Rotating an already-rotated key inside its grace window is refused too
   * (`rotatedInto` guards it) — rotate the replacement instead.
   */
  async rotate(
    id: string,
    options?: { overlapMs?: number; expiresAt?: number | null },
  ): Promise<RotateResult | null> {
    const rows = (await this.handle.kysely
      .selectFrom(this.table)
      .select([
        'id',
        'tenant_id',
        'label',
        'scopes',
        'mode',
        'revoked_at',
        'expires_at',
        'revoke_at',
      ])
      .where('id', '=', id)
      .execute()) as Array<{
      id: string
      tenant_id: string
      label: string | null
      scopes: string | null
      mode: string | null
      revoked_at: number | null
      expires_at: number | null
      revoke_at: number | null
    }>
    const row = rows[0]
    const now = Date.now()
    if (!row || row.revoked_at !== null) return null
    if (row.expires_at !== null && row.expires_at <= now) return null
    if (row.revoke_at !== null) return null

    const rotatedInto = (await this.handle.kysely
      .selectFrom(this.table)
      .select(['id'])
      .where('rotated_from', '=', id)
      .where('revoked_at', 'is', null)
      .execute()) as Array<{ id: string }>
    if (rotatedInto.length > 0) return null

    const overlapMs = Math.max(0, options?.overlapMs ?? ApiKeyStore.DEFAULT_ROTATE_OVERLAP_MS)
    const replacement = await this.mint({
      tenantId: row.tenant_id,
      label: row.label,
      scopes: this.parseScopes(row.scopes),
      mode: this.parseMode(row.mode),
      expiresAt: options?.expiresAt ?? null,
    })
    const oldKeyRevokeAt = now + overlapMs
    await this.handle.kysely
      .updateTable(this.table)
      .set({ revoke_at: oldKeyRevokeAt })
      .where('id', '=', id)
      .execute()
    await this.handle.kysely
      .updateTable(this.table)
      .set({ rotated_from: id })
      .where('id', '=', replacement.id)
      .execute()
    return { ...replacement, rotatedFrom: id, oldKeyRevokeAt }
  }

  /**
   * One-shot upgrade: any non-revoked key whose scopes include at least one
   * `vertical:<v>` but lack both `*` and `vertical:write` gets `vertical:write`
   * appended. Idempotent — the `v_write_migrated_at` column marks each row so
   * subsequent boots short-circuit without touching scopes.
   *
   * Returns the count of keys actually upgraded plus the count of keys
   * skipped (already migrated, or never needed migration). Caller logs the
   * result on boot.
   */
  async migrateVerticalWriteScopes(): Promise<{ upgraded: number; skipped: number }> {
    const rows = (await this.handle.kysely
      .selectFrom(this.table)
      .select(['id', 'scopes'])
      .where('revoked_at', 'is', null)
      .where('v_write_migrated_at', 'is', null)
      .execute()) as Array<{ id: string; scopes: string }>

    let upgraded = 0
    let skipped = 0
    const now = Date.now()

    for (const row of rows) {
      const scopes = this.parseScopes(row.scopes)
      const hasWildcard = scopes.includes('*')
      const hasWrite = scopes.includes('vertical:write')
      const hasAnyVertical = scopes.some(
        (s) => s.startsWith('vertical:') && s !== 'vertical:read' && s !== 'vertical:write',
      )
      if (hasWildcard || hasWrite || !hasAnyVertical) {
        // Either already permissive (`*`), already upgraded (`vertical:write`),
        // or the key never had any vertical touch scope — leave alone, just
        // mark so we don't re-scan on every boot.
        await this.handle.kysely
          .updateTable(this.table)
          .set({ v_write_migrated_at: now })
          .where('id', '=', row.id)
          .execute()
        skipped++
        continue
      }
      const next = [...scopes, 'vertical:write']
      await this.handle.kysely
        .updateTable(this.table)
        .set({ scopes: JSON.stringify(next), v_write_migrated_at: now })
        .where('id', '=', row.id)
        .execute()
      upgraded++
    }
    return { upgraded, skipped }
  }
}
