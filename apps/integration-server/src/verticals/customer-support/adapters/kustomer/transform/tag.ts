import type { Tag } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawKustomerTag {
  name: string
  count?: number
  [key: string]: unknown
}

export function transformTag(raw: RawKustomerTag): Tag {
  return {
    id: raw.name,
    externalId: raw.name,
    name: pickStr(raw.name) ?? '',
    platform: 'kustomer',
    metadata: strMap({ count: raw.count }),
    raw,
  }
}
