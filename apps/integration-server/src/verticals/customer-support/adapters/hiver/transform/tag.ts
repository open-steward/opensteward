import type { Tag } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawHiverTag {
  name: string
  count?: number
  [key: string]: unknown
}

export function transformTag(raw: RawHiverTag): Tag {
  return {
    id: raw.name,
    externalId: raw.name,
    name: pickStr(raw.name) ?? '',
    platform: 'hiver',
    metadata: strMap({ count: raw.count }),
    raw,
  }
}
