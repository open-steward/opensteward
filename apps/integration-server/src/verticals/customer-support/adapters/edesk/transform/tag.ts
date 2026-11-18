/**
 * Transform eDesk tag raw API response to the canonical Tag schema.
 *
 * eDesk tag fields (v1):
 *   id, name, active, tag_group_id, color, icon
 */
import type { Tag } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawEdeskTag {
  id: number | string
  name?: string | null
  active?: boolean | null
  tag_group_id?: number | null
  color?: string | null
  icon?: string | null
  [key: string]: unknown
}

export function transformTag(raw: RawEdeskTag): Tag {
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    name: pickStr(raw.name) ?? '',
    platform: 'edesk',
    metadata: strMap({
      active: raw.active,
      tagGroupId: raw.tag_group_id,
      color: raw.color,
      icon: raw.icon,
    }),
    raw,
  }
}
