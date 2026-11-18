import type { Tag } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawHappyFoxTag {
  name: string
  count?: number
  [key: string]: unknown
}

export function transformTag(raw: RawHappyFoxTag): Tag {
  return {
    id: raw.name,
    externalId: raw.name,
    name: pickStr(raw.name) ?? '',
    platform: 'happyfox',
    metadata: strMap({ count: raw.count }),
    raw,
  }
}
