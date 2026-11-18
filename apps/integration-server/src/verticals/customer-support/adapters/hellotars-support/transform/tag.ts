/**
 * Transform HelpDesk (by LiveChat) tag to canonical Tag.
 *
 * HelpDesk tags have UUID IDs, a name, and an optional color.
 *
 * Docs: https://api.helpdesk.com/docs#tag/Tags
 */
import type { Tag } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawHelpdeskTag {
  ID?: string | null
  id?: string | null
  name?: string | null
  color?: string | null
  createdAt?: string | null
  [key: string]: unknown
}

export function transformTag(raw: RawHelpdeskTag): Tag {
  const id = pickStr(raw.ID) ?? pickStr(raw.id) ?? ''
  return {
    id,
    externalId: id,
    name: pickStr(raw.name) ?? '',
    platform: 'hellotars-support',
    metadata: strMap({ color: raw.color }),
    raw,
  }
}
