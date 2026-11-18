/**
 * Transform a raw tawk.to chat message into the canonical Message schema.
 *
 * tawk.to chat message fields (from webhook transcript payloads):
 *   n / id   — sender identifier (agent id, visitor id, or system)
 *   t        — sender type: "a" = agent, "v" = visitor, "s" = system
 *   msg      — message text content
 *   time     — ISO-8601 timestamp
 *   type     — message type (e.g. "msg", "file")
 *   files    — array of attachment objects
 */
import type { Message, AuthorType } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface RawTawkToMessage {
  /** sender id */
  n?: string
  id?: string | number
  /** sender type: "a"=agent, "v"=visitor, "s"=system */
  t?: string
  /** message text */
  msg?: string
  /** ISO-8601 timestamp */
  time?: string
  /** message sub-type, e.g. "msg" | "file" */
  type?: string
  /** file attachments */
  files?: Array<{ id?: string; name?: string }>
  [key: string]: unknown
}

function mapAuthorType(t: string | undefined): AuthorType {
  if (t === 'a') return 'agent'
  if (t === 'v') return 'user'
  return 'system'
}

/**
 * Derive a stable synthetic message ID from the parent ticketId, timestamp,
 * and position index. tawk.to chat messages have no dedicated message ID field
 * in the REST API — `n` is the sender ID and reusing it would produce
 * duplicates when the same agent sends multiple messages in a chat.
 */
function deriveMessageId(ticketId: string, time: string | undefined, idx: number): string {
  const ts = time ?? new Date(0).toISOString()
  return `${ticketId}:${ts}:${idx}`
}

export function transformMessage(raw: RawTawkToMessage, ticketId: string, idx = 0): Message {
  const id = deriveMessageId(ticketId, raw.time, idx)
  const authorId = pickStr(raw.n) ?? ''
  return {
    id,
    externalId: id,
    ticketId,
    authorId,
    authorType: mapAuthorType(raw.t),
    body: pickStr(raw.msg) ?? '',
    type: 'public',
    attachmentCount: raw.files?.length,
    createdAt: toIso(raw.time) ?? new Date(0).toISOString(),
    platform: 'tawk-to',
    metadata: strMap({ senderType: raw.t }),
    raw,
  }
}
