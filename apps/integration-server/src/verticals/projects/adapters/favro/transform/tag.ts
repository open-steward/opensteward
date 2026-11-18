import type { Tag } from '../../../schema'
import { pickStr, strMap } from './shared'

/**
 * Favro tag (label). Scoped to an organization; carries a `name` and a `color`
 * (a Favro palette name such as `blue`/`green`, surfaced verbatim).
 */
export interface RawFavroTag {
  tagId: string
  organizationId?: string
  name?: string
  color?: string
  [key: string]: unknown
}

export function transformTag(raw: RawFavroTag): Tag {
  return {
    id: raw.tagId,
    externalId: raw.tagId,
    workspaceId: pickStr(raw.organizationId) ?? '',
    name: pickStr(raw.name) ?? '',
    color: pickStr(raw.color),
    platform: 'favro',
    metadata: strMap({}),
    raw,
  }
}
