import type { Tag } from '../../../schema'
import { strMap } from './shared'

/**
 * A tag as documented by GET /v1/tags
 * (https://developer.richpanel.com/reference/list-tags): `id`, `updated_at`,
 * `organization_id`, `created_at`, `description`, `name`. Tickets reference tags by
 * `id` ("Always use tag IDs (not names) when adding tags via API").
 */
export interface RawRichpanelTag {
  id: string
  name: string
  description?: string
  organization_id?: string
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

export function transformTag(raw: RawRichpanelTag): Tag {
  if (typeof raw.id !== 'string' || raw.id === '') throw new Error('Richpanel tag has no id')
  if (typeof raw.name !== 'string') throw new Error(`Richpanel tag ${raw.id} has no name`)
  return {
    id: raw.id,
    externalId: raw.id,
    name: raw.name,
    platform: 'richpanel',
    metadata: strMap({
      description: raw.description,
      organization_id: raw.organization_id,
      created_at: raw.created_at,
      updated_at: raw.updated_at,
    }),
    raw,
  }
}
