/**
 * Help Scout tag → canonical Tag.
 *
 * Fields from the List Tags / Get Tag response docs:
 * https://developer.helpscout.com/mailbox-api/endpoints/tags/list/
 * https://developer.helpscout.com/mailbox-api/endpoints/tags/get/
 */
import type { Tag } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawHelpScoutTag {
  id: number
  name?: string
  slug?: string
  /** "Deprecated. Legacy tag color hex value." */
  color?: string
  ticketCount?: number
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

export function transformTag(raw: RawHelpScoutTag): Tag {
  return {
    // The tag id, the same id a conversation's `tags[].id` carries.
    id: String(raw.id),
    externalId: String(raw.id),
    name: pickStr(raw.name) ?? '',
    color: pickStr(raw.color),
    platform: 'helpscout',
    metadata: strMap({
      slug: raw.slug,
      ticketCount: raw.ticketCount,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
    }),
    raw,
  }
}
