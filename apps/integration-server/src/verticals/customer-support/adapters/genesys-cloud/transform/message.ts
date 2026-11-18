/**
 * Transform a Genesys Cloud chat/message item to the canonical Message schema.
 *
 * Genesys Cloud exposes chat conversation messages via:
 *   GET /api/v2/conversations/chats/{conversationId}/messages
 *
 * Each message item has an id, body, bodyType (standard/notice), timestamp,
 * sender (with id and displayName), and a selfUri.
 */
import type { Message, MessageType, AuthorType } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface RawGenesysChatMessageSender {
  id?: string
  displayName?: string
  purpose?: string
  [key: string]: unknown
}

export interface RawGenesysChatMessage {
  id?: string
  /** Message body text */
  body?: string
  /** 'standard' = public; 'notice' = system/internal */
  bodyType?: string
  /** ISO-8601 timestamp */
  timestamp?: string
  sender?: RawGenesysChatMessageSender
  /** Count of attachments in the message */
  attachmentCount?: number
  [key: string]: unknown
}

export function transformMessage(raw: RawGenesysChatMessage, ticketId: string): Message {
  const id = pickStr(raw.id) ?? ''
  const bodyType = (raw.bodyType ?? 'standard').toLowerCase()
  // 'notice' messages are system-generated; everything else is public
  const type: MessageType = bodyType === 'notice' ? 'internal' : 'public'
  const purpose = (raw.sender?.purpose ?? '').toLowerCase()
  let authorType: AuthorType
  if (purpose === 'customer' || purpose === 'external') {
    authorType = 'contact'
  } else if (purpose === 'agent' || purpose === 'internal' || purpose === 'user') {
    authorType = 'user'
  } else if (bodyType === 'notice' || purpose === 'system' || purpose === 'workflow' || purpose === 'ivr' || purpose === 'acd' || purpose === 'voicemail') {
    authorType = 'system'
  } else {
    authorType = 'user'
  }

  return {
    id,
    externalId: id,
    ticketId,
    authorId: pickStr(raw.sender?.id) ?? '',
    authorType,
    body: pickStr(raw.body) ?? '',
    type,
    attachmentCount: raw.attachmentCount,
    createdAt: toIso(raw.timestamp) ?? new Date(0).toISOString(),
    platform: 'genesys-cloud',
    metadata: strMap({
      bodyType: raw.bodyType,
      senderDisplayName: raw.sender?.displayName,
      senderPurpose: raw.sender?.purpose,
    }),
    raw,
  }
}
