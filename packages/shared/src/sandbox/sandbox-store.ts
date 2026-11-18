/**
 * Storage for sandbox records — a table of its own, deliberately.
 *
 * The sandbox needs somewhere to keep what a test key writes so a POST reads
 * back on the next GET. Three options were on the table:
 *
 *  1. Reuse `ResourceStore` with a mode parameter threaded through its six
 *     method signatures. Every call site then becomes a place where forgetting
 *     the parameter silently reads live rows.
 *  2. Reuse `ResourceStore` under a derived tenant id. That axis does not
 *     exist: despite the column name, `resources.tenant_id` carries the
 *     CONNECTION id, so a derived tenant would isolate nothing there.
 *  3. A separate table. The live code path cannot reach it because it never
 *     references it — auditing the boundary is `grep -r sandbox_resources` —
 *     and "delete all sandbox data" is one statement.
 *
 * Option 3, and it has one more advantage that decides it: `ResourceStore`
 * lives on `dataHandle`, which is only opened when `dataStoreMode !==
 * 'passthrough'`. A sandbox built on it would not exist at all in a passthrough
 * deployment. This store lives on the credential handle, which is always open.
 *
 * Contents are synthetic by construction, so the rows are NOT encrypted and
 * this store is deliberately absent from the encrypted-blob inventory.
 *
 * Follows `ResourceStore`'s conventions throughout: JSON-as-TEXT on both
 * dialects, epoch columns INTEGER/BIGINT, and the borrower rule — the handle is
 * owned by the boot layer and is never closed here.
 */
import type { DbHandle, DualMigration } from '../db/types'

const DEFAULT_TABLE = 'sandbox_resources'

/**
 * Per (tenant, vertical) row cap. Without one a test key is a disk-fill
 * primitive: the sandbox accepts writes, and nothing else bounds them.
 */
export const DEFAULT_SANDBOX_QUOTA = 10_000

export class SandboxQuotaError extends Error {
  constructor(
    readonly tenantId: string,
    readonly vertical: string,
    readonly limit: number,
  ) {
    super(
      `Sandbox storage limit reached for ${vertical} (${limit} records). ` +
        `DELETE /test/v1/reset clears it.`,
    )
    this.name = 'SandboxQuotaError'
  }
}

export class SandboxNotFoundError extends Error {
  constructor(resourceType: string, resourceId: string) {
    super(`No ${resourceType} with id ${resourceId} in this sandbox.`)
    this.name = 'SandboxNotFoundError'
  }
}

export interface SandboxRow<T = unknown> {
  resourceId: string
  parentId: string | null
  data: T
  createdAt: number
  updatedAt: number
}

// Epoch columns are INTEGER on SQLite and BIGINT on Postgres (the Postgres
// handle parses int8 back to a JS number); `data` stays TEXT on both so the
// JSON crosses the query seam byte-identically. Same conventions as
// `data-store/resource-store.ts`.
const MIGRATIONS: DualMigration[] = [
  {
    version: 1,
    sqlite: `
      CREATE TABLE IF NOT EXISTS sandbox_resources (
        pk            TEXT PRIMARY KEY,
        tenant_id     TEXT NOT NULL,
        vertical      TEXT NOT NULL,
        resource_type TEXT NOT NULL,
        resource_id   TEXT NOT NULL,
        parent_id     TEXT,
        data          TEXT NOT NULL,
        created_at    INTEGER NOT NULL,
        updated_at    INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_sandbox_resources_lookup
        ON sandbox_resources (tenant_id, vertical, resource_type, parent_id);
    `,
    postgres: `
      CREATE TABLE IF NOT EXISTS sandbox_resources (
        pk            TEXT PRIMARY KEY,
        tenant_id     TEXT NOT NULL,
        vertical      TEXT NOT NULL,
        resource_type TEXT NOT NULL,
        resource_id   TEXT NOT NULL,
        parent_id     TEXT,
        data          TEXT NOT NULL,
        created_at    BIGINT NOT NULL,
        updated_at    BIGINT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_sandbox_resources_lookup
        ON sandbox_resources (tenant_id, vertical, resource_type, parent_id);
    `,
  },
]

export interface SandboxStoreOptions {
  tableName?: string
  quota?: number
}

export class SandboxStore {
  private constructor(
    private readonly handle: DbHandle,
    private readonly table: string,
    private readonly quota: number,
  ) {}

  /**
   * Open against the shared handle. The handle is owned by the boot layer and
   * SHARED with sibling stores — this store never closes it.
   */
  static async create(handle: DbHandle, options?: SandboxStoreOptions): Promise<SandboxStore> {
    await handle.migrate('sandbox_resources', MIGRATIONS)
    return new SandboxStore(
      handle,
      options?.tableName ?? DEFAULT_TABLE,
      options?.quota ?? DEFAULT_SANDBOX_QUOTA,
    )
  }

  private pk(tenantId: string, vertical: string, resourceType: string, resourceId: string): string {
    return `${tenantId}|${vertical}|${resourceType}|${resourceId}`
  }

  async get<T>(
    tenantId: string,
    vertical: string,
    resourceType: string,
    resourceId: string,
  ): Promise<T | null> {
    const row = (await this.handle.kysely
      .selectFrom(this.table)
      .select(['data'])
      .where('pk', '=', this.pk(tenantId, vertical, resourceType, resourceId))
      .executeTakeFirst()) as { data: string } | undefined
    return row ? (JSON.parse(row.data) as T) : null
  }

  /**
   * All records of a type, oldest first so a list is stable across calls.
   * `parentId` narrows to a parent-scoped resource; omit it to ignore the
   * column entirely.
   */
  async list<T>(
    tenantId: string,
    vertical: string,
    resourceType: string,
    parentId?: string | null,
  ): Promise<Array<SandboxRow<T>>> {
    let q = this.handle.kysely
      .selectFrom(this.table)
      .select(['resource_id', 'parent_id', 'data', 'created_at', 'updated_at'])
      .where('tenant_id', '=', tenantId)
      .where('vertical', '=', vertical)
      .where('resource_type', '=', resourceType)
    // `= NULL` is never true; the null case needs `IS NULL`, and Kysely has no
    // portable operator that covers both. Same branch as ResourceStore.list.
    if (parentId !== undefined) {
      q = parentId === null ? q.where('parent_id', 'is', null) : q.where('parent_id', '=', parentId)
    }
    const rows = (await q.orderBy('created_at', 'asc').execute()) as Array<{
      resource_id: string
      parent_id: string | null
      data: string
      created_at: number
      updated_at: number
    }>
    return rows.map((r) => ({
      resourceId: r.resource_id,
      parentId: r.parent_id,
      data: JSON.parse(r.data) as T,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }))
  }

  async upsert(
    tenantId: string,
    vertical: string,
    resourceType: string,
    resourceId: string,
    data: unknown,
    parentId: string | null = null,
  ): Promise<void> {
    // Quota is checked on insert only — an update replaces a row it already
    // paid for, and refusing it would strand a sandbox at the limit with no way
    // to correct a record.
    const existing = await this.get(tenantId, vertical, resourceType, resourceId)
    if (existing === null && (await this.countFor(tenantId, vertical)) >= this.quota) {
      throw new SandboxQuotaError(tenantId, vertical, this.quota)
    }
    const now = Date.now()
    const pk = this.pk(tenantId, vertical, resourceType, resourceId)
    const serialised = JSON.stringify(data)
    await this.handle.kysely
      .insertInto(this.table)
      .values({
        pk,
        tenant_id: tenantId,
        vertical,
        resource_type: resourceType,
        resource_id: resourceId,
        parent_id: parentId,
        data: serialised,
        created_at: now,
        updated_at: now,
      })
      .onConflict((oc) =>
        oc.column('pk').doUpdateSet({ data: serialised, parent_id: parentId, updated_at: now }),
      )
      .execute()
  }

  async upsertMany(
    tenantId: string,
    vertical: string,
    resourceType: string,
    items: Array<{ id: string; parentId?: string | null; data: unknown }>,
  ): Promise<void> {
    if (items.length === 0) return
    if ((await this.countFor(tenantId, vertical)) + items.length > this.quota) {
      throw new SandboxQuotaError(tenantId, vertical, this.quota)
    }
    const now = Date.now()
    await this.handle.transaction(async (tx) => {
      for (const item of items) {
        const serialised = JSON.stringify(item.data)
        const parentId = item.parentId ?? null
        await tx
          .insertInto(this.table)
          .values({
            pk: this.pk(tenantId, vertical, resourceType, item.id),
            tenant_id: tenantId,
            vertical,
            resource_type: resourceType,
            resource_id: item.id,
            parent_id: parentId,
            data: serialised,
            created_at: now,
            updated_at: now,
          })
          .onConflict((oc) =>
            oc.column('pk').doUpdateSet({ data: serialised, parent_id: parentId, updated_at: now }),
          )
          .execute()
      }
    })
  }

  /** True when a row was removed. */
  async delete(
    tenantId: string,
    vertical: string,
    resourceType: string,
    resourceId: string,
  ): Promise<boolean> {
    const res = await this.handle.kysely
      .deleteFrom(this.table)
      .where('pk', '=', this.pk(tenantId, vertical, resourceType, resourceId))
      .executeTakeFirst()
    return Number(res.numDeletedRows) > 0
  }

  async countFor(tenantId: string, vertical: string): Promise<number> {
    const row = (await this.handle.kysely
      .selectFrom(this.table)
      .select((eb) => eb.fn.countAll().as('n'))
      .where('tenant_id', '=', tenantId)
      .where('vertical', '=', vertical)
      .executeTakeFirst()) as { n: number | bigint | string } | undefined
    // Postgres returns count as a string.
    return row ? Number(row.n) : 0
  }

  /** Wipe one tenant's sandbox — every vertical. Returns rows removed. */
  async resetTenant(tenantId: string): Promise<number> {
    const res = await this.handle.kysely
      .deleteFrom(this.table)
      .where('tenant_id', '=', tenantId)
      .executeTakeFirst()
    return Number(res.numDeletedRows)
  }

  /** Wipe one tenant's sandbox for one vertical. Returns rows removed. */
  async resetVertical(tenantId: string, vertical: string): Promise<number> {
    const res = await this.handle.kysely
      .deleteFrom(this.table)
      .where('tenant_id', '=', tenantId)
      .where('vertical', '=', vertical)
      .executeTakeFirst()
    return Number(res.numDeletedRows)
  }
}
