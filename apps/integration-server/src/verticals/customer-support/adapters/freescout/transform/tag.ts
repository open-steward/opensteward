/**
 * FreeScout tag -> canonical Tag transform.
 *
 * The GET /api/tags endpoint returns an array of tag name strings
 * (not objects with ids).  We use the name as both id and value.
 */
import type { Tag } from '../../../schema'
import { pickStr, strMap } from './shared'

/** FreeScout tag — the API returns just a string name for each tag. */
export interface RawFreescoutTag {
  name: string
  [key: string]: unknown
}

export function transformTag(raw: RawFreescoutTag): Tag {
  return {
    id: raw.name,
    externalId: raw.name,
    name: pickStr(raw.name) ?? '',
    platform: 'freescout',
    metadata: strMap({}),
    raw,
  }
}
