/**
 * HubSpot Service Hub conversations message transform.
 *
 * Rows come from `GET /conversations/v3/conversations/threads/{threadId}/messages`,
 * whose results are `oneOf` PublicConversationsMessage (`type: MESSAGE`),
 * PublicComment (`COMMENT`), PublicWelcomeMessage (`WELCOME_MESSAGE`),
 * PublicAssignmentMessage (`ASSIGNMENT`), PublicThreadStatusChange
 * (`THREAD_STATUS_CHANGE`) and PublicThreadInboxChange (`THREAD_INBOX_CHANGE`)
 * (Conversations v3 spec, api.hubspot.com/public/api/spec/v2/specs/release/22196/version/3).
 *
 * Only the first three carry `text` (required on each), so only they are
 * messages in the canonical sense; the other three are thread events with no
 * body and are dropped by {@link isBodyMessage}.
 *
 * Author: `createdBy` is required on every type and holds an actor id. The
 * guide (developers.hubspot.com/docs/api-reference/legacy/conversations/guide,
 * "Get actors"): "All actor IDs are a single letter representing the actor
 * type, followed by a hyphen" — `A-` "Agent actor, i.e. a user in the
 * account", `V-` "Visitor actor", `S-` "System actor". `I-` (integration),
 * `L-` (customer agent) and `E-` (unresolved email address) have no canonical
 * counterpart and map to 'unknown'.
 *
 * Visibility: "Comments only appear in the inbox and are not sent to
 * visitors", so COMMENT is internal; MESSAGE and WELCOME_MESSAGE are public.
 */
import type { Message, MessageType, AuthorType } from '../../../schema'
import { strMap, toIso } from './shared'

export interface RawHubspotMessageSender {
  actorId?: string
  name?: string
  deliveryIdentifier?: { type?: string; value?: string }
  senderField?: string
}

export interface RawHubspotMessageAttachment {
  /** 'FILE' | 'LOCATION' | 'CONTACT' | 'MESSAGE_HEADER' | 'QUICK_REPLIES' | … */
  type?: string
  [key: string]: unknown
}

export interface RawHubspotMessage {
  id: string
  conversationsThreadId?: string
  createdAt: string
  updatedAt?: string
  createdBy: string
  /** MESSAGE | COMMENT | WELCOME_MESSAGE | ASSIGNMENT | THREAD_STATUS_CHANGE | THREAD_INBOX_CHANGE */
  type: string
  /** MESSAGE only: INCOMING | OUTGOING */
  direction?: string
  text?: string
  richText?: string
  senders?: RawHubspotMessageSender[]
  recipients?: unknown[]
  attachments?: RawHubspotMessageAttachment[]
  [key: string]: unknown
}

const BODY_TYPES = new Set(['MESSAGE', 'COMMENT', 'WELCOME_MESSAGE'])

/** True for the message types that carry a body (`text`). */
export function isBodyMessage(raw: RawHubspotMessage): boolean {
  return BODY_TYPES.has(raw.type)
}

function mapMessageType(type: string): MessageType {
  if (type === 'COMMENT') return 'internal'
  if (type === 'MESSAGE' || type === 'WELCOME_MESSAGE') return 'public'
  return 'unknown'
}

function mapAuthorType(actorId: string): AuthorType {
  if (actorId.startsWith('A-')) return 'user'
  if (actorId.startsWith('V-')) return 'contact'
  if (actorId.startsWith('S-')) return 'system'
  return 'unknown'
}

export function transformMessage(raw: RawHubspotMessage, ticketId: string): Message {
  const createdAt = toIso(raw.createdAt)
  if (!createdAt) {
    throw new Error(
      `HubSpot message ${raw.id} has no parseable createdAt: ${String(raw.createdAt)}`,
    )
  }
  // `text` is required on every type isBodyMessage admits.
  if (typeof raw.text !== 'string') {
    throw new Error(`HubSpot ${raw.type} ${raw.id} has no text`)
  }
  return {
    id: raw.id,
    externalId: raw.id,
    ticketId,
    authorId: raw.createdBy,
    authorType: mapAuthorType(raw.createdBy),
    body: raw.text,
    type: mapMessageType(raw.type),
    attachmentCount: Array.isArray(raw.attachments)
      ? raw.attachments.filter((a) => a.type === 'FILE').length
      : undefined,
    createdAt,
    platform: 'hubspot-service-hub',
    metadata: strMap({
      direction: raw.direction,
      messageType: raw.type,
      threadId: raw.conversationsThreadId,
    }),
    raw,
  }
}
