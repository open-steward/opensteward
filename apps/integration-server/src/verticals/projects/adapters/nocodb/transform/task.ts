import type { Task, TaskStatus } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

/**
 * NocoDB row/record maps to a canonical Task.
 *
 * Response from:
 *   GET /api/v2/tables/{tableId}/records
 *   GET /api/v2/tables/{tableId}/records/{rowId}
 *
 * NocoDB rows have system fields (`Id`, `CreatedAt`, `UpdatedAt`) plus
 * arbitrary user-defined fields. We surface the system fields and treat
 * the row title field (commonly `Title` or the first text column) as the
 * task title. All user columns are kept verbatim in `raw`.
 */
export interface RawNocodbRecord {
  Id?: number | string
  Title?: string
  CreatedAt?: string
  UpdatedAt?: string
  [key: string]: unknown
}

function mapStatus(_raw: RawNocodbRecord): TaskStatus {
  // NocoDB has no universal "done" field; rows are implicitly open.
  return 'open'
}

/**
 * Derive a display title from the record. NocoDB names the primary text
 * field `Title` by default, but users may rename it. Fall back to the first
 * non-system string field, then to the row id.
 */
function pickTitle(raw: RawNocodbRecord): string {
  if (typeof raw.Title === 'string' && raw.Title) return raw.Title
  const systemKeys = new Set(['Id', 'CreatedAt', 'UpdatedAt'])
  for (const [k, v] of Object.entries(raw)) {
    if (systemKeys.has(k)) continue
    if (typeof v === 'string' && v.length > 0) return v
  }
  return String(raw.Id ?? '')
}

export function transformTask(raw: RawNocodbRecord, tableId: string): Task {
  const rowId = pickStr(raw.Id != null ? String(raw.Id) : undefined) ?? ''
  // Canonical id encodes both table and row so getTask can reconstruct the path.
  const canonicalId = `${tableId}:${rowId}`
  return {
    id: canonicalId,
    externalId: rowId,
    projectId: tableId,
    parentId: undefined,
    title: pickTitle(raw),
    description: undefined,
    status: mapStatus(raw),
    priority: undefined,
    dueDate: undefined,
    assigneeIds: [],
    tagIds: [],
    subtaskCount: undefined,
    createdAt: toIso(raw.CreatedAt),
    updatedAt: toIso(raw.UpdatedAt),
    platform: 'nocodb',
    metadata: strMap({ rowId, tableId }),
    raw,
  }
}
