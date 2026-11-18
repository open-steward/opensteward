import type { Tag } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawDriftTag {
  name: string
  count?: number
  [key: string]: unknown
}

export function transformTag(raw: RawDriftTag): Tag {
  return {
    id: raw.name,
    externalId: raw.name,
    name: pickStr(raw.name) ?? '',
    platform: 'drift',
    metadata: strMap({ count: raw.count }),
    raw,
  }
}
