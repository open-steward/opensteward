import type { Tag } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawReamazeTag {
  name: string
  count?: number
  [key: string]: unknown
}

export function transformTag(raw: RawReamazeTag): Tag {
  return {
    id: raw.name,
    externalId: raw.name,
    name: pickStr(raw.name) ?? '',
    platform: 'reamaze',
    metadata: strMap({ count: raw.count }),
    raw,
  }
}
