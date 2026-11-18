/**
 * Maps a Zenvia Customer Cloud interaction output / message to the canonical
 * Message schema.
 *
 * Zenvia surfaces per-interaction messages inside the `output` object of an
 * interaction (comment, reminder, message).  For listing per-ticket messages we
 * use GET /prospect/{id}/interactions and treat each interaction-output as a
 * message entry.  The interaction itself doubles as both a ticket and the
 * primary message container, so we synthesise a stable id from the interaction
 * id and output type.
 *
 * API: GET /prospect/{prospectId}/interactions
 * Docs: https://sales.zenvia.com/#tag/Interactions
 */
import type { Message, MessageType, AuthorType } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface RawZenviaMessage {
  id: string
  interactionId?: string | null
  prospectId?: string | null
  agentId?: string | null
  via?: string | null
  direction?: string | null    // inbound | outbound
  content?: string | null
  type?: string | null         // text | file | note | …
  isInternal?: boolean
  createdAt?: string | null
  [key: string]: unknown
}

function mapType(raw: RawZenviaMessage): MessageType {
  if (raw.isInternal) return 'internal'
  if (raw.type === 'note') return 'internal'
  return 'public'
}

function mapAuthorType(raw: RawZenviaMessage): AuthorType {
  // direction 'inbound' = contact/prospect-sent; 'outbound' = agent-sent (user)
  if (raw.direction === 'inbound') return 'contact'
  return 'user'
}

export function transformMessage(raw: RawZenviaMessage, ticketId: string): Message {
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    ticketId,
    authorId: pickStr(raw.agentId) ?? pickStr(raw.prospectId) ?? '',
    authorType: mapAuthorType(raw),
    body: pickStr(raw.content) ?? '',
    type: mapType(raw),
    createdAt: toIso(raw.createdAt) ?? new Date(0).toISOString(),
    platform: 'zenvia',
    metadata: strMap({ via: raw.via, direction: raw.direction, rawType: raw.type }),
    raw,
  }
}
