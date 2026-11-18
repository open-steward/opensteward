/**
 * Zammad tag transform.
 *
 * Tag list endpoint: GET /api/v1/tag_list  (requires admin.tag)
 * Response: array of { id, name, count }
 *
 * Docs: https://docs.zammad.org/en/latest/api/ticket/tags.html
 */
import type { Tag } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawZammadTag {
  id?: number
  name: string
  count?: number
  [key: string]: unknown
}

export function transformTag(raw: RawZammadTag): Tag {
  // Use numeric id when available; fall back to name as stable key
  const id = raw.id !== undefined ? String(raw.id) : raw.name
  return {
    id,
    externalId: id,
    name: pickStr(raw.name) ?? '',
    platform: 'zammad',
    metadata: strMap({ count: raw.count }),
    raw,
  }
}
