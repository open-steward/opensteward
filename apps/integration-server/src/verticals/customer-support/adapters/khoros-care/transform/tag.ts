/**
 * Transform a Khoros Care tag into the canonical Tag shape.
 *
 * `GET /api/v2/tags` returns `{ status, data: [ { updatedMillis, tagId,
 * lswUuid, name, hierarchy, internalHierarchy, tagColor, url, typeValue,
 * visibilityValue, tagState, tagPartition } ] }`. `tagId` is the id the
 * Conversation API puts in a conversation's `tags[].tagId`, so it is the id
 * here too, and ticket `tagIds` resolve against it.
 *
 * Docs: https://developer.khoros.com/khoroscaredevdocs/reference/tags
 */
import type { Tag } from '../../../schema'
import { pickStr, required, strMap } from './shared'

export interface RawKhorosCareTag {
  tagId?: number
  lswUuid?: string
  name?: string
  hierarchy?: string
  tagColor?: string
  tagState?: string
  tagPartition?: string
  [key: string]: unknown
}

export function transformTag(raw: RawKhorosCareTag): Tag {
  const id = String(required(raw.tagId, 'tag tagId'))
  return {
    id,
    externalId: id,
    name: required(pickStr(raw.name), `name of tag ${id}`),
    color: pickStr(raw.tagColor),
    platform: 'khoros-care',
    metadata: strMap({
      lswUuid: raw.lswUuid,
      hierarchy: raw.hierarchy,
      tagState: raw.tagState,
      tagPartition: raw.tagPartition,
    }),
    raw,
  }
}
