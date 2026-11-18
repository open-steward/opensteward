/**
 * UVdesk tag transform.
 *
 * UVdesk tag wire shape (GET /{locale}/api/tags.json list items):
 *   id, name
 *
 * Tags have numeric IDs (unlike some other platforms that use name as ID).
 */
import type { Tag } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawUvdeskTag {
  id?: number | string
  name?: string
  [key: string]: unknown
}

export function transformTag(raw: RawUvdeskTag): Tag {
  const id = raw.id != null ? String(raw.id) : (pickStr(raw.name) ?? '')
  return {
    id,
    externalId: id,
    name: pickStr(raw.name) ?? '',
    platform: 'uvdesk',
    metadata: strMap({}),
    raw,
  }
}
