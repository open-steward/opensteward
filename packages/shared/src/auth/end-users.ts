/**
 * EndUserStore — dual-backend store for external customer records.
 *
 * Two surfaces:
 *   - Plaintext columns for fields used by search / display:
 *     `email`, `display_name`, `external_reference`.
 *   - Encrypted blob `pii_data` (AES-256-GCM) for everything else
 *     (first/last name, phone, address, personal-ID number).
 *
 * The store reads PII only when explicitly asked (`includePii: true`).
 * List/search paths never decrypt — they return only the plaintext
 * subset. The personal-ID number is the most sensitive field; the
 * admin UI masks it by default and audits any reveal.
 *
 * Salts are deliberately distinct from `CredentialStore` so the same
 * `STORE_SECRET` produces different key material for the two stores.
 *
 * Sits on the shared `DbHandle` (SQLite by default, Postgres when
 * `DATABASE_URL` is set) so a single backend connection owns every
 * deployment-side store. Encryption stays OUTSIDE the query seam:
 * `pii_data` is a base64 TEXT column on both dialects, byte-identical
 * across backends. Case-folding of `email` happens in JS (the column is
 * always stored lowercased), so the `(tenant_id, lower(email))` unique
 * index is satisfied on both backends without an `INSERT ... lower(?)`
 * SQL call.
 */
import { randomUUID } from 'crypto'
import { encrypt, decrypt } from './crypto'
import type { DbHandle, DualMigration } from '../db/types'
import { isUniqueViolation } from '../db/sql-errors'
import type { EndUserPii } from '../schemas/end-user'

const DEFAULT_SALT = 'opensteward-end-users-v1'

export interface EndUserRow {
  id: string
  tenantId: string
  email: string
  displayName: string | null
  externalReference: string | null
  /** Decrypted PII, only populated when the caller asked for it. */
  pii: EndUserPii | null
  createdAt: number
  updatedAt: number
}

export interface EndUserSummaryRow {
  id: string
  tenantId: string
  email: string
  displayName: string | null
  externalReference: string | null
  createdAt: number
  updatedAt: number
}

export interface EndUserStoreOptions {
  salt?: string
}

export class DuplicateEmailError extends Error {
  constructor(tenantId: string, email: string) {
    super(`End-user already exists for tenant '${tenantId}' with email '${email}'`)
    this.name = 'DuplicateEmailError'
  }
}

interface EndUserSummaryDbRow {
  id: string
  tenant_id: string
  email: string
  display_name: string | null
  external_reference: string | null
  created_at: number
  updated_at: number
}

interface EndUserFullDbRow extends EndUserSummaryDbRow {
  pii_data: string | null
}

/**
 * Filter clauses shared by `list()` and `countEndUsers()` — see
 * `EndUserStore.endUserWhere` for why the two must share one implementation.
 *
 * Six of the eight `end_users` columns are SQL-addressable and appear here
 * (directly or via `q`): `id` is matched by callers via `getById`, not listed
 * here, and `created_at`/`updated_at` are sort-only (see `END_USER_SORT_COLUMNS` below) —
 * a one-control-per-column filter row can't express a date range, the same
 * reasoning `/audit`'s `from`/`to` controls staying above its table rests on.
 * The other two columns, everything in `pii_data` (firstName, lastName,
 * phone, address, personalIdNumber), are AES-256-GCM with a per-ciphertext
 * random IV (`crypto.ts`) and cannot be ordered or matched in SQL at all —
 * they have no place in this type.
 */
export interface EndUserFilter {
  tenantId?: string
  /**
   * Matches email, display name OR external reference at once — the
   * combined free-text search `GET /v1/customers?q=` and the admin list's
   * old search box both use. NOT a substitute for the per-column filters
   * below: an operator filtering the Email column specifically must not
   * also match a row whose external reference happens to contain the same
   * text, so `q` stays a separate clause rather than an alias for `email`.
   */
  q?: string
  email?: string
  displayName?: string
  externalReference?: string
}

/**
 * UI-key → physical column, for `list()`'s optional `sort`. A caller-supplied
 * key is looked up ONLY via `END_USER_SORT_KEYS.has(...)` (a `Set` of this
 * object's own keys), never `key in END_USER_SORT_COLUMNS` — `in` also matches
 * `Object.prototype` (`constructor`, `valueOf`, `hasOwnProperty`, …), so
 * `?sort=constructor` would resolve to the `Object` constructor rather than
 * a column name and throw when used as one. Same guard, same reasoning, as
 * `CONNECTION_SORT_KEYS` in admin-api's `routes/connections.ts`.
 *
 * `tenantId` sorts on the raw tenant id, not a resolved name — this store
 * never sees the tenant NAME the admin UI's Tenant cell renders (that is an
 * admin-api-side join against its own tenant list) — same caveat connections'
 * `tenant` sort documents.
 */
export const END_USER_SORT_COLUMNS = {
  email: 'email',
  displayName: 'display_name',
  externalReference: 'external_reference',
  tenantId: 'tenant_id',
  created: 'created_at',
} as const
const END_USER_SORT_KEYS = new Set(Object.keys(END_USER_SORT_COLUMNS))
type SortableKey = keyof typeof END_USER_SORT_COLUMNS

// Epoch-millisecond columns (created_at, updated_at) are INTEGER on SQLite and
// BIGINT on Postgres (the PostgresDbHandle parses int8 back to a JS number).
// The encrypted `pii_data` column stays TEXT on both dialects — the store
// serialises/encrypts in JS and a base64 string crosses the query seam. The
// expression-based unique index `(tenant_id, lower(email))` and the
// `(tenant_id, external_reference)` lookup index are valid verbatim on both
// backends; `email` is always written lowercased so `lower(email) == email`.
const MIGRATIONS: DualMigration[] = [
  {
    version: 1,
    sqlite: `
      CREATE TABLE IF NOT EXISTS end_users (
        id                 TEXT PRIMARY KEY,
        tenant_id          TEXT NOT NULL,
        email              TEXT NOT NULL,
        display_name       TEXT,
        external_reference TEXT,
        pii_data           TEXT,
        created_at         INTEGER NOT NULL,
        updated_at         INTEGER NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS uq_end_users_tenant_email
        ON end_users (tenant_id, lower(email));
      CREATE INDEX IF NOT EXISTS idx_end_users_tenant_external
        ON end_users (tenant_id, external_reference);
    `,
    postgres: `
      CREATE TABLE IF NOT EXISTS end_users (
        id                 TEXT PRIMARY KEY,
        tenant_id          TEXT NOT NULL,
        email              TEXT NOT NULL,
        display_name       TEXT,
        external_reference TEXT,
        pii_data           TEXT,
        created_at         BIGINT NOT NULL,
        updated_at         BIGINT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS uq_end_users_tenant_email
        ON end_users (tenant_id, lower(email));
      CREATE INDEX IF NOT EXISTS idx_end_users_tenant_external
        ON end_users (tenant_id, external_reference);
    `,
  },
]

export class EndUserStore {
  private constructor(
    private readonly handle: DbHandle,
    private readonly secret: string,
    private readonly salt: string,
  ) {}

  /**
   * Open the store against the shared handle, applying (any pending)
   * migrations for the `end_users` namespace. The handle is owned by the boot
   * layer and SHARED with sibling stores — this store never closes it.
   */
  static async create(
    handle: DbHandle,
    secret: string,
    options?: EndUserStoreOptions,
  ): Promise<EndUserStore> {
    await handle.migrate('end_users', MIGRATIONS)
    return new EndUserStore(handle, secret, options?.salt ?? DEFAULT_SALT)
  }

  // ── Internal helpers ──────────────────────────────────────────────────────

  private encryptPii(pii: EndUserPii | null | undefined): string | null {
    if (!pii) return null
    // Drop the entry entirely if every field is empty so we don't store an
    // encrypted-empty-blob.
    if (Object.values(pii).every((v) => v === undefined || v === null || v === '')) return null
    return encrypt(JSON.stringify(pii), this.secret, this.salt)
  }

  private decryptPii(blob: string | null): EndUserPii | null {
    if (!blob) return null
    return JSON.parse(decrypt(blob, this.secret, this.salt)) as EndUserPii
  }

  private hydrateSummary(row: EndUserSummaryDbRow): EndUserSummaryRow {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      email: row.email,
      displayName: row.display_name,
      externalReference: row.external_reference,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  }

  /**
   * Apply the shared `list()`/`countEndUsers()` filter clauses to a Kysely
   * query. All clauses combine with AND. Factored out of `list()` (which used
   * to build the `tenantId`/`q` clauses inline) so a future filter can't be
   * added to one without the other — `countEndUsers()` computes the
   * `/customers` page's `meta.total`, and if it ever drifted from what
   * `list()` actually matched, the pagination control would claim a total
   * that disagreed with the rows on screen.
   *
   * Generic over `QB` (mirrors `AdminStore.auditWhere`) because `list()` and
   * `countEndUsers()` select different output shapes from the same table —
   * `this.handle.kysely` is typed `Kysely<Record<string, any>>` (see
   * `db/types.ts`), so the exact select-shape generic is not needed for
   * `where` to type-check, only the ability to chain `.where(...)`.
   *
   * Every field here matches a PLAINTEXT column. Nothing in `pii_data` can
   * appear: it is AES-256-GCM with a per-ciphertext random IV (`crypto.ts`),
   * so there is no SQL operator that can order or match it — that is why
   * `EndUserFilter` has no `firstName`/`phone`/etc.
   */
  /* eslint-disable @typescript-eslint/no-explicit-any --
     `QB`'s bound (`{ where: (...args: any[]) => QB }`) erases the concrete
     Kysely expression-builder type from every `eb` below, and re-typing it
     accurately here would mean importing Kysely's internal builder generics
     just to describe a parameter this method never inspects — the callback
     is only ever handed to `.where(...)`, never returned or read back. */
  private endUserWhere<QB extends { where: (...args: any[]) => QB }>(
    qb: QB,
    filter?: EndUserFilter,
  ): QB {
    let q = qb
    if (filter?.tenantId) q = q.where('tenant_id', '=', filter.tenantId)
    // Per-column filters. Case-insensitive substring, same semantics as `q`
    // below and as the admin app's other text filter boxes (table-controls.ts).
    // `eb.fn(...)` carries no explicit `<string>` type argument: a type
    // argument on a call through an `any`-typed callee is a compile error
    // (`TS2347`), whereas the plain call already returns `any` here regardless.
    if (filter?.email) {
      const needle = `%${filter.email.toLowerCase()}%`
      q = q.where((eb: any) => eb(eb.fn('lower', ['email']), 'like', needle))
    }
    if (filter?.displayName) {
      const needle = `%${filter.displayName.toLowerCase()}%`
      q = q.where((eb: any) =>
        eb(eb.fn('lower', [eb.fn.coalesce('display_name', eb.val(''))]), 'like', needle),
      )
    }
    if (filter?.externalReference) {
      const needle = `%${filter.externalReference.toLowerCase()}%`
      q = q.where((eb: any) =>
        eb(eb.fn('lower', [eb.fn.coalesce('external_reference', eb.val(''))]), 'like', needle),
      )
    }
    if (filter?.q) {
      const needle = `%${filter.q.toLowerCase()}%`
      // Preserve the original combined match over email, display name and
      // external reference: `lower(coalesce(col, '')) LIKE %q%`. `q` is NOT a
      // column filter — it is the hidden synthetic column the admin app's
      // customersTable() forwards as `legacy: 'q'` (same shape as
      // /connections' hidden `search` column), matching all three fields at
      // once. Folding it onto the Email column instead would silently narrow
      // a documented parameter (`GET /v1/customers?q=`) to one field.
      q = q.where((eb: any) =>
        eb.or([
          eb(eb.fn('lower', ['email']), 'like', needle),
          eb(eb.fn('lower', [eb.fn.coalesce('display_name', eb.val(''))]), 'like', needle),
          eb(eb.fn('lower', [eb.fn.coalesce('external_reference', eb.val(''))]), 'like', needle),
        ]),
      )
    }
    return q
  }
  /* eslint-enable @typescript-eslint/no-explicit-any */

  // ── Public API ────────────────────────────────────────────────────────────

  /**
   * Create a new end-user. Throws `DuplicateEmailError` if `(tenantId, email)`
   * already exists — callers wanting "resolve-or-create" should call
   * `findByEmail` first or use {@link upsertByEmail}.
   */
  async create(input: {
    tenantId: string
    email: string
    displayName?: string | null
    externalReference?: string | null
    pii?: EndUserPii | null
  }): Promise<EndUserSummaryRow> {
    const id = randomUUID()
    const now = Date.now()
    const piiBlob = this.encryptPii(input.pii)
    // Email is stored lowercased so the `(tenant_id, lower(email))` unique
    // index matches on both backends without a SQL `lower(?)` call.
    const email = input.email.toLowerCase()
    try {
      await this.handle.kysely
        .insertInto('end_users')
        .values({
          id,
          tenant_id: input.tenantId,
          email,
          display_name: input.displayName ?? null,
          external_reference: input.externalReference ?? null,
          pii_data: piiBlob,
          created_at: now,
          updated_at: now,
        })
        .execute()
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new DuplicateEmailError(input.tenantId, input.email)
      }
      throw err
    }
    return {
      id,
      tenantId: input.tenantId,
      email,
      displayName: input.displayName ?? null,
      externalReference: input.externalReference ?? null,
      createdAt: now,
      updatedAt: now,
    }
  }

  /**
   * Find or create — returns the existing row when `(tenantId, email)` is
   * already taken, otherwise inserts. Updates display name / external
   * reference / pii on a hit when those values are passed in. Used by the
   * "Create connect link" admin flow when the operator types a new
   * customer email inline.
   */
  async upsertByEmail(input: {
    tenantId: string
    email: string
    displayName?: string | null
    externalReference?: string | null
    pii?: EndUserPii | null
  }): Promise<EndUserSummaryRow> {
    const existing = await this.findByEmail(input.tenantId, input.email)
    if (existing) {
      const patch: Parameters<EndUserStore['update']>[1] = {}
      if (input.displayName !== undefined) patch.displayName = input.displayName
      if (input.externalReference !== undefined) patch.externalReference = input.externalReference
      if (input.pii !== undefined) patch.pii = input.pii
      if (Object.keys(patch).length === 0) return existing
      return (await this.update(existing.id, patch)) ?? existing
    }
    return this.create(input)
  }

  async findByEmail(tenantId: string, email: string): Promise<EndUserSummaryRow | null> {
    // The column is stored lowercased, so a JS-lowercased equality is exactly
    // equivalent to the original `lower(email) = lower(?)` and is portable.
    const row = (await this.handle.kysely
      .selectFrom('end_users')
      .select([
        'id',
        'tenant_id',
        'email',
        'display_name',
        'external_reference',
        'created_at',
        'updated_at',
      ])
      .where('tenant_id', '=', tenantId)
      .where('email', '=', email.toLowerCase())
      .limit(1)
      .executeTakeFirst()) as EndUserSummaryDbRow | undefined
    return row ? this.hydrateSummary(row) : null
  }

  async getById(id: string, opts?: { includePii?: boolean }): Promise<EndUserRow | null> {
    const row = (await this.handle.kysely
      .selectFrom('end_users')
      .select([
        'id',
        'tenant_id',
        'email',
        'display_name',
        'external_reference',
        'pii_data',
        'created_at',
        'updated_at',
      ])
      .where('id', '=', id)
      .executeTakeFirst()) as EndUserFullDbRow | undefined
    if (!row) return null
    return {
      id: row.id,
      tenantId: row.tenant_id,
      email: row.email,
      displayName: row.display_name,
      externalReference: row.external_reference,
      pii: opts?.includePii ? this.decryptPii(row.pii_data) : null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  }

  /**
   * Search end-users for the admin UI's autocomplete + customer list.
   * Returns the plaintext summary only — never decrypts PII. `q` matches
   * email, display name or external reference (LIKE %q%, case-insensitive);
   * see `EndUserFilter` for the rest of the per-column filters.
   */
  async list(
    opts?: EndUserFilter & {
      limit?: number
      offset?: number
      /**
       * UI column key to order by (see `END_USER_SORT_COLUMNS`). An unrecognised or
       * omitted value falls back to the default order below, rather than
       * rejecting the request — a stale bookmark or hand-edited URL must
       * degrade gracefully, not 500 (same contract as /connections' `sort`).
       */
      sort?: string
      dir?: 'asc' | 'desc'
    },
  ): Promise<EndUserSummaryRow[]> {
    let q = this.handle.kysely
      .selectFrom('end_users')
      .select([
        'id',
        'tenant_id',
        'email',
        'display_name',
        'external_reference',
        'created_at',
        'updated_at',
      ])
    q = this.endUserWhere(q, opts)
    // `?limit=abc` on the public `GET /v1/customers` route reaches here as
    // `Number('abc')` — i.e. `NaN`, which has no Zod querystring schema to
    // reject it. `Math.min(NaN, 200)` is itself `NaN`, and Kysely's
    // `.limit(NaN)` throws `SqliteError: datatype mismatch` (a 500 on a
    // public, scope-gated endpoint). The same route parses with `Number(...)`,
    // not `parseInt`, so `?limit=50.5` reaches here as the fraction `50.5`
    // rather than being truncated first — `Number.isFinite(50.5)` is `true`,
    // so a finite-only guard would let it through to `.limit(50.5)`, and
    // SQLite's `OP_MustBeInt` rejects a non-integral value with the identical
    // `SqliteError: datatype mismatch`. `Number.isInteger` closes both: `NaN`,
    // `0`, a negative number, and a fraction all collapse to the same default
    // a caller gets by omitting `limit` entirely, then the ceiling still
    // applies. (The namespaced `Number.isInteger` matters too — the bare
    // global `isFinite(null)` coerces its argument and is `true`.)
    const limit =
      Number.isInteger(opts?.limit) && opts!.limit! > 0 ? Math.min(opts!.limit!, 200) : 50
    // Same shape of bug on `?offset=abc` / `?offset=0.5`: `Math.max(NaN, 0)`
    // is `NaN`, and a fractional offset would reach `.offset()` un-truncated
    // for the identical crash. A non-integer, non-finite, or negative offset
    // can't move the window anywhere meaningful, so it collapses to 0 (page
    // one) instead.
    const offset = Number.isInteger(opts?.offset) && opts!.offset! >= 0 ? opts!.offset! : 0

    const sortKey =
      opts?.sort && END_USER_SORT_KEYS.has(opts.sort) ? (opts.sort as SortableKey) : null
    const dir = opts?.dir === 'desc' ? 'desc' : 'asc'
    if (sortKey) {
      const col = END_USER_SORT_COLUMNS[sortKey]
      if (col === 'created_at') {
        // The one epoch-ms numeric sort column — no case-folding applies, and
        // it gets its OWN branch so the tiebreaker below is not appended.
        //
        // The primary already IS `created_at`; emitting it twice
        // (`ORDER BY created_at ASC, created_at DESC, id DESC`) is valid and
        // behaviour-correct on both dialects — the second copy decides nothing
        // — but it LOOKS like it overrode the operator's choice, which is
        // exactly why `AdminStore.listAudit` (`key === 'time'`) and
        // `SyncStore.list` (`key === 'created'`) each carve the same case out.
        // `/customers?sort=created` is a live path, so this is the third copy
        // of one rule rather than a hypothetical tidy-up. Named through the
        // map rather than as a literal so this branch cannot silently disagree
        // with `END_USER_SORT_COLUMNS.created`.
        q = q.orderBy(END_USER_SORT_COLUMNS.created, dir).orderBy('id', 'desc')
      } else {
        if (col === 'display_name' || col === 'external_reference') {
          // Nullable TEXT columns. A bare `ORDER BY` collates by SQLite's
          // BINARY comparison (byte-value, so `'Zebra' < 'apple'`) but
          // Postgres's default locale-aware collation (`'apple' < 'Zebra'`),
          // so the same request returns rows in a different order depending
          // on which dialect answers it — `lower(...)` on both sides makes
          // the two agree. `lower(NULL)` is itself `NULL`, so `.nullsLast()`
          // places those rows at the end regardless of direction, same rule
          // `table-controls.ts`'s in-memory sort already applies ("Absent
          // values sort last in BOTH directions — a missing date is unknown,
          // not earliest"). Deliberately NOT applied to `email`/`tenant_id`
          // below: both are `NOT NULL`, so `.nullsLast()` there is a no-op on
          // SQLite but can force Postgres into a sort it would otherwise
          // avoid by scanning an index already in the requested order.
          q = q.orderBy(
            (eb) => eb.fn('lower', [col]),
            (ob) => (dir === 'desc' ? ob.desc() : ob.asc()).nullsLast(),
          )
        } else {
          // `email`/`tenant_id`: genuinely free-text, but `NOT NULL` — same
          // `lower()` case-folding as above, no `.nullsLast()`.
          q = q.orderBy(
            (eb) => eb.fn('lower', [col]),
            (ob) => (dir === 'desc' ? ob.desc() : ob.asc()),
          )
        }
        // The DEFAULT ordering always follows as the tiebreaker, never the sort
        // direction. Two rows can share an email/display name/tenant just as
        // easily as they can share `created_at`, and an unbroken tie over
        // LIMIT/OFFSET shows a row on two pages or on none — but WHICH stable
        // order breaks the tie is a choice, and this store used to make the
        // opposite one (`orderBy('id', dir)`).
        //
        // Both are deterministic and page-stable, so neither was a bug. They
        // are unified here on the rule `AdminStore.listAudit` and
        // `SyncStore.list` state outright, for two reasons: it is the one
        // written down as a rule, so a maintainer reading any store now finds
        // the same answer; and tie order does not flip underneath an operator
        // who only changed the sort direction — flipping `dir` on a column
        // where half the page ties silently reshuffles rows that did not move
        // in the sort at all. This reorders TIED rows only, never distinct
        // ones, on `GET /v1/customers` and the /customers admin page.
        //
        // `id` is a `randomUUID`, always lowercase hex, so it needs no
        // case-folding of its own.
        q = q.orderBy('created_at', 'desc').orderBy('id', 'desc')
      }
    } else {
      // Default order. `created_at` is `Date.now()` epoch-ms written at
      // insert (see `create()`), so bulk seeding or a scripted import can
      // produce ties — and paging with LIMIT/OFFSET over an unbroken tie
      // shows a row twice or not at all. `id` is a `randomUUID`, so
      // `ORDER BY created_at DESC, id DESC` is deterministic and page-stable
      // — but the tiebreak order WITHIN a tie is arbitrary (id has no
      // relationship to insertion order). That is the right trade for a
      // portable tiebreaker: `rowid` (SQLite) and `oid` (Postgres) are not
      // the same concept, and Postgres does not expose a stable implicit row
      // order at all. Do not "fix" this toward rowid/oid.
      q = q.orderBy('created_at', 'desc').orderBy('id', 'desc')
    }

    const rows = (await q.limit(limit).offset(offset).execute()) as EndUserSummaryDbRow[]
    return rows.map((r) => this.hydrateSummary(r))
  }

  /**
   * Total rows matching the filter — for `/customers`' pagination metadata.
   *
   * Before this existed, admin-api's `/api/end-users?page=` computed
   * `meta.total` by calling `list()` with NO limit and reading
   * `all.length` — which silently collapsed to `list()`'s own 50-row
   * default (there was no way to ask for "all"), so `meta.total` was capped
   * at 50 and the 51st customer was unreachable from the admin UI no matter
   * how many pages it offered. A real COUNT query has no such ceiling.
   */
  async countEndUsers(filter?: EndUserFilter): Promise<number> {
    const base = this.handle.kysely.selectFrom('end_users').select((eb) => eb.fn.countAll().as('n'))
    const row = await this.endUserWhere(base, filter).executeTakeFirstOrThrow()
    // COUNT is `int8`, which node-postgres returns as a STRING by default and
    // SQLite as a number (or a bigint for a very large count). `Number(...)`
    // normalises all three; without it the admin UI's pagination arithmetic
    // would silently become string concatenation on Postgres only.
    //
    // Not observable today, and deliberately kept anyway: `PostgresDbHandle`
    // installs a GLOBAL `types.setTypeParser(INT8, parseInt)` at open
    // (`../db/postgres.ts`), so this count already arrives as a number on both
    // dialects and removing the cast leaves every dual-dialect test green. The
    // cast is what keeps that a performance detail of the handle rather than a
    // correctness dependency of every store on it. Same cast, same caveat, as
    // `AdminStore.countAudit`, `SyncStore.count` and
    // `WebhookDeliveryStore.countForSubscription`.
    return Number((row as { n: number | bigint | string }).n)
  }

  async update(
    id: string,
    patch: {
      displayName?: string | null
      externalReference?: string | null
      pii?: EndUserPii | null
    },
  ): Promise<EndUserSummaryRow | null> {
    const existing = await this.getById(id)
    if (!existing) return null
    const now = Date.now()

    const nextDisplay = patch.displayName === undefined ? existing.displayName : patch.displayName
    const nextExternal =
      patch.externalReference === undefined ? existing.externalReference : patch.externalReference
    let nextPiiBlob: string | null
    if (patch.pii === undefined) {
      // Leave existing pii_data untouched.
      const current = (await this.handle.kysely
        .selectFrom('end_users')
        .select('pii_data')
        .where('id', '=', id)
        .executeTakeFirst()) as { pii_data: string | null } | undefined
      nextPiiBlob = current?.pii_data ?? null
    } else {
      nextPiiBlob = this.encryptPii(patch.pii)
    }

    await this.handle.kysely
      .updateTable('end_users')
      .set({
        display_name: nextDisplay,
        external_reference: nextExternal,
        pii_data: nextPiiBlob,
        updated_at: now,
      })
      .where('id', '=', id)
      .execute()

    return {
      id: existing.id,
      tenantId: existing.tenantId,
      email: existing.email,
      displayName: nextDisplay,
      externalReference: nextExternal,
      createdAt: existing.createdAt,
      updatedAt: now,
    }
  }

  /**
   * Hard-delete an end-user. Connect-sessions referencing this id should
   * have their `end_user_id` nulled before this is called — that's the
   * caller's responsibility (handled in the admin route).
   */
  async deleteById(id: string): Promise<boolean> {
    const res = await this.handle.kysely
      .deleteFrom('end_users')
      .where('id', '=', id)
      .executeTakeFirst()
    return Number(res.numDeletedRows) > 0
  }
}
