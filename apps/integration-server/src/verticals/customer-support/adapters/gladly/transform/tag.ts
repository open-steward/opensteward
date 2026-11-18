import type { Tag } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawGladlyTag {
  name: string
  count?: number
  [key: string]: unknown
}

export function transformTag(raw: RawGladlyTag): Tag {
  return {
    id: raw.name,
    externalId: raw.name,
    name: pickStr(raw.name) ?? '',
    platform: 'gladly',
    metadata: strMap({ count: raw.count }),
    raw,
  }
}
