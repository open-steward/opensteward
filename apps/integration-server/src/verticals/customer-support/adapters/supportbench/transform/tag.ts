/**
 * Supportbench tag → canonical Tag transform.
 *
 * Supportbench tags are bare strings on case/contact/article records.
 * There is no dedicated tag list endpoint in the public API; tags are
 * collected from case and contact response `tags` arrays.
 * We treat the tag string itself as both id and name.
 */
import type { Tag } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawSupportbenchTag {
  name: string
  [key: string]: unknown
}

export function transformTag(raw: RawSupportbenchTag): Tag {
  return {
    id: raw.name,
    externalId: raw.name,
    name: pickStr(raw.name) ?? '',
    platform: 'supportbench',
    metadata: strMap({}),
    raw,
  }
}

/**
 * Convenience: build a RawSupportbenchTag from a bare tag string.
 */
export function tagFromString(name: string): RawSupportbenchTag {
  return { name }
}
