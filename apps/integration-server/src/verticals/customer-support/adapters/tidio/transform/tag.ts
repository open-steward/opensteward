import type { Tag } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawTidioTag {
  name: string
  count?: number
  [key: string]: unknown
}

export function transformTag(raw: RawTidioTag): Tag {
  return {
    id: raw.name,
    externalId: raw.name,
    name: pickStr(raw.name) ?? '',
    platform: 'tidio',
    metadata: strMap({ count: raw.count }),
    raw,
  }
}
