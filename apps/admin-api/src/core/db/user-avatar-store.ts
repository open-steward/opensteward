/**
 * UserAvatarStore — console users' profile pictures (`user_avatars`,
 * admin_store v7).
 *
 * Borrows AdminStore's handle, like LogoStore: the table belongs to the
 * `admin_store` migration namespace, so there is nothing to migrate here and
 * constructing one is free. Route files build one from
 * `adminStore.getHandle()` rather than having it threaded through every
 * factory signature.
 *
 * Validation (type by magic bytes, the size cap) happens before a write reaches
 * this class — see `core/users/avatar-image.ts`. This class stores what it is
 * given verbatim.
 */
import { createHash } from 'node:crypto'
import type { DbHandle } from '@opensteward/shared'
import type { AdminStore } from './admin-store'
import type { AvatarMime } from '../users/avatar-image'

export type AvatarSource = 'upload' | 'idp'

/** Everything but the bytes — what list views, ETags and 304s need. */
export interface AvatarHead {
  userId: string
  contentType: AvatarMime
  byteSize: number
  /** sha256 hex of the bytes: the ETag and the cache-busting version. */
  sha256: string
  source: AvatarSource
  /** sha256 hex of the IdP picture URL the bytes came from; null for uploads. */
  sourceUrlHash: string | null
  updatedAt: number
  updatedBy: string | null
}

export interface AvatarRow extends AvatarHead {
  bytes: Buffer
}

/** Characters of the sha256 used as the `?v=` cache-buster. */
const VERSION_LENGTH = 16

/** The short, URL-safe version string derived from an avatar's sha256. */
export function avatarVersion(sha256: string): string {
  return sha256.slice(0, VERSION_LENGTH)
}

/** Where admin-api serves a user's avatar, versioned so a change busts caches. */
export function avatarApiUrl(userId: string, sha256: string): string {
  return `/api/users/${encodeURIComponent(userId)}/avatar?v=${avatarVersion(sha256)}`
}

/** sha256 hex of an IdP picture URL, stored instead of the URL itself. */
export function hashAvatarSourceUrl(url: string): string {
  return createHash('sha256').update(url).digest('hex')
}

/** better-sqlite3 returns a Buffer for BLOB, node-postgres a Buffer for BYTEA;
 *  a future driver might return a Uint8Array. */
function toBuffer(value: unknown): Buffer {
  if (Buffer.isBuffer(value)) return value
  if (value instanceof Uint8Array) return Buffer.from(value)
  throw new Error(`user_avatars.bytes: unexpected driver type ${typeof value}`)
}

const HEAD_COLUMNS = [
  'user_id',
  'content_type',
  'byte_size',
  'sha256',
  'source',
  'source_url_hash',
  'updated_at',
  'updated_by',
] as const

function rowToHead(row: Record<string, unknown>): AvatarHead {
  return {
    userId: row.user_id as string,
    contentType: row.content_type as AvatarMime,
    byteSize: Number(row.byte_size),
    sha256: row.sha256 as string,
    source: row.source === 'idp' ? 'idp' : 'upload',
    sourceUrlHash: (row.source_url_hash as string | null) ?? null,
    updatedAt: Number(row.updated_at),
    updatedBy: (row.updated_by as string | null) ?? null,
  }
}

export class UserAvatarStore {
  constructor(private readonly handle: DbHandle) {}

  static for(adminStore: AdminStore): UserAvatarStore {
    return new UserAvatarStore(adminStore.getHandle())
  }

  /** Insert or replace a user's avatar. Returns the stored metadata. */
  async put(input: {
    userId: string
    contentType: AvatarMime
    bytes: Buffer
    source: AvatarSource
    sourceUrlHash?: string | null
    updatedBy: string | null
  }): Promise<AvatarHead> {
    const values = {
      user_id: input.userId,
      content_type: input.contentType,
      bytes: input.bytes,
      byte_size: input.bytes.length,
      sha256: createHash('sha256').update(input.bytes).digest('hex'),
      source: input.source,
      source_url_hash: input.source === 'idp' ? (input.sourceUrlHash ?? null) : null,
      updated_at: Date.now(),
      updated_by: input.updatedBy,
    }
    await this.handle.kysely
      .insertInto('user_avatars')
      .values(values)
      .onConflict((oc) =>
        oc.column('user_id').doUpdateSet({
          content_type: values.content_type,
          bytes: values.bytes,
          byte_size: values.byte_size,
          sha256: values.sha256,
          source: values.source,
          source_url_hash: values.source_url_hash,
          updated_at: values.updated_at,
          updated_by: values.updated_by,
        }),
      )
      .execute()
    return rowToHead(values)
  }

  /**
   * Store a picture fetched from the identity provider — unless the user has
   * an uploaded one. The check and the write are one statement (an upsert
   * whose update only fires on an `idp` row), so an upload that lands while a
   * fetch is in flight is never overwritten. Returns false when an upload won.
   */
  async putFromIdp(input: {
    userId: string
    contentType: AvatarMime
    bytes: Buffer
    sourceUrlHash: string
  }): Promise<boolean> {
    const values = {
      user_id: input.userId,
      content_type: input.contentType,
      bytes: input.bytes,
      byte_size: input.bytes.length,
      sha256: createHash('sha256').update(input.bytes).digest('hex'),
      source: 'idp' as const,
      source_url_hash: input.sourceUrlHash,
      updated_at: Date.now(),
      updated_by: null,
    }
    const res = await this.handle.kysely
      .insertInto('user_avatars')
      .values(values)
      .onConflict((oc) =>
        oc
          .column('user_id')
          .doUpdateSet({
            content_type: values.content_type,
            bytes: values.bytes,
            byte_size: values.byte_size,
            sha256: values.sha256,
            source: values.source,
            source_url_hash: values.source_url_hash,
            updated_at: values.updated_at,
            updated_by: values.updated_by,
          })
          .where('user_avatars.source', '=', 'idp'),
      )
      .executeTakeFirst()
    if (Number(res.numInsertedOrUpdatedRows ?? 0) === 0) return false
    // The user may have been deleted while the picture was being fetched.
    // `deleteUser` removes the avatar row in its own transaction, so a row
    // written before that commits is gone with the user; this re-check covers
    // a delete that committed before our write — no orphan row either way.
    const user = await this.handle.kysely
      .selectFrom('users')
      .select('id')
      .where('id', '=', input.userId)
      .executeTakeFirst()
    if (!user) {
      await this.delete(input.userId)
      return false
    }
    return true
  }

  /** Metadata only — never selects `bytes`, so a 304 costs no blob read. */
  async head(userId: string): Promise<AvatarHead | null> {
    const row = (await this.handle.kysely
      .selectFrom('user_avatars')
      .select([...HEAD_COLUMNS])
      .where('user_id', '=', userId)
      .executeTakeFirst()) as Record<string, unknown> | undefined
    return row ? rowToHead(row) : null
  }

  async get(userId: string): Promise<AvatarRow | null> {
    const row = (await this.handle.kysely
      .selectFrom('user_avatars')
      .select([...HEAD_COLUMNS, 'bytes'])
      .where('user_id', '=', userId)
      .executeTakeFirst()) as Record<string, unknown> | undefined
    return row ? { ...rowToHead(row), bytes: toBuffer(row.bytes) } : null
  }

  /**
   * sha256 per user, for list views that need a cache-busting version for
   * every row without reading any blob. Every avatar when `userIds` is
   * omitted — the users table is small (console operators, not end users).
   */
  async versions(userIds?: readonly string[]): Promise<Map<string, string>> {
    if (userIds && userIds.length === 0) return new Map()
    let q = this.handle.kysely.selectFrom('user_avatars').select(['user_id', 'sha256'])
    if (userIds) q = q.where('user_id', 'in', [...new Set(userIds)])
    const rows = (await q.execute()) as Array<{ user_id: string; sha256: string }>
    return new Map(rows.map((r) => [r.user_id, r.sha256]))
  }

  /** Remove a user's avatar. `onlySource` limits it to one source, so an IdP
   *  sync can drop its own picture without touching an upload. */
  async delete(userId: string, opts: { onlySource?: AvatarSource } = {}): Promise<boolean> {
    let q = this.handle.kysely.deleteFrom('user_avatars').where('user_id', '=', userId)
    if (opts.onlySource) q = q.where('source', '=', opts.onlySource)
    const res = await q.executeTakeFirst()
    return Number(res.numDeletedRows) > 0
  }
}
