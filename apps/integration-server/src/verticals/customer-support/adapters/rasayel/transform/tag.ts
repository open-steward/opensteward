/**
 * Transform a Rasayel Tag into the canonical Tag shape.
 *
 * Rasayel Tag fields (GraphQL):
 *   id (Int!), uuid (String!), tagName (String!), tagColor (String!),
 *   tagDescription (String), isSmart (Boolean!), createdAt (Int!), updatedAt (Int)
 */
import type { Tag } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawRasayelTag {
  id: number
  uuid?: string
  tagName?: string
  tagColor?: string
  tagDescription?: string | null
  isSmart?: boolean
  [key: string]: unknown
}

export function transformTag(raw: RawRasayelTag): Tag {
  return {
    id: String(raw.id),
    externalId: raw.uuid ?? String(raw.id),
    name: pickStr(raw.tagName) ?? '',
    color: pickStr(raw.tagColor),
    platform: 'rasayel',
    metadata: strMap({ uuid: raw.uuid, tagColor: raw.tagColor, tagDescription: raw.tagDescription }),
    raw,
  }
}
