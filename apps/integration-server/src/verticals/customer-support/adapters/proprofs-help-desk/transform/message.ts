/**
 * Transform a raw ProProfs Help Desk message (reply) into the canonical Message shape.
 *
 * ProProfs embeds messages inside the ticket list/get response under the
 * `messages` array. Each item has:
 *   message_plain_text  — plain-text body
 *   created             — creation timestamp string
 *   from                — sender email address
 *   to                  — recipient email address
 *   reply_by            — identifier for which party replied ("customer" | "staff")
 *
 * There is no standalone message ID — we derive a stable surrogate from the
 * ticket ID + array index when no dedicated id field is present.
 */
import type { Message, MessageType, AuthorType } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface RawProprofsMessage {
  id?: string | number
  message_plain_text?: string
  created?: string
  from?: string
  to?: string
  reply_by?: string   // "customer" | "staff" | other
  [key: string]: unknown
}

function mapAuthorType(replyBy: string | undefined): AuthorType {
  const lower = (replyBy ?? '').toLowerCase()
  if (lower === 'staff' || lower === 'agent') return 'user'
  return 'contact'
}

function mapMessageType(_raw: RawProprofsMessage): MessageType {
  // ProProfs Help Desk does not expose an internal-note concept via the API;
  // all surfaced messages are public replies.
  return 'public'
}

export function transformMessage(raw: RawProprofsMessage, ticketId: string, index = 0): Message {
  const id = raw.id != null ? String(raw.id) : `${ticketId}:msg:${index}`
  const authorType = mapAuthorType(raw.reply_by)

  return {
    id,
    externalId:  id,
    ticketId,
    authorId:    pickStr(raw.from) ?? '',
    authorType,
    body:        pickStr(raw.message_plain_text) ?? '',
    type:        mapMessageType(raw),
    createdAt:   toIso(raw.created) ?? new Date(0).toISOString(),
    platform: 'proprofs-help-desk',
    metadata: strMap({
      from:    raw.from,
      to:      raw.to,
      replyBy: raw.reply_by,
    }),
    raw,
  }
}
