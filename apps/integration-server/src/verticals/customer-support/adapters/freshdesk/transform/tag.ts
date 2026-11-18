import type { Tag } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawFreshdeskTag {
  name: string
  count?: number
  [key: string]: unknown
}

export function transformTag(raw: RawFreshdeskTag): Tag {
  return {
    id: raw.name,
    externalId: raw.name,
    name: pickStr(raw.name) ?? '',
    platform: 'freshdesk',
    metadata: strMap({ count: raw.count }),
    raw,
  }
}
