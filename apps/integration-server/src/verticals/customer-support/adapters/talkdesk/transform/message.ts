/**
 * Talkdesk Case Note → canonical Message transform.
 *
 * Talkdesk Case Notes API field reference:
 *   id           — UUID string
 *   note_title   — string | null
 *   note_body    — string | null (plain text)
 *   public       — boolean (false = internal note)
 *   author_id    — UUID string (agent who wrote the note)
 *   created_at   — ISO-8601 string
 *   updated_at   — ISO-8601 string
 */
import type { Message, MessageType, AuthorType } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface RawTalkdeskCaseNote {
  id: string
  note_title?: string | null
  note_body?: string | null
  public?: boolean | null
  author_id?: string | null
  created_at?: string | null
  updated_at?: string | null
  [key: string]: unknown
}

export function transformMessage(raw: RawTalkdeskCaseNote, ticketId: string): Message {
  const type: MessageType = raw.public === false ? 'internal' : 'public'
  const authorType: AuthorType = 'agent'
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    ticketId,
    authorId: pickStr(raw.author_id) ?? '',
    authorType,
    body: pickStr(raw.note_body) ?? '',
    type,
    createdAt: toIso(raw.created_at) ?? new Date(0).toISOString(),
    platform: 'talkdesk',
    metadata: strMap({ noteTitle: raw.note_title }),
    raw,
  }
}
