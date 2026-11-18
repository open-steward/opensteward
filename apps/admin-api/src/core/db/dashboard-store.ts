/**
 * DashboardStore — operator-defined dashboards.
 *
 * The `dashboards` table is declared in `admin-store.ts` migration v4 (audiences v6); this
 * module owns the read/write API. Like LogoStore it BORROWS the handle
 * AdminStore owns and must not close it.
 *
 * A dashboard is a name plus an ordered list of widgets, each naming a metric
 * from integration-server's catalog and how to chart it. No query text is
 * stored: a widget can only ever show what its metric computes, for the
 * viewer's own scope.
 */
import { randomUUID } from 'node:crypto'
import {
  CHART_TYPES,
  type ChartType,
  type DbHandle,
  type GranularityParam,
} from '@opensteward/shared'
import { normalisePins, normaliseTenants, parseTenantList, type Audience } from '../dashboards/audience'

/**
 * Every chart a widget may use — the shared list integration-server draws its
 * metrics' `charts` from, so a stored chart is always one the engine knows.
 * Whether it fits the widget's metric is checked against the catalog on save.
 */
export const DASHBOARD_CHARTS = CHART_TYPES
export type DashboardChart = ChartType

export interface DashboardWidget {
  metricId: string
  title?: string
  chart: DashboardChart
  /** Grid columns out of 12. */
  width: number
  /**
   * Pin the widget to one ISO 4217 currency. Absent (or null) follows the
   * dashboard view's currency filter. Ignored by metrics without money or a
   * currency field.
   */
  currency?: string | null
  /** Time buckets for a series over time; absent means `auto`. */
  granularity?: GranularityParam
  /** Also compute the prior equal-length period (number and gauge show the change). */
  compare?: boolean
}

export interface DashboardRecord {
  id: string
  name: string
  description: string | null
  widgets: DashboardWidget[]
  /** Null for a built-in dashboard. */
  ownerUserId: string | null
  audience: Audience
  /** Data limited to viewer scope ∩ these tenants; null = the viewer's whole scope. */
  pinnedTenants: string[] | null
  builtin: boolean
  createdAt: number
  updatedAt: number
}

interface DashboardRow {
  id: string
  name: string
  description: string | null
  layout_json: string
  owner_user_id: string
  visibility: string
  audience_tenants_json: string | null
  pinned_tenants_json: string | null
  created_at: number | string
  updated_at: number | string
}

function parseWidgets(json: string): DashboardWidget[] {
  try {
    const parsed = JSON.parse(json) as unknown
    return Array.isArray(parsed) ? (parsed as DashboardWidget[]) : []
  } catch {
    return []
  }
}

function audienceOf(row: DashboardRow): Audience {
  if (row.visibility !== 'shared') return { kind: 'private' }
  const tenants = parseTenantList(row.audience_tenants_json)
  return tenants === null ? { kind: 'everyone' } : { kind: 'tenants', tenants }
}

/** The two storage columns an audience becomes. */
function audienceColumns(a: Audience): { visibility: string; audience_tenants_json: string | null } {
  if (a.kind === 'private') return { visibility: 'private', audience_tenants_json: null }
  if (a.kind === 'everyone') return { visibility: 'shared', audience_tenants_json: null }
  return { visibility: 'shared', audience_tenants_json: JSON.stringify(normaliseTenants(a.tenants)) }
}

function pinsColumn(pins: string[] | null | undefined): string | null {
  const p = normalisePins(pins)
  return p ? JSON.stringify(p) : null
}

function toRecord(row: DashboardRow): DashboardRecord {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    widgets: parseWidgets(row.layout_json),
    ownerUserId: row.owner_user_id,
    audience: audienceOf(row),
    pinnedTenants: normalisePins(parseTenantList(row.pinned_tenants_json)),
    builtin: false,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  }
}

export class DashboardStore {
  private constructor(private readonly handle: DbHandle) {}

  /** Borrows an AdminStore-migrated handle (the table is admin_store v4). */
  static async create(handle: DbHandle): Promise<DashboardStore> {
    return new DashboardStore(handle)
  }

  /**
   * Every stored dashboard, newest first. Who may see which is decided by
   * `canSeeDashboard` in `core/dashboards/audience.ts`, never in SQL, so the
   * rule lives in one place (the table holds operator-made dashboards: tens
   * to hundreds of rows).
   */
  async listAll(): Promise<DashboardRecord[]> {
    const rows = (await this.handle.kysely
      .selectFrom('dashboards')
      .selectAll()
      .orderBy('updated_at', 'desc')
      .orderBy('id')
      .execute()) as DashboardRow[]
    return rows.map(toRecord)
  }

  async get(id: string): Promise<DashboardRecord | null> {
    const row = (await this.handle.kysely
      .selectFrom('dashboards')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst()) as DashboardRow | undefined
    return row ? toRecord(row) : null
  }

  async create(input: {
    name: string
    description: string | null
    widgets: DashboardWidget[]
    audience: Audience
    pinnedTenants: string[] | null
    ownerUserId: string
  }): Promise<DashboardRecord> {
    const id = `dsh_${randomUUID().replace(/-/g, '').slice(0, 20)}`
    const now = Date.now()
    await this.handle.kysely
      .insertInto('dashboards')
      .values({
        id,
        name: input.name,
        description: input.description,
        layout_json: JSON.stringify(input.widgets),
        owner_user_id: input.ownerUserId,
        ...audienceColumns(input.audience),
        pinned_tenants_json: pinsColumn(input.pinnedTenants),
        created_at: now,
        updated_at: now,
      })
      .execute()
    return (await this.get(id))!
  }

  async update(
    id: string,
    patch: {
      name?: string
      description?: string | null
      widgets?: DashboardWidget[]
      audience?: Audience
      pinnedTenants?: string[] | null
    },
  ): Promise<DashboardRecord | null> {
    const set: Record<string, unknown> = { updated_at: Date.now() }
    if (patch.name !== undefined) set['name'] = patch.name
    if (patch.description !== undefined) set['description'] = patch.description
    if (patch.widgets !== undefined) set['layout_json'] = JSON.stringify(patch.widgets)
    if (patch.audience !== undefined) Object.assign(set, audienceColumns(patch.audience))
    if (patch.pinnedTenants !== undefined) set['pinned_tenants_json'] = pinsColumn(patch.pinnedTenants)
    await this.handle.kysely.updateTable('dashboards').set(set).where('id', '=', id).execute()
    return this.get(id)
  }

  async delete(id: string): Promise<boolean> {
    const res = await this.handle.kysely
      .deleteFrom('dashboards')
      .where('id', '=', id)
      .executeTakeFirst()
    return Number(res.numDeletedRows ?? 0) > 0
  }
}
