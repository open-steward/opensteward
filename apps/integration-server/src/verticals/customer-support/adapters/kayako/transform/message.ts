/**
 * Kayako case post → canonical Message transform.
 *
 * Posts are retrieved from GET /api/v1/cases/:id/posts.json.
 * The `contents` field holds the message body (HTML stripped to plain text
 * in the `contents` field itself — Kayako returns the body as a string).
 * The `creator` nested object carries the author info.
 * Internal notes are at GET /api/v1/cases/:id/notes.json and use body_text.
 */
import type { Message, MessageType, AuthorType } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface KayakoCreatorRef {
  id?: number
  resource_type?: string
  [key: string]: unknown
}

/** A post (reply) on a Kayako case */
export interface RawKayakoPost {
  id: number
  contents?: string
  creator?: KayakoCreatorRef | null
  is_requester?: boolean
  attachments?: Array<{ id?: number; name?: string }>
  created_at?: string
  updated_at?: string
  resource_type?: string
  [key: string]: unknown
}

/** A note (internal) on a Kayako case */
export interface RawKayakoNote {
  id: number
  body_text?: string
  body_html?: string
  user?: KayakoCreatorRef | null
  attachments?: Array<{ id?: number; name?: string }>
  created_at?: string
  updated_at?: string
  resource_type?: string
  [key: string]: unknown
}

export type RawKayakoMessage = RawKayakoPost | RawKayakoNote

function isNote(raw: RawKayakoMessage): raw is RawKayakoNote {
  return (raw as RawKayakoNote).body_text !== undefined || (raw as RawKayakoMessage).resource_type === 'note'
}

export function transformMessage(raw: RawKayakoMessage, caseId: string): Message {
  const type: MessageType = isNote(raw) ? 'internal' : 'public'
  const note = raw as RawKayakoNote
  const post = raw as RawKayakoPost
  const authorRef = isNote(raw) ? note.user : post.creator
  const authorId = authorRef?.id ? String(authorRef.id) : ''
  const authorType: AuthorType = post.is_requester ? 'contact' : 'user'
  const body = isNote(raw)
    ? (pickStr(note.body_text) ?? '')
    : (pickStr(post.contents) ?? '')

  return {
    id: String(raw.id),
    externalId: String(raw.id),
    ticketId: caseId,
    authorId,
    authorType,
    body,
    type,
    attachmentCount: (raw.attachments ?? []).length || undefined,
    createdAt: toIso(raw.created_at) ?? new Date(0).toISOString(),
    platform: 'kayako',
    metadata: strMap({ resourceType: raw.resource_type }),
    raw,
  }
}
