/**
 * UseDesk tag transform.
 *
 * Tags come from POST /uapi/tags (https://api.usedocs.com/article/51382),
 * whose "Server response parameters" are: ticket_tag_id — "Tag ID";
 * tag_company_id — "Company ID"; name — "Tag value"; ticket_count — "Number
 * of tickets with the matching tag".
 *
 * The canonical id is the tag VALUE: a ticket carries its tags only as
 * `tags: [{ name }]` (article 51376: "tags Array of tags name — tag name"),
 * so the value is the only key a ticket's tagIds can reference. The numeric
 * ticket_tag_id is kept as externalId.
 */
import type { Tag } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawUsedeskTag {
  ticket_tag_id?: number | string
  tag_company_id?: number | string
  name?: string
  ticket_count?: number | string
  [key: string]: unknown
}

export function transformTag(raw: RawUsedeskTag): Tag {
  const name = pickStr(raw.name)
  if (!name) throw new Error(`UseDesk tag ${String(raw.ticket_tag_id)} has no name`)
  if (raw.ticket_tag_id == null || raw.ticket_tag_id === '') {
    throw new Error(`UseDesk tag "${name}" has no ticket_tag_id`)
  }
  return {
    id: name,
    externalId: String(raw.ticket_tag_id),
    name,
    platform: 'usedesk',
    metadata: strMap({ ticketCount: raw.ticket_count, companyId: raw.tag_company_id }),
    raw,
  }
}
