import type { Tag } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawGrooveTag {
  name: string
  count?: number
  [key: string]: unknown
}

export function transformTag(raw: RawGrooveTag): Tag {
  return {
    id: raw.name,
    externalId: raw.name,
    name: pickStr(raw.name) ?? '',
    platform: 'groove',
    metadata: strMap({ count: raw.count }),
    raw,
  }
}
