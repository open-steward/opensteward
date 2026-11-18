/**
 * Metadata for SQL principals — who has a database login, for what scope.
 *
 * The login itself is a Postgres role; this table is the record the admin UI
 * lists and audits. It never holds a password or a verifier: a password is
 * returned once when minted or rotated, and only Postgres keeps its SCRAM
 * verifier. A revoked principal keeps its row, with `revoked_at` set.
 *
 * Postgres only — SQL access does not exist on SQLite — but the migration is
 * written for both dialects like every other, under its own `analytics`
 * namespace, on the credential-family handle (the same database as the store
 * tables when DATABASE_URL is set).
 */
import { randomUUID } from 'node:crypto'
import type { DbHandle, DualMigration } from '@opensteward/shared'
import type { PrincipalScope } from './sql-generator'

export const PRINCIPALS_TABLE = 'analytics_principals'

export const PRINCIPAL_MIGRATIONS: ReadonlyArray<DualMigration> = [
  {
    version: 1,
    sqlite: `
      CREATE TABLE IF NOT EXISTS analytics_principals (
        id               TEXT PRIMARY KEY,
        role_name        TEXT NOT NULL UNIQUE,
        label            TEXT NOT NULL,
        pii              INTEGER NOT NULL DEFAULT 0,
        scope_json       TEXT NOT NULL,
        connection_limit INTEGER NOT NULL,
        created_by       TEXT,
        created_at       INTEGER NOT NULL,
        expires_at       INTEGER,
        revoked_at       INTEGER,
        last_rotated_at  INTEGER
      );
    `,
    postgres: `
      CREATE TABLE IF NOT EXISTS analytics_principals (
        id               TEXT PRIMARY KEY,
        role_name        TEXT NOT NULL UNIQUE,
        label            TEXT NOT NULL,
        pii              BOOLEAN NOT NULL DEFAULT false,
        scope_json       TEXT NOT NULL,
        connection_limit INTEGER NOT NULL,
        created_by       TEXT,
        created_at       BIGINT NOT NULL,
        expires_at       BIGINT,
        revoked_at       BIGINT,
        last_rotated_at  BIGINT
      );
    `,
  },
]

export interface PrincipalRecord {
  id: string
  roleName: string
  label: string
  pii: boolean
  scope: PrincipalScope
  connectionLimit: number
  createdBy: string | null
  createdAt: number
  expiresAt: number | null
  revokedAt: number | null
  lastRotatedAt: number | null
}

interface Row {
  id: string
  role_name: string
  label: string
  pii: boolean | number
  scope_json: string
  connection_limit: number
  created_by: string | null
  created_at: number | string
  expires_at: number | string | null
  revoked_at: number | string | null
  last_rotated_at: number | string | null
}

const num = (v: number | string | null): number | null => (v === null ? null : Number(v))

function fromRow(r: Row): PrincipalRecord {
  return {
    id: r.id,
    roleName: r.role_name,
    label: r.label,
    pii: r.pii === true || r.pii === 1,
    scope: JSON.parse(r.scope_json) as PrincipalScope,
    connectionLimit: Number(r.connection_limit),
    createdBy: r.created_by,
    createdAt: Number(r.created_at),
    expiresAt: num(r.expires_at),
    revokedAt: num(r.revoked_at),
    lastRotatedAt: num(r.last_rotated_at),
  }
}

export class PrincipalsStore {
  private constructor(private readonly db: DbHandle['kysely']) {}

  static async create(handle: DbHandle): Promise<PrincipalsStore> {
    await handle.migrate('analytics', PRINCIPAL_MIGRATIONS)
    return new PrincipalsStore(handle.kysely)
  }

  async insert(p: Omit<PrincipalRecord, 'id'> & { id?: string }): Promise<PrincipalRecord> {
    const rec: PrincipalRecord = { ...p, id: p.id ?? randomUUID() }
    await this.db
      .insertInto(PRINCIPALS_TABLE)
      .values({
        id: rec.id,
        role_name: rec.roleName,
        label: rec.label,
        pii: rec.pii,
        scope_json: JSON.stringify(rec.scope),
        connection_limit: rec.connectionLimit,
        created_by: rec.createdBy,
        created_at: rec.createdAt,
        expires_at: rec.expiresAt,
        revoked_at: rec.revokedAt,
        last_rotated_at: rec.lastRotatedAt,
      })
      .execute()
    return rec
  }

  async list(): Promise<PrincipalRecord[]> {
    const rows = (await this.db
      .selectFrom(PRINCIPALS_TABLE)
      .selectAll()
      .orderBy('created_at', 'desc')
      .orderBy('id')
      .execute()) as Row[]
    return rows.map(fromRow)
  }

  async get(id: string): Promise<PrincipalRecord | null> {
    const row = (await this.db
      .selectFrom(PRINCIPALS_TABLE)
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst()) as Row | undefined
    return row ? fromRow(row) : null
  }

  async markRotated(id: string, at: number): Promise<void> {
    await this.db
      .updateTable(PRINCIPALS_TABLE)
      .set({ last_rotated_at: at })
      .where('id', '=', id)
      .execute()
  }

  async markRevoked(id: string, at: number): Promise<void> {
    await this.db
      .updateTable(PRINCIPALS_TABLE)
      .set({ revoked_at: at })
      .where('id', '=', id)
      .where('revoked_at', 'is', null)
      .execute()
  }

  async delete(id: string): Promise<void> {
    await this.db.deleteFrom(PRINCIPALS_TABLE).where('id', '=', id).execute()
  }
}
