/**
 * Transform Octadesk tag to canonical Tag.
 *
 * Octadesk tags are returned by GET /tickets/tags.
 * The tag resource is a plain string label (no separate ID).
 * Fields: name (acts as both id and name)
 */
import type { Tag } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawOctadeskTag {
  /** Tag label — acts as the unique identifier */
  name: string
  [key: string]: unknown
}

export function transformTag(raw: RawOctadeskTag): Tag {
  return {
    id: String(raw.name),
    externalId: String(raw.name),
    name: pickStr(raw.name) ?? '',
    platform: 'octadesk',
    metadata: strMap({}),
    raw,
  }
}
