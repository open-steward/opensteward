import type { Tag } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawLiveChatTag {
  name: string
  count?: number
  [key: string]: unknown
}

export function transformTag(raw: RawLiveChatTag): Tag {
  return {
    id: raw.name,
    externalId: raw.name,
    name: pickStr(raw.name) ?? '',
    platform: 'livechat',
    metadata: strMap({ count: raw.count }),
    raw,
  }
}
