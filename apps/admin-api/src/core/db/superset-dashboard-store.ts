/**
 * SupersetDashboardStore — the registry of embedded Apache Superset
 * dashboards.
 *
 * The `superset_dashboards` table is declared in `admin-store.ts` migration
 * v5; this module owns the read/write API. Like DashboardStore it BORROWS the
 * handle AdminStore owns and must not close it.
 *
 * Superset itself is the source of truth for what a dashboard draws. The
 * registry only records which dashboards OpenSteward may embed, the id of
 * their embedded configuration, and who may open them (`verticals`,
 * `requiredPermission`). The superset-bootstrap job keeps it in step through
 * `PUT /api/internal/superset/dashboards`.
 */
import { randomUUID } from 'node:crypto'
import type { DbHandle } from '@opensteward/shared'
import {
  normalisePins,
  normaliseTenants,
  parseTenantList,
  type Audience,
} from '../dashboards/audience'

export interface SupersetDashboardRecord {
  id: string
  title: string
  description: string | null
  supersetUuid: string
  embeddedUuid: string
  /** Verticals the dashboard is about; null = not tied to a vertical. */
  verticals: string[] | null
  /** Extra permission needed on top of `dashboards:view`; null = none. */
  requiredPermission: string | null
  /** Who may open it; never `private`. Set by admins in the UI, never by the bootstrap job. */
  audience: Audience
  pinnedTenants: string[] | null
  createdAt: number
  updatedAt: number
}

export interface SupersetDashboardInput {
  title: string
  description: string | null
  supersetUuid: string
  embeddedUuid: string
  verticals: string[] | null
  requiredPermission: string | null
}

interface Row {
  id: string
  title: string
  description: string | null
  superset_uuid: string
  embedded_uuid: string
  verticals_json: string | null
  required_permission: string | null
  audience_tenants_json: string | null
  pinned_tenants_json: string | null
  created_at: number | string
  updated_at: number | string
}

function parseVerticals(json: string | null): string[] | null {
  if (json === null) return null
  try {
    const parsed = JSON.parse(json) as unknown
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : null
  } catch {
    return null
  }
}

function toRecord(row: Row): SupersetDashboardRecord {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    supersetUuid: row.superset_uuid,
    embeddedUuid: row.embedded_uuid,
    verticals: parseVerticals(row.verticals_json),
    requiredPermission: row.required_permission,
    audience: (() => {
      const tenants = parseTenantList(row.audience_tenants_json)
      return tenants === null
        ? { kind: 'everyone' as const }
        : { kind: 'tenants' as const, tenants }
    })(),
    pinnedTenants: normalisePins(parseTenantList(row.pinned_tenants_json)),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  }
}

export class SupersetDashboardStore {
  private constructor(private readonly handle: DbHandle) {}

  /** Borrows an AdminStore-migrated handle (the table is admin_store v5). */
  static async create(handle: DbHandle): Promise<SupersetDashboardStore> {
    return new SupersetDashboardStore(handle)
  }

  /** Every registered dashboard, by title. */
  async list(): Promise<SupersetDashboardRecord[]> {
    const rows = (await this.handle.kysely
      .selectFrom('superset_dashboards')
      .selectAll()
      .orderBy('title')
      .orderBy('id')
      .execute()) as Row[]
    return rows.map(toRecord)
  }

  async get(id: string): Promise<SupersetDashboardRecord | null> {
    const row = (await this.handle.kysely
      .selectFrom('superset_dashboards')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst()) as Row | undefined
    return row ? toRecord(row) : null
  }

  private async getBySupersetUuid(uuid: string): Promise<SupersetDashboardRecord | null> {
    const row = (await this.handle.kysely
      .selectFrom('superset_dashboards')
      .selectAll()
      .where('superset_uuid', '=', uuid)
      .executeTakeFirst()) as Row | undefined
    return row ? toRecord(row) : null
  }

  /** Admin-chosen audience and pins. `upsertMany` never touches these columns. */
  async setSharing(
    id: string,
    audience: Audience,
    pinnedTenants: string[] | null,
  ): Promise<SupersetDashboardRecord | null> {
    const pins = normalisePins(pinnedTenants)
    await this.handle.kysely
      .updateTable('superset_dashboards')
      .set({
        audience_tenants_json:
          audience.kind === 'tenants' ? JSON.stringify(normaliseTenants(audience.tenants)) : null,
        pinned_tenants_json: pins ? JSON.stringify(pins) : null,
        updated_at: Date.now(),
      })
      .where('id', '=', id)
      .execute()
    return this.get(id)
  }

  /**
   * Insert or update each dashboard, keyed by its Superset uuid, so a
   * re-run of the bootstrap keeps every registry id (and so every admin UI
   * link) stable. With `prune`, dashboards not in `items` are removed.
   */
  async upsertMany(
    items: SupersetDashboardInput[],
    opts: { prune?: boolean } = {},
  ): Promise<{ created: number; updated: number; removed: number }> {
    let created = 0
    let updated = 0
    let removed = 0
    const now = Date.now()
    for (const item of items) {
      const verticalsJson = item.verticals === null ? null : JSON.stringify(item.verticals)
      const existing = await this.getBySupersetUuid(item.supersetUuid)
      if (existing) {
        // Never audience_tenants_json / pinned_tenants_json: admins own sharing.
        await this.handle.kysely
          .updateTable('superset_dashboards')
          .set({
            title: item.title,
            description: item.description,
            embedded_uuid: item.embeddedUuid,
            verticals_json: verticalsJson,
            required_permission: item.requiredPermission,
            updated_at: now,
          })
          .where('id', '=', existing.id)
          .execute()
        updated += 1
      } else {
        await this.handle.kysely
          .insertInto('superset_dashboards')
          .values({
            id: `ssd_${randomUUID().replace(/-/g, '').slice(0, 20)}`,
            title: item.title,
            description: item.description,
            superset_uuid: item.supersetUuid,
            embedded_uuid: item.embeddedUuid,
            verticals_json: verticalsJson,
            required_permission: item.requiredPermission,
            created_at: now,
            updated_at: now,
          })
          .execute()
        created += 1
      }
    }
    if (opts.prune) {
      const keep = new Set(items.map((i) => i.supersetUuid))
      for (const d of await this.list()) {
        if (keep.has(d.supersetUuid)) continue
        await this.handle.kysely.deleteFrom('superset_dashboards').where('id', '=', d.id).execute()
        removed += 1
      }
    }
    return { created, updated, removed }
  }
}
