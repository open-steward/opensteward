/**
 * Transforms a Libredesk tag into the canonical Tag schema.
 *
 * Libredesk tags are simple: { id, name }. There is no count field.
 * The list endpoint returns an array directly (no pagination wrapper).
 *
 * Ref: internal/tag/models/models.go (Tag)
 */
import type { Tag } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface RawLibredeskTag {
  id: number
  name: string
  created_at?: string
  [key: string]: unknown
}

export function transformTag(raw: RawLibredeskTag): Tag {
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    name: pickStr(raw.name) ?? '',
    platform: 'libredesk',
    metadata: strMap({ createdAt: toIso(raw.created_at) }),
    raw,
  }
}
