import type { Tag } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawGorgiasTag {
  name: string
  count?: number
  [key: string]: unknown
}

export function transformTag(raw: RawGorgiasTag): Tag {
  return {
    id: raw.name,
    externalId: raw.name,
    name: pickStr(raw.name) ?? '',
    platform: 'gorgias',
    metadata: strMap({ count: raw.count }),
    raw,
  }
}
