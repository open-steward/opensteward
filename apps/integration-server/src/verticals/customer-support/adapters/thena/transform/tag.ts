import type { Tag } from '../../../schema'
import { pickStr, strMap } from './shared'

/**
 * Raw tag shape from GET /v1/tags (TagsResponseDto).
 */
export interface RawThenaTag {
  id: string
  name?: string
  description?: string
  color?: string
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

export function transformTag(raw: RawThenaTag): Tag {
  return {
    id: pickStr(raw.id) ?? '',
    externalId: pickStr(raw.id) ?? '',
    name: pickStr(raw.name) ?? '',
    platform: 'thena',
    metadata: strMap({
      description: raw.description,
      color: raw.color,
    }),
    raw,
  }
}
