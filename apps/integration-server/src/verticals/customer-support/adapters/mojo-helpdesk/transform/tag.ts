import type { Tag } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawMojoHelpdeskTag {
  name: string
  count?: number
  [key: string]: unknown
}

export function transformTag(raw: RawMojoHelpdeskTag): Tag {
  return {
    id: raw.name,
    externalId: raw.name,
    name: pickStr(raw.name) ?? '',
    platform: 'mojo-helpdesk',
    metadata: strMap({ count: raw.count }),
    raw,
  }
}
