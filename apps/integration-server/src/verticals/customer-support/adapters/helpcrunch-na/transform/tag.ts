/**
 * InvGate Service Management — category (tag) transform.
 *
 * InvGate does not have free-form tags; the closest concept is categories.
 * We surface categories as canonical Tags.
 *
 * Category fields from /categories endpoint:
 *   id, name, parent_category_id
 */
import type { Tag } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawInvGateCategory {
  id: number
  name?: string | null
  parent_category_id?: number | null
  [key: string]: unknown
}

export function transformTag(raw: RawInvGateCategory): Tag {
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    name: pickStr(raw.name) ?? '',
    platform: 'helpcrunch-na',
    metadata: strMap({
      parentCategoryId: raw.parent_category_id,
    }),
    raw,
  }
}
