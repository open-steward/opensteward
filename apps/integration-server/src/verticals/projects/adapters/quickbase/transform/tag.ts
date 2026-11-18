import type { Tag } from '../../../schema'
import { pickStr, strMap } from './shared'

/**
 * Quickbase has no first-class "tag" resource. The closest analog is a
 * **field** — the labeled, typed column that classifies a record. We surface
 * fields as canonical Tags so the schema slot is populated for tables that use
 * multiple-choice / list-of-values fields. `workspaceId` carries the owning
 * table id (fields belong to a table, not directly to an app).
 * Docs: https://developer.quickbase.com/operation/getFields
 */
export interface RawQuickbaseField {
  id: number
  label?: string
  fieldType?: string
  mode?: string
  required?: boolean
  unique?: boolean
  [key: string]: unknown
}

export function transformField(raw: RawQuickbaseField, tableId?: string): Tag {
  const id = String(raw.id)
  return {
    id,
    externalId: id,
    workspaceId: tableId ?? '',
    name: pickStr(raw.label) ?? '',
    platform: 'quickbase',
    metadata: strMap({
      fieldType: raw.fieldType,
      mode: raw.mode,
      required: raw.required,
      unique: raw.unique,
    }),
    raw,
  }
}
