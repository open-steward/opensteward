import type { Tag } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawCrispTag {
  name: string
  count?: number
  [key: string]: unknown
}

export function transformTag(raw: RawCrispTag): Tag {
  return {
    id: raw.name,
    externalId: raw.name,
    name: pickStr(raw.name) ?? '',
    platform: 'crisp',
    metadata: strMap({ count: raw.count }),
    raw,
  }
}
