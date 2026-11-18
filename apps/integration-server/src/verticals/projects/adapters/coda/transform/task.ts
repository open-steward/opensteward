import type { Task, TaskStatus } from '../../../schema'
import { pickNum, pickStr, strMap, toIso } from './shared'

/**
 * A canonical Task maps to a Coda **table** (or view) inside a doc — the
 * natural sub-object of a doc. Coda tables have no completion/priority/
 * assignee/due-date concept, so those canonical fields are left empty.
 *
 * Because Coda's per-table GET is path-scoped under its doc
 * (`/docs/{docId}/tables/{tableId}`) and there is no global table-by-id
 * endpoint, the canonical task id is the composite `{docId}:{tableId}` and
 * `projectId` carries the owning doc id.
 */
export interface RawCodaTable {
  id: string
  type?: 'table'
  tableType?: string
  href?: string
  browserLink?: string
  name?: string
  parent?: { id: string; type?: 'page'; name?: string }
  parentTable?: { id: string; type?: 'table'; name?: string }
  displayColumn?: { id: string; type?: 'column'; name?: string }
  rowCount?: number
  layout?: string
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

/** Tables have no open/closed lifecycle — always report `open`. */
function mapStatus(_raw: RawCodaTable): TaskStatus {
  return 'open'
}

export function transformTask(raw: RawCodaTable, docId?: string): Task {
  const pid = docId ?? ''
  // Views are derived tables that point back at a base table via `parentTable`.
  const isView = raw.tableType === 'view'
  return {
    id: pid ? `${pid}:${raw.id}` : raw.id,
    externalId: raw.id,
    projectId: pid,
    parentId: isView ? raw.parentTable?.id : undefined,
    title: pickStr(raw.name) ?? '',
    description: undefined,
    status: mapStatus(raw),
    priority: undefined,
    dueDate: undefined,
    assigneeIds: [],
    tagIds: [],
    subtaskCount: pickNum(raw.rowCount),
    createdAt: toIso(raw.createdAt),
    updatedAt: toIso(raw.updatedAt),
    platform: 'coda',
    metadata: strMap({
      platformType: isView ? 'view' : 'table',
      tableType: raw.tableType,
      layout: raw.layout,
      parentPageId: raw.parent?.id,
      parentPageName: raw.parent?.name,
      displayColumn: raw.displayColumn?.name,
      browserLink: raw.browserLink,
    }),
    raw,
  }
}
