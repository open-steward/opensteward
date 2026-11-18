/**
 * Row building: a stored record → an `ExportRow`.
 *
 * The record is masked FIRST (`applyMasking` with the resource type's
 * classification), and everything exported — the `data` JSON and the
 * flattened columns alike — comes from the masked copy. There is no path by
 * which an unmasked value reaches a destination without `include_pii`.
 */
import {
  applyMasking,
  type MaskOptions,
  type ResourceClassification,
  type StoredResource,
  type Tombstone,
} from '@opensteward/shared'
import type { DeleteScope, DeleteSpec, ExportRow, ScalarValue } from './types'

/** Fixed columns, in file order. `fields` follow them. */
export const FIXED_COLUMNS = [
  '_pk',
  'connection_id',
  'owner_tenant_id',
  'platform',
  'vertical',
  'resource_type',
  'resource_id',
  'changed_at',
  'norm_version',
  '_deleted',
  'data',
] as const

const RESERVED = new Set<string>(FIXED_COLUMNS)

/** Postgres truncates identifiers at 63 bytes; keep every sink consistent. */
export const MAX_COLUMN_LENGTH = 63

/**
 * A column name made of `[a-z0-9_]` only: camelCase split to snake_case,
 * everything else folded to `_`, a leading digit prefixed. Never empty.
 */
export function sanitizeColumnName(name: string): string {
  let s = name
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^_+|_+$/g, '')
  if (s === '') s = 'field'
  if (/^[0-9]/.test(s)) s = `f_${s}`
  return s.slice(0, MAX_COLUMN_LENGTH)
}

/**
 * The flattened column for a top-level field. A name that collides with a
 * fixed column gets a `field_` prefix (`platform` → `field_platform`).
 */
export function flattenedColumnName(key: string): string {
  const s = sanitizeColumnName(key)
  return RESERVED.has(s) ? `field_${s}`.slice(0, MAX_COLUMN_LENGTH) : s
}

function isScalar(v: unknown): v is ScalarValue {
  return (
    typeof v === 'string' || typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v))
  )
}

/**
 * Top-level scalar fields of a (masked) record under sanitised names. Keys
 * are visited in sorted order so a sanitisation collision (`a-b` / `a_b`)
 * resolves the same way every time: the first wins, the rest stay in `data`.
 */
export function flattenScalars(record: unknown): Record<string, ScalarValue> {
  const out: Record<string, ScalarValue> = {}
  if (typeof record !== 'object' || record === null || Array.isArray(record)) return out
  for (const key of Object.keys(record).sort()) {
    const v = (record as Record<string, unknown>)[key]
    if (!isScalar(v)) continue
    const col = flattenedColumnName(key)
    if (Object.hasOwn(out, col)) continue
    out[col] = v
  }
  return out
}

/** The store's primary key for a row — the `_pk` column. */
export function resourcePk(
  vertical: string,
  platform: string,
  connectionId: string | null,
  resourceType: string,
  resourceId: string,
): string {
  return `${vertical}:${platform}:${connectionId ?? ''}:${resourceType}:${resourceId}`
}

export interface BuildRowContext {
  ownerTenantId: string | null
  classification: ResourceClassification
  mask: MaskOptions
}

/** One changed record → its export row, masked per `ctx`. */
export function buildExportRow(
  item: StoredResource & { pk?: string },
  ctx: BuildRowContext,
): ExportRow {
  const masked = applyMasking(item.data, ctx.classification, ctx.mask)
  return {
    _pk:
      item.pk ??
      resourcePk(
        item.vertical,
        item.platform,
        item.connectionId,
        item.resourceType,
        item.resourceId,
      ),
    connection_id: item.connectionId,
    owner_tenant_id: ctx.ownerTenantId,
    platform: item.platform,
    vertical: item.vertical,
    resource_type: item.resourceType,
    resource_id: item.resourceId,
    changed_at: item.changedAt,
    norm_version: item.normVersion,
    _deleted: false,
    data: JSON.stringify(masked ?? null),
    fields: flattenScalars(masked),
  }
}

/** Rough in-memory/encoded size of a row, for the flush-by-bytes budget. */
export function estimateRowBytes(row: ExportRow): number {
  let n = 160 + row._pk.length + row.data.length
  for (const [k, v] of Object.entries(row.fields)) {
    n += k.length + (typeof v === 'string' ? v.length : 8)
  }
  return n
}

export function deleteScopeOf(t: Tombstone): DeleteScope {
  if (t.vertical === null) return 'all'
  if (t.resourceId !== null && t.resourceType !== null) return 'record'
  if (t.platform !== null) return 'connection'
  return 'vertical'
}

/** A store tombstone → what the destination should delete. */
export function tombstoneToDelete(t: Tombstone, ownerTenantId: string | null): DeleteSpec {
  const scope = deleteScopeOf(t)
  return {
    tombstoneId: t.id,
    scope,
    pk:
      scope === 'record'
        ? resourcePk(t.vertical!, t.platform ?? '', t.connectionId, t.resourceType!, t.resourceId!)
        : null,
    vertical: t.vertical,
    platform: t.platform,
    connectionId: t.connectionId,
    ownerTenantId,
    resourceType: t.resourceType,
    resourceId: t.resourceId,
    deletedAt: t.deletedAt,
  }
}
