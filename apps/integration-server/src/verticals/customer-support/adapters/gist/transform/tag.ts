import type { Tag } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawGistTag {
  name: string
  count?: number
  [key: string]: unknown
}

export function transformTag(raw: RawGistTag): Tag {
  return {
    id: raw.name,
    externalId: raw.name,
    name: pickStr(raw.name) ?? '',
    platform: 'gist',
    metadata: strMap({ count: raw.count }),
    raw,
  }
}
