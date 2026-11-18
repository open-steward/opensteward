import type { Tag } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawTrengoTag {
  name: string
  count?: number
  [key: string]: unknown
}

export function transformTag(raw: RawTrengoTag): Tag {
  return {
    id: raw.name,
    externalId: raw.name,
    name: pickStr(raw.name) ?? '',
    platform: 'trengo',
    metadata: strMap({ count: raw.count }),
    raw,
  }
}
