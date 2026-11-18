/**
 * Tiledesk message transform.
 *
 * Messages are retrieved via GET /v3/:project_id/requests/:request_id/messages
 * The `recipient` field on the raw message is the request_id (ticket ID).
 * `sender` is the userId; `senderFullname` is the display name.
 * `type` is "text" or "image" — we map internal notes via attributes.subtype.
 */
import type { Message, MessageType, AuthorType } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface RawTiledeskMessage {
  _id?: string
  id?: string
  sender?: string
  senderFullname?: string
  recipient?: string
  text?: string
  type?: string
  status?: number
  attributes?: {
    subtype?: string
    attachment?: { type?: string }
    [key: string]: unknown
  } | null
  metadata?: {
    src?: string
    width?: number
    height?: number
    [key: string]: unknown
  } | null
  createdAt?: string
  updatedAt?: string
  id_project?: string
  createdBy?: string
  [key: string]: unknown
}

function mapMessageType(raw: RawTiledeskMessage): MessageType {
  // Internal notes are signalled by attributes.subtype === 'info' or similar
  const subtype = raw.attributes?.subtype
  if (subtype === 'info' || subtype === 'private') return 'internal'
  return 'public'
}

function mapAuthorType(raw: RawTiledeskMessage): AuthorType {
  // Tiledesk uses sender IDs; bot senders often start with 'bot_'
  const sender = raw.sender ?? ''
  if (sender.startsWith('bot_')) return 'system'
  // If the subtype marks it as a system event
  if (raw.attributes?.subtype === 'info') return 'system'
  return 'user'
}

export function transformMessage(raw: RawTiledeskMessage, ticketId: string): Message {
  const id = pickStr(raw._id) ?? pickStr(raw.id) ?? ''
  const hasAttachment = raw.type === 'image' || raw.metadata?.src != null
  return {
    id,
    externalId: id,
    ticketId: pickStr(raw.recipient) ?? ticketId,
    authorId: pickStr(raw.sender) ?? '',
    authorType: mapAuthorType(raw),
    body: pickStr(raw.text) ?? '',
    type: mapMessageType(raw),
    attachmentCount: hasAttachment ? 1 : undefined,
    createdAt: toIso(raw.createdAt) ?? new Date(0).toISOString(),
    platform: 'tiledesk',
    metadata: strMap({
      senderFullname: raw.senderFullname,
      rawType: raw.type,
    }),
    raw,
  }
}
