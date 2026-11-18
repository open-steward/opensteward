/**
 * Pylon Tag → canonical Tag transform.
 *
 * Tag object fields: id, value (the label), hex_color, object_type.
 */
import type { Tag } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawPylonTag {
  id: string
  value?: string
  hex_color?: string | null
  object_type?: string
  [key: string]: unknown
}

export function transformTag(raw: RawPylonTag): Tag {
  // Pylon stores the display label in 'value'; id is the UUID
  const name = pickStr(raw.value) ?? pickStr(raw.id) ?? ''
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    name,
    platform: 'gorgias-aircall',
    metadata: strMap({
      hexColor: raw.hex_color,
      objectType: raw.object_type,
    }),
    raw,
  }
}
