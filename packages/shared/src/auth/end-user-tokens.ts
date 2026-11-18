/**
 * EndUserTokenStore — sibling of ApiKeyStore for `eut_*` tokens
 * minted on behalf of one end-user (a customer of the host).
 *
 * The plaintext token shape mirrors `osk_<tenantSuffix>_<random>`:
 *   eut_<endUserSuffix>_<random>
 *
 * One end-user can hold multiple tokens (one per AI-agent install —
 * Claude Desktop, Cursor, etc.). The store lives alongside
 * `developer_api_keys` on the same shared backend; same encryption
 * (scrypt + STORE_SECRET), same prefix-then-verify lookup.
 *
 * Default scope set on mint: ["mcp:read", "eut:read"] — read-only by
 * construction. The mint guard from api-keys.ts is duplicated here
 * (rejects any write-granting scope alongside mcp:read).
 *
 * Sits on the shared `DbHandle` (SQLite by default, Postgres when
 * `DATABASE_URL` is set) so a single backend connection owns every
 * deployment-side store. Hashing stays OUTSIDE the query seam: scrypt
 * runs in JS and the base64 `hash` column is TEXT on both dialects,
 * byte-identical across backends. The handle is owned by boot and SHARED
 * with sibling stores — this store never closes it.
 */
import { randomBytes, randomUUID, scryptSync } from 'crypto'
import { assertMcpScopesCompatible } from './api-keys'
import type { DbHandle, DualMigration } from '../db/types'

const KEY_PREFIX = 'eut_'
const RANDOM_LEN = 32
const HASH_LEN = 32
const DEFAULT_SALT = 'opensteward-end-user-tokens-v1'
const DEFAULT_TABLE = 'end_user_tokens'
const END_USER_SUFFIX_MAX = 16

export interface EndUserTokenRow {
  id: string
  endUserId: string
  tenantId: string
  prefix: string
  label: string | null
  scopes: string[]
  createdAt: number
  createdBy: string | null
  lastUsedAt: number | null
  revokedAt: number | null
}

export interface EndUserMintResult {
  id: string
  endUserId: string
  tenantId: string
  prefix: string
  label: string | null
  scopes: string[]
  plaintext: string
  createdAt: number
  /** Present so the mint response is a complete token record (matches the
   *  `created_by`/`last_used_at`/`revoked_at` columns returned by `list`,
   *  and the admin-api `EndUserTokenMint` schema). `lastUsedAt`/`revokedAt`
   *  are always null on a fresh token. */
  createdBy: string | null
  lastUsedAt: number | null
  revokedAt: number | null
}

export interface EndUserTokenStoreOptions {
  salt?: string
  tableName?: string
}

function endUserSuffix(endUserId: string): string {
  return (
    endUserId
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, END_USER_SUFFIX_MAX) || 'eu'
  )
}

function hash(plaintext: string, secret: string, salt: string): Buffer {
  return scryptSync(plaintext, `${salt}|${secret}`, HASH_LEN, { N: 16384, r: 8, p: 1 })
}

const DEFAULT_END_USER_SCOPES = ['mcp:read', 'eut:read'] as const

// Epoch-millisecond columns (created_at, last_used_at, revoked_at) are INTEGER
// on SQLite and BIGINT on Postgres (the PostgresDbHandle parses int8 back to a
// JS number). The `hash` column stays TEXT on both dialects — scrypt runs in JS
// and a base64 string crosses the query seam, byte-identical across backends.
// `scopes` is a JSON-as-TEXT column (the store parses/serialises in JS). The
// prefix-lookup, end-user and tenant indexes are valid verbatim on both
// backends.
const MIGRATIONS: DualMigration[] = [
  {
    version: 1,
    sqlite: `
      CREATE TABLE IF NOT EXISTS end_user_tokens (
        id            TEXT PRIMARY KEY,
        end_user_id   TEXT NOT NULL,
        tenant_id     TEXT NOT NULL,
        prefix        TEXT NOT NULL,
        hash          TEXT NOT NULL,
        label         TEXT,
        scopes        TEXT NOT NULL DEFAULT '["mcp:read","eut:read"]',
        created_at    INTEGER NOT NULL,
        created_by    TEXT,
        last_used_at  INTEGER,
        revoked_at    INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_end_user_tokens_prefix ON end_user_tokens (prefix);
      CREATE INDEX IF NOT EXISTS idx_end_user_tokens_end_user ON end_user_tokens (end_user_id);
      CREATE INDEX IF NOT EXISTS idx_end_user_tokens_tenant ON end_user_tokens (tenant_id);
    `,
    postgres: `
      CREATE TABLE IF NOT EXISTS end_user_tokens (
        id            TEXT PRIMARY KEY,
        end_user_id   TEXT NOT NULL,
        tenant_id     TEXT NOT NULL,
        prefix        TEXT NOT NULL,
        hash          TEXT NOT NULL,
        label         TEXT,
        scopes        TEXT NOT NULL DEFAULT '["mcp:read","eut:read"]',
        created_at    BIGINT NOT NULL,
        created_by    TEXT,
        last_used_at  BIGINT,
        revoked_at    BIGINT
      );
      CREATE INDEX IF NOT EXISTS idx_end_user_tokens_prefix ON end_user_tokens (prefix);
      CREATE INDEX IF NOT EXISTS idx_end_user_tokens_end_user ON end_user_tokens (end_user_id);
      CREATE INDEX IF NOT EXISTS idx_end_user_tokens_tenant ON end_user_tokens (tenant_id);
    `,
  },
]

export class EndUserTokenStore {
  private constructor(
    private readonly handle: DbHandle,
    private readonly secret: string,
    private readonly salt: string,
    private readonly table: string,
  ) {}

  /**
   * Open the store against the shared handle, applying (any pending)
   * migrations for the `end_user_tokens` namespace. The handle is owned by the
   * boot layer and SHARED with sibling stores — this store never closes it.
   */
  static async create(
    handle: DbHandle,
    secret: string,
    options?: EndUserTokenStoreOptions,
  ): Promise<EndUserTokenStore> {
    await handle.migrate('end_user_tokens', MIGRATIONS)
    return new EndUserTokenStore(
      handle,
      secret,
      options?.salt ?? DEFAULT_SALT,
      options?.tableName ?? DEFAULT_TABLE,
    )
  }

  private parseScopes(raw: string | null): string[] {
    if (!raw) return [...DEFAULT_END_USER_SCOPES]
    try {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed) && parsed.every((s) => typeof s === 'string')) return parsed
    } catch {
      // fall through
    }
    return [...DEFAULT_END_USER_SCOPES]
  }

  private mapRow(row: {
    id: string
    end_user_id: string
    tenant_id: string
    prefix: string
    label: string | null
    scopes: string | null
    created_at: number
    created_by: string | null
    last_used_at: number | null
    revoked_at: number | null
  }): EndUserTokenRow {
    return {
      id: row.id,
      endUserId: row.end_user_id,
      tenantId: row.tenant_id,
      prefix: row.prefix,
      label: row.label,
      scopes: this.parseScopes(row.scopes),
      createdAt: row.created_at,
      createdBy: row.created_by,
      lastUsedAt: row.last_used_at,
      revokedAt: row.revoked_at,
    }
  }

  /**
   * Mint a new end-user token. Returns the plaintext exactly once.
   * Refuses any scope set that combines `mcp:read` with a write-
   * granting scope (same rule as ApiKeyStore.mint).
   */
  async mint(input: {
    endUserId: string
    tenantId: string
    label?: string | null
    scopes?: string[]
    createdBy?: string | null
  }): Promise<EndUserMintResult> {
    const id = randomUUID()
    const random = randomBytes(RANDOM_LEN).toString('hex')
    const plaintext = `${KEY_PREFIX}${endUserSuffix(input.endUserId)}_${random}`
    const prefix = plaintext.slice(0, KEY_PREFIX.length + 8) // eut_ + 8 chars
    const hashBuf = hash(plaintext, this.secret, this.salt).toString('base64')
    const scopes =
      input.scopes && input.scopes.length > 0 ? input.scopes : [...DEFAULT_END_USER_SCOPES]
    assertMcpScopesCompatible(scopes)
    const now = Date.now()
    await this.handle.kysely
      .insertInto(this.table)
      .values({
        id,
        end_user_id: input.endUserId,
        tenant_id: input.tenantId,
        prefix,
        hash: hashBuf,
        label: input.label ?? null,
        scopes: JSON.stringify(scopes),
        created_at: now,
        created_by: input.createdBy ?? null,
        last_used_at: null,
        revoked_at: null,
      })
      .execute()
    return {
      id,
      endUserId: input.endUserId,
      tenantId: input.tenantId,
      prefix,
      label: input.label ?? null,
      scopes,
      plaintext,
      createdAt: now,
      createdBy: input.createdBy ?? null,
      lastUsedAt: null,
      revokedAt: null,
    }
  }

  async verify(plaintext: string): Promise<EndUserTokenRow | null> {
    if (!plaintext.startsWith(KEY_PREFIX)) return null
    const prefix = plaintext.slice(0, KEY_PREFIX.length + 8)
    const candidates = (await this.handle.kysely
      .selectFrom(this.table)
      .select([
        'id',
        'end_user_id',
        'tenant_id',
        'prefix',
        'hash',
        'label',
        'scopes',
        'created_at',
        'created_by',
        'last_used_at',
        'revoked_at',
      ])
      .where('prefix', '=', prefix)
      .where('revoked_at', 'is', null)
      .execute()) as Array<{
      id: string
      end_user_id: string
      tenant_id: string
      prefix: string
      hash: string
      label: string | null
      scopes: string | null
      created_at: number
      created_by: string | null
      last_used_at: number | null
      revoked_at: number | null
    }>
    const expected = hash(plaintext, this.secret, this.salt).toString('base64')
    for (const row of candidates) {
      if (row.hash === expected) {
        await this.markUsed(row.id)
        return this.mapRow({ ...row, last_used_at: Date.now() })
      }
    }
    return null
  }

  async list(opts: { endUserId?: string; tenantId?: string } = {}): Promise<EndUserTokenRow[]> {
    let q = this.handle.kysely
      .selectFrom(this.table)
      .select([
        'id',
        'end_user_id',
        'tenant_id',
        'prefix',
        'label',
        'scopes',
        'created_at',
        'created_by',
        'last_used_at',
        'revoked_at',
      ])
    if (opts.endUserId) q = q.where('end_user_id', '=', opts.endUserId)
    if (opts.tenantId) q = q.where('tenant_id', '=', opts.tenantId)
    const rows = (await q.orderBy('created_at', 'desc').execute()) as Array<{
      id: string
      end_user_id: string
      tenant_id: string
      prefix: string
      label: string | null
      scopes: string | null
      created_at: number
      created_by: string | null
      last_used_at: number | null
      revoked_at: number | null
    }>
    return rows.map((r) => this.mapRow(r))
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

  private async markUsed(id: string): Promise<void> {
    await this.handle.kysely
      .updateTable(this.table)
      .set({ last_used_at: Date.now() })
      .where('id', '=', id)
      .execute()
  }
}
