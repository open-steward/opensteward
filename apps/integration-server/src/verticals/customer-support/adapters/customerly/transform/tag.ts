import type { Tag } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawCustomerlyTag {
  name: string
  count?: number
  [key: string]: unknown
}

export function transformTag(raw: RawCustomerlyTag): Tag {
  return {
    id: raw.name,
    externalId: raw.name,
    name: pickStr(raw.name) ?? '',
    platform: 'customerly',
    metadata: strMap({ count: raw.count }),
    raw,
  }
}
