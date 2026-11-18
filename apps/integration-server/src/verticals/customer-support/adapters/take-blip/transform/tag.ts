/**
 * Transform a raw Take Blip active tag to the canonical Tag schema.
 *
 * Active tags are returned from GET /tags/active via
 * postmaster@desk.msging.net (docs.blip.ai, "Get tags"). The documented item
 * (itemType application/vnd.iris.desk.tag-tickets-summary+json) is:
 *
 *   { "name": "tag1", "closedTickets": 0, "ticketsCount": 0 }
 *
 * A tag has no id of its own: tickets carry tags by name (the "tags" array of
 * "Close a ticket"), so the name is the id. No color is documented.
 *
 * Docs: https://docs.blip.ai/#get-tags
 */
import type { Tag } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawTakeBlipTag {
  name?: string
  closedTickets?: number
  ticketsCount?: number
  [key: string]: unknown
}

export function transformTag(raw: RawTakeBlipTag): Tag {
  const name = pickStr(raw.name)
  if (!name) throw new Error('TakeBlip tag has no name')

  return {
    id: name,
    externalId: name,
    name,
    platform: 'take-blip',
    metadata: strMap({
      closedTickets: raw.closedTickets,
      ticketsCount: raw.ticketsCount,
    }),
    raw,
  }
}
