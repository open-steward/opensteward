import type { Message, MessageType, AuthorType } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'
import { chaportTicketId } from './ticket'

/**
 * Raw Chaport chat event (message) returned by:
 *   GET /visitors/:visitorId/chats/:chatId/events
 *   GET /visitors/:visitorId/chats/:chatId/events/:eventId
 *
 * Chaport uses a polymorphic `type` discriminator. Only message types carry text.
 */
export interface RawChaportChatEvent {
  /** Event type — e.g. 'visitor-message', 'operator-message', 'system-message' */
  type: string
  timestamp?: string
  params?: {
    text?: string
    operatorId?: string
    externalId?: string
    [key: string]: unknown
  }
  [key: string]: unknown
}

function mapType(eventType: string): MessageType {
  // Internal/system events are not public replies
  if (eventType === 'system-message') return 'internal'
  return 'public'
}

function mapAuthorType(eventType: string): AuthorType {
  if (eventType === 'visitor-message') return 'contact'
  if (eventType === 'operator-message') return 'user'
  return 'system'
}

/**
 * Chaport events don't carry a standalone id field at the event level
 * in documented form; compose one from chatId + timestamp.
 */
function eventId(visitorId: string, chatId: string, event: RawChaportChatEvent, index: number): string {
  const ts = event.timestamp ?? String(index)
  return `${visitorId}:${chatId}:${ts}`
}

export function transformMessage(
  raw: RawChaportChatEvent,
  visitorId: string,
  chatId: string,
  index: number,
): Message {
  const id = eventId(visitorId, chatId, raw, index)
  const ticketId = chaportTicketId(visitorId, chatId)
  const authorType = mapAuthorType(raw.type)
  const authorId = authorType === 'user'
    ? pickStr(raw.params?.operatorId) ?? ''
    : visitorId
  return {
    id,
    externalId: pickStr(raw.params?.externalId) ?? id,
    ticketId,
    authorId,
    authorType,
    body: pickStr(raw.params?.text) ?? '',
    type: mapType(raw.type),
    createdAt: toIso(raw.timestamp) ?? new Date(0).toISOString(),
    platform: 'chaport',
    metadata: strMap({ eventType: raw.type }),
    raw,
  }
}
