import type { Tag } from '../../../schema'
import { strMap } from './shared'

/**
 * Weeek tag, the spec's `#/components/schemas/Tag`
 * (https://developers.weeek.net/assets/weeek.yaml-Bhx55p8P.js):
 *   properties:{id:{type:"integer",format:"int64",minimum:1},title:{type:"string"},
 *   color:{type:"string"}}, required:["title","color","id"]
 * Returned by GET /ws/tags → { success, tags: Tag[] }
 * and GET /ws/tags/{id} → { success, tag: Tag }.
 *
 * The Tag schema carries no workspace field; tags belong to the token's one
 * workspace, so callers pass its id.
 */
export interface RawWeeekTag {
  id: number
  title: string
  color: string
}

export function transformTag(raw: RawWeeekTag, workspaceId: string): Tag {
  if (typeof raw.title !== 'string') {
    throw new Error(`Weeek tag ${String(raw.id)} has no title (required by the Tag schema)`)
  }
  const id = String(raw.id)
  return {
    id,
    externalId: id,
    workspaceId,
    name: raw.title,
    color: raw.color,
    platform: 'weeek',
    metadata: strMap({}),
    raw,
  }
}
