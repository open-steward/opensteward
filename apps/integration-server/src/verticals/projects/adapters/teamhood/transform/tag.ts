/**
 * Teamhood has no tag resource: tags are the plain strings in an item's
 * documented `tags` array (Entities.Item.tags, string[]). A canonical Tag is
 * built from one such label, which is its own id within the workspace the
 * items were read from.
 */
import type { Tag } from '../../../schema'

export interface RawTeamhoodTag {
  /** The tag label as returned in item.tags[]. */
  name: string
}

export function transformTag(raw: RawTeamhoodTag, workspaceId: string): Tag {
  return {
    id: raw.name,
    externalId: raw.name,
    workspaceId,
    name: raw.name,
    platform: 'teamhood',
    metadata: {},
    raw,
  }
}
