import type { Tag } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawZendeskTag {
  name: string
  count?: number
  [key: string]: unknown
}

export function transformTag(raw: RawZendeskTag): Tag {
  return {
    id: raw.name,
    externalId: raw.name,
    name: pickStr(raw.name) ?? '',
    platform: 'zendesk',
    metadata: strMap({ count: raw.count }),
    raw,
  }
}
