import type { Tag } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawChatwootTag {
  name: string
  count?: number
  [key: string]: unknown
}

export function transformTag(raw: RawChatwootTag): Tag {
  return {
    id: raw.name,
    externalId: raw.name,
    name: pickStr(raw.name) ?? '',
    platform: 'chatwoot',
    metadata: strMap({ count: raw.count }),
    raw,
  }
}
