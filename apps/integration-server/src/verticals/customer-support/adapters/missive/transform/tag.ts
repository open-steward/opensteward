/**
 * Missive shared_label → Tag
 *
 * Missive shared labels are the organizational grouping that maps to the
 * canonical Tag schema. Fetched from GET /v1/shared_labels.
 */
import type { Tag } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawMissiveSharedLabel {
  id: string
  name?: string | null
  color?: string | null
  description?: string | null
  visibility?: string | null
  parent_id?: string | null
  organization?: { id?: string; [key: string]: unknown } | null
  [key: string]: unknown
}

export function transformTag(raw: RawMissiveSharedLabel): Tag {
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    name: pickStr(raw.name) ?? '',
    platform: 'missive',
    metadata: strMap({
      color: raw.color,
      description: raw.description,
      visibility: raw.visibility,
      parentId: raw.parent_id,
    }),
    raw,
  }
}
