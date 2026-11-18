/**
 * Maps a Document360 Category to the canonical Tag shape.
 *
 * Categories organise articles within a project version.
 * They are the closest equivalent to "tags" in the canonical schema.
 *
 * Docs: https://apidocs.document360.com/apidocs/project-version-categories
 */
import type { Tag } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface RawDocument360Category {
  id: string
  name?: string
  /** ID of the parent category (null for top-level) */
  parent_category_id?: string | null
  /** Display order within its parent */
  order?: number
  created_at?: string
  [key: string]: unknown
}

export function transformTag(raw: RawDocument360Category): Tag {
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    name: pickStr(raw.name) ?? '',
    platform: 'document360',
    metadata: strMap({
      parentCategoryId: raw.parent_category_id,
      order: raw.order,
      createdAt: toIso(raw.created_at),
    }),
    raw,
  }
}
