/**
 * Help Scout thread → canonical Message.
 *
 * Fields from the List Threads response docs:
 * https://developer.helpscout.com/mailbox-api/endpoints/conversations/threads/list/
 */
import type { Message, MessageType, AuthorType } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface RawHelpScoutThread {
  id: number
  /** "beaconchat chat customer forwardchild forwardparent lineitem message note phone" */
  type?: string
  status?: string
  state?: string
  body?: string
  source?: { type?: string; via?: string }
  /** "The type property will specify whether it was created by a user or a customer." */
  createdBy?: { id?: number; type?: string } | null
  createdAt?: string
  _embedded?: { attachments?: unknown[] }
  [key: string]: unknown
}

/**
 * A note is internal. Threads that carry a message between the customer and
 * the team are public. `lineitem` ("a change of state on the conversation"),
 * `phone`, and the forward pair have no clear public/internal reading.
 */
function mapType(t: string | undefined): MessageType {
  switch (t) {
    case 'note':
      return 'internal'
    case 'customer':
    case 'message':
    case 'chat':
    case 'beaconchat':
      return 'public'
    default:
      return 'unknown'
  }
}

function mapAuthorType(t: string | undefined): AuthorType {
  if (t === 'customer') return 'contact'
  if (t === 'user') return 'user'
  return 'unknown'
}

export function transformMessage(raw: RawHelpScoutThread, ticketId: string): Message {
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    ticketId,
    authorId: raw.createdBy?.id != null ? String(raw.createdBy.id) : '',
    authorType: mapAuthorType(raw.createdBy?.type),
    body: pickStr(raw.body) ?? '',
    type: mapType(raw.type),
    attachmentCount: Array.isArray(raw._embedded?.attachments)
      ? raw._embedded.attachments.length
      : undefined,
    createdAt: toIso(raw.createdAt) ?? new Date(0).toISOString(),
    platform: 'helpscout',
    metadata: strMap({
      threadType: raw.type,
      status: raw.status,
      state: raw.state,
      sourceType: raw.source?.type,
      sourceVia: raw.source?.via,
    }),
    raw,
  }
}
