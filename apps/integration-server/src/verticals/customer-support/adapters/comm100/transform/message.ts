/**
 * Comm100 ticket messages → canonical Messages.
 *
 * https://developer.comm100.com/docs/server-api-ticketing-message, Message
 * JSON Format: id (guid), ticketId, sentById, sentByType ("Allowed values are
 * "contact", "visitor", "chatbot", "channelAccount", "system", "agent"."),
 * time ("Time when the message was created."), type (content type: "text",
 * "html", ...), channelId ("Name of the message channel."), body,
 * attachments.
 *
 * Internal notes are a separate resource (ticketing/notes,
 * https://developer.comm100.com/docs/server-api-ticketing-note), so every
 * row of GET ticketing/tickets/{id}/messages is a public message.
 */
import type { Message, AuthorType } from '../../../schema'
import { decodeBody, pickStr, required, strMap, toIso } from './shared'

export interface RawComm100Message {
  id?: string
  ticketId?: string | number
  sentById?: string
  sentByType?: string
  time?: string
  type?: string
  channelId?: string
  body?: string
  attachments?: unknown[] | null
  [key: string]: unknown
}

function authorType(sentByType: string | undefined): AuthorType {
  switch (sentByType) {
    case 'contact':
    case 'visitor':
      return 'contact'
    case 'agent':
      return 'user'
    case 'chatbot':
    case 'system':
      return 'system'
    default:
      return 'unknown'
  }
}

export function transformMessage(raw: RawComm100Message, ticketId: string): Message {
  const id = required(pickStr(raw.id), 'message id')
  return {
    id,
    externalId: id,
    ticketId,
    authorId: required(pickStr(raw.sentById), `message ${id} sentById`),
    authorType: authorType(raw.sentByType),
    body: decodeBody(raw.body) ?? '',
    type: 'public',
    attachmentCount: Array.isArray(raw.attachments) ? raw.attachments.length : undefined,
    createdAt: required(toIso(raw.time), `message ${id} time`),
    platform: 'comm100',
    metadata: strMap({
      sentByType: raw.sentByType,
      contentType: raw.type,
      channelId: raw.channelId,
    }),
    raw,
  }
}
