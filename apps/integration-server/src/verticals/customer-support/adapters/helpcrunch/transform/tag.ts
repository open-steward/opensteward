import type { Tag } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawHelpCrunchTag {
  name: string
  count?: number
  [key: string]: unknown
}

export function transformTag(raw: RawHelpCrunchTag): Tag {
  return {
    id: raw.name,
    externalId: raw.name,
    name: pickStr(raw.name) ?? '',
    platform: 'helpcrunch',
    metadata: strMap({ count: raw.count }),
    raw,
  }
}
