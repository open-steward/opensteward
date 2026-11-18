/**
 * Transform a HelpDesk (by LiveChat) ticket event to canonical Message.
 *
 * HelpDesk has no messages endpoint. A ticket's messages are the entries of
 * its `events` array (GET /v1/tickets/{ticketID}, TicketResult: "events" —
 * "Ticket events") whose `type` is `message` or `followUpSent`, the two
 * TicketEvent variants that carry a `message` object ({ isPrivate, text,
 * richTextHtml, richTextObj, ... }). Every event carries the TicketEventBase
 * fields `ID`, `source`, `author` and `date`.
 *
 * `author` is one of four documented shapes: { type: "agent", ID, name },
 * { type: "rule", ID, name }, { type: "system", ID } and
 * { type: "client", name }. The client variant has no ID in the docs, so a
 * client-authored message has an empty authorId (the reference adapter's
 * shape for an absent author id) and the client's name in metadata.
 *
 * The canonical Message.id is "{ticketID}:{eventID}" so getMessage can find
 * the ticket that holds the event. Use splitCompositeId() to decode.
 *
 * Attachments are separate `attachments` events, so attachmentCount is not set.
 *
 * Docs: https://api.helpdesk.com/docs#tag/Tickets/operation/ticketRead
 */
import type { Message, MessageType, AuthorType } from '../../../schema'
import { strMap, toIso } from './shared'

/** The TicketEvent `type` values that carry a `message` object. */
export const MESSAGE_EVENT_TYPES = ['message', 'followUpSent'] as const

export interface RawHelpdeskTicketEvent {
  ID?: string | null
  type?: string | null
  date?: string | null
  author?: {
    type?: string | null
    ID?: string | null
    name?: string | null
  } | null
  source?: { type?: string | null } | null
  message?: {
    isPrivate?: boolean | null
    text?: string | null
    richTextHtml?: string | null
    richTextObj?: unknown[] | null
  } | null
  [key: string]: unknown
}

/**
 * Split a composite "ticketId:eventId" id produced by transformMessage.
 * Returns [ticketId, eventId]; ticketId is '' when the separator is absent.
 */
export function splitCompositeId(compositeId: string): [string, string] {
  const sep = compositeId.indexOf(':')
  if (sep === -1) return ['', compositeId]
  return [compositeId.slice(0, sep), compositeId.slice(sep + 1)]
}

export function isMessageEvent(raw: RawHelpdeskTicketEvent): boolean {
  return (MESSAGE_EVENT_TYPES as readonly string[]).includes(String(raw.type))
}

function mapAuthorType(type: string | null | undefined): AuthorType {
  switch (type) {
    case 'agent':
      return 'user'
    case 'client':
      return 'contact'
    case 'system':
    case 'rule':
      return 'system'
    default:
      return 'unknown'
  }
}

function mapMessageType(isPrivate: boolean | null | undefined): MessageType {
  if (isPrivate === true) return 'internal'
  if (isPrivate === false) return 'public'
  return 'unknown'
}

export function transformMessage(raw: RawHelpdeskTicketEvent, ticketId: string): Message {
  if (!raw.ID) throw new Error(`HelpDesk ticket ${ticketId}: message event has no ID`)
  const createdAt = toIso(raw.date)
  if (!createdAt)
    throw new Error(`HelpDesk ticket ${ticketId}: message event ${raw.ID} has no date`)
  const author = raw.author ?? undefined
  return {
    id: `${ticketId}:${raw.ID}`,
    externalId: raw.ID,
    ticketId,
    // The documented client author has only a name; agent, rule and system authors have an ID.
    authorId: author?.type === 'client' ? '' : (author?.ID ?? ''),
    authorType: mapAuthorType(author?.type),
    body: raw.message?.text ?? '',
    type: mapMessageType(raw.message?.isPrivate),
    createdAt,
    platform: 'hellotars-support',
    metadata: strMap({
      eventType: raw.type,
      authorType: author?.type,
      authorName: author?.name,
      sourceType: raw.source?.type,
    }),
    raw,
  }
}
