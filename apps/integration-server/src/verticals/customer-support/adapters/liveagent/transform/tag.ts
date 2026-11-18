/**
 * LiveAgent Tag → canonical Tag.
 *
 * Tag model fields: id, name, color, background_color, is_public, is_archived.
 */
import type { Tag } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawLiveagentTag {
  id?: string
  name?: string
  color?: string
  background_color?: string
  is_public?: string
  is_archived?: string
  [key: string]: unknown
}

export function transformTag(raw: RawLiveagentTag): Tag {
  const id = pickStr(raw.id) ?? pickStr(raw.name) ?? ''
  return {
    id,
    externalId: id,
    name: pickStr(raw.name) ?? '',
    color: pickStr(raw.color),
    platform: 'liveagent',
    metadata: strMap({
      color: raw.color,
      backgroundColor: raw.background_color,
      isPublic: raw.is_public,
      isArchived: raw.is_archived,
    }),
    raw,
  }
}
