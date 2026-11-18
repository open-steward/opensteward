import type { Task } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'
import { FID_DATE_CREATED, FID_DATE_MODIFIED, FID_RECORD_ID, FID_RECORD_OWNER } from '../constants'

/**
 * A Quickbase **record** maps to the canonical Task. Records have no fixed
 * schema: /records/query returns each field keyed by its numeric field id,
 * with the value wrapped in a `{ value }` envelope. We read the built-in
 * field ids (1=Date Created, 2=Date Modified, 3=Record ID#, 4=Record Owner)
 * positionally, and surface the table's key field as the title when supplied.
 * Docs: https://developer.quickbase.com/operation/runQuery
 */
export interface QuickbaseFieldValue {
  value: unknown
}

export type RawQuickbaseRecord = Record<string, QuickbaseFieldValue | undefined>

/** Read a record cell by field id, unwrapping the `{ value }` envelope. */
function cell(raw: RawQuickbaseRecord, fid: number): unknown {
  return raw[String(fid)]?.value
}

/** Quickbase users serialize as `{ id, name, email }` in record cells. */
function userId(v: unknown): string | undefined {
  if (v && typeof v === 'object') {
    const id = (v as Record<string, unknown>)['id']
    if (id != null) return String(id)
  }
  return pickStr(v)
}

export interface TransformRecordOptions {
  /** Field id whose value should be used as the task title (e.g. the table key field). */
  titleFieldId?: number
}

export function transformRecord(
  raw: RawQuickbaseRecord,
  tableId: string,
  options: TransformRecordOptions = {},
): Task {
  const recordId = pickStr(cell(raw, FID_RECORD_ID)) ?? ''
  const owner = userId(cell(raw, FID_RECORD_OWNER))

  const titleValue =
    options.titleFieldId != null ? cell(raw, options.titleFieldId) : undefined
  const title = pickStr(titleValue) ?? recordId

  // Surface every scalar cell under metadata so operators can locate any field
  // without re-querying — keyed by `field.<fid>`.
  const meta: Record<string, unknown> = { platformType: 'record' }
  for (const [fid, cellValue] of Object.entries(raw)) {
    const v = cellValue?.value
    if (v == null) continue
    if (typeof v === 'object') continue
    meta[`field.${fid}`] = v
  }

  return {
    id: recordId,
    externalId: recordId,
    projectId: tableId,
    title,
    status: 'unknown',
    assigneeIds: owner ? [owner] : [],
    tagIds: [],
    createdAt: toIso(cell(raw, FID_DATE_CREATED)),
    updatedAt: toIso(cell(raw, FID_DATE_MODIFIED)),
    platform: 'quickbase',
    metadata: strMap(meta),
    raw,
  }
}
