/**
 * AdapterSettingsStore — persistent runtime configuration for adapters.
 *
 * Each row records whether an adapter is enabled and stores its (encrypted)
 * provider config — client_id, client_secret, redirect_uri, scopes, etc.
 *
 * The primary key is `(vertical, slug)`: adapter slugs collide across
 * verticals (`bexio` exists in both accounting and crm), and each vertical
 * needs its own enabled-state and config row.
 *
 * This is intentionally separate from CredentialStore (which holds OAuth
 * access/refresh tokens per tenant connection). Adapter settings are
 * vertical-wide; they tell the registry how to instantiate the adapter at all.
 *
 * Encryption uses the same scrypt+AES-256-GCM scheme as CredentialStore,
 * with a distinct salt so the two stores never share keys. Encryption stays
 * OUTSIDE the query seam: `encrypted_config` is a base64 TEXT column on both
 * dialects, so ciphertext is byte-identical across backends.
 */
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto'
import type { DbHandle, DualMigration } from '../db/types'

const ALGORITHM = 'aes-256-gcm'
const KEY_LEN = 32
const IV_LEN = 12
const TAG_LEN = 16
const DEFAULT_SALT = 'opensteward-adapter-settings-v1'

export interface AdapterSettings {
  /** Vertical that owns this adapter (e.g. "accounting", "crm"). */
  vertical: string
  /** Adapter slug (e.g. "fortnox", "fedex"). Unique within `vertical`. */
  slug: string
  /** Whether the adapter is currently registered with the registry. */
  enabled: boolean
  /** Provider config — credentials, redirect URI, scopes, etc. */
  config: Record<string, unknown>
  createdAt: Date
  updatedAt: Date
}

export interface AdapterSettingsStoreOptions {
  /** Salt for scrypt key derivation. Defaults to a stable adapter-settings salt. */
  salt?: string
}

interface RawRow {
  vertical: string
  slug: string
  enabled: number
  encrypted_config: string
  created_at: number
  updated_at: number
}

function deriveKey(secret: string, salt: string): Buffer {
  return scryptSync(secret, salt, KEY_LEN, { N: 16384, r: 8, p: 1 })
}

function encrypt(plaintext: string, secret: string, salt: string): string {
  const key = deriveKey(secret, salt)
  const iv = randomBytes(IV_LEN)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, enc]).toString('base64')
}

function decrypt(ciphertext: string, secret: string, salt: string): string {
  const key = deriveKey(secret, salt)
  const buf = Buffer.from(ciphertext, 'base64')
  const iv = buf.subarray(0, IV_LEN)
  const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN)
  const enc = buf.subarray(IV_LEN + TAG_LEN)
  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(tag)
  return decipher.update(enc).toString('utf8') + decipher.final('utf8')
}

// Epoch-millisecond columns (created_at, updated_at) are INTEGER on SQLite and
// BIGINT on Postgres (the PostgresDbHandle parses int8 back to a JS number).
// `enabled` is a 0/1 boolean-as-INTEGER on both dialects (the store still maps
// to/from a JS boolean). `encrypted_config` is base64 ciphertext stored as TEXT
// on both backends. The composite `PRIMARY KEY (vertical, slug)` is valid
// verbatim on both — the upsert targets it via ON CONFLICT.
const MIGRATIONS: DualMigration[] = [
  {
    version: 1,
    sqlite: `
      CREATE TABLE IF NOT EXISTS adapter_settings (
        vertical TEXT NOT NULL,
        slug TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 0,
        encrypted_config TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (vertical, slug)
      );
    `,
    postgres: `
      CREATE TABLE IF NOT EXISTS adapter_settings (
        vertical TEXT NOT NULL,
        slug TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 0,
        encrypted_config TEXT NOT NULL,
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL,
        PRIMARY KEY (vertical, slug)
      );
    `,
  },
]

export class AdapterSettingsStore {
  private constructor(
    private readonly handle: DbHandle,
    private readonly secret: string,
    private readonly salt: string,
  ) {}

  /**
   * Open the store: apply migrations against the shared handle, then return the
   * instance. BORROWER — the handle is owned by the boot layer and MUST NOT be
   * closed here.
   */
  static async create(
    handle: DbHandle,
    secret: string,
    opts: AdapterSettingsStoreOptions = {},
  ): Promise<AdapterSettingsStore> {
    await handle.migrate('adapter_settings', MIGRATIONS)
    return new AdapterSettingsStore(handle, secret, opts.salt ?? DEFAULT_SALT)
  }

  private rowToSettings(row: RawRow): AdapterSettings {
    const config = row.encrypted_config
      ? (JSON.parse(decrypt(row.encrypted_config, this.secret, this.salt)) as Record<
          string,
          unknown
        >)
      : {}
    return {
      vertical: row.vertical,
      slug: row.slug,
      enabled: row.enabled === 1,
      config,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    }
  }

  /** Upsert settings (enabled flag and/or config) for a (vertical, slug) pair. */
  async upsert(
    vertical: string,
    slug: string,
    patch: { enabled?: boolean; config?: Record<string, unknown> },
  ): Promise<AdapterSettings> {
    const existing = await this.get(vertical, slug)
    const enabled = patch.enabled ?? existing?.enabled ?? false
    const config = patch.config ?? existing?.config ?? {}
    const encrypted = encrypt(JSON.stringify(config), this.secret, this.salt)
    const now = Date.now()
    const created = existing ? new Date(existing.createdAt).getTime() : now

    await this.handle.kysely
      .insertInto('adapter_settings')
      .values({
        vertical,
        slug,
        enabled: enabled ? 1 : 0,
        encrypted_config: encrypted,
        created_at: created,
        updated_at: now,
      })
      .onConflict((oc) =>
        oc.columns(['vertical', 'slug']).doUpdateSet({
          enabled: enabled ? 1 : 0,
          encrypted_config: encrypted,
          updated_at: now,
        }),
      )
      .execute()

    return (await this.get(vertical, slug))!
  }

  async get(vertical: string, slug: string): Promise<AdapterSettings | undefined> {
    const row = (await this.handle.kysely
      .selectFrom('adapter_settings')
      .selectAll()
      .where('vertical', '=', vertical)
      .where('slug', '=', slug)
      .executeTakeFirst()) as RawRow | undefined
    return row ? this.rowToSettings(row) : undefined
  }

  /** All rows, optionally filtered to a single vertical. */
  async list(vertical?: string): Promise<AdapterSettings[]> {
    let q = this.handle.kysely.selectFrom('adapter_settings').selectAll()
    if (vertical) q = q.where('vertical', '=', vertical)
    const rows = (await (
      vertical ? q.orderBy('slug', 'asc') : q.orderBy('vertical', 'asc').orderBy('slug', 'asc')
    ).execute()) as RawRow[]
    return rows.map((r) => this.rowToSettings(r))
  }

  async listEnabled(vertical?: string): Promise<AdapterSettings[]> {
    return (await this.list(vertical)).filter((s) => s.enabled)
  }

  async delete(vertical: string, slug: string): Promise<boolean> {
    const res = await this.handle.kysely
      .deleteFrom('adapter_settings')
      .where('vertical', '=', vertical)
      .where('slug', '=', slug)
      .executeTakeFirst()
    return Number(res.numDeletedRows) > 0
  }
}
