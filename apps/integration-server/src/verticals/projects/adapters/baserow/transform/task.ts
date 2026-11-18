import type { Task, TaskStatus } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

/**
 * Raw row object returned by `GET /api/database/rows/table/{table_id}/`.
 *
 * Baserow rows have a fixed `id` and `order`, plus dynamic field columns named
 * `field_<N>`. The row endpoint also surfaces `created_on` / `updated_on` when
 * metadata is requested. Dynamic field names are opaque at this layer — we
 * surface them in `metadata` and `raw`.
 *
 * Response fields:
 *   id          – integer row id
 *   order       – decimal sort order string (e.g. "1.00000000000000000000")
 *   created_on  – ISO-8601 datetime (available when ?metadata=true or via extended endpoint)
 *   updated_on  – ISO-8601 datetime
 *   field_*     – user-defined field values (any type)
 */
export interface RawBaserowRow {
  id: number | string
  order?: string | number
  created_on?: string
  updated_on?: string
  [key: string]: unknown
}

function mapStatus(_raw: RawBaserowRow): TaskStatus {
  // Baserow rows have no universal status field. Return 'open' as default.
  return 'open'
}

export function transformTask(raw: RawBaserowRow, tableId: string): Task {
  // Collect dynamic field_* values as metadata strings (non-null primitives).
  const fieldMeta: Record<string, string> = {}
  for (const [k, v] of Object.entries(raw)) {
    if (!k.startsWith('field_')) continue
    if (v === null || v === undefined) continue
    if (typeof v === 'object') continue
    fieldMeta[k] = String(v)
  }

  return {
    id: String(raw.id),
    externalId: String(raw.id),
    projectId: tableId,
    parentId: undefined,
    title: pickStr(raw['field_1']) ?? `Row ${raw.id}`,
    description: undefined,
    status: mapStatus(raw),
    priority: undefined,
    dueDate: undefined,
    assigneeIds: [],
    tagIds: [],
    subtaskCount: undefined,
    createdAt: toIso(raw.created_on),
    updatedAt: toIso(raw.updated_on),
    platform: 'baserow',
    metadata: strMap({
      order: raw.order,
      tableId,
      ...fieldMeta,
    }),
    raw,
  }
}
