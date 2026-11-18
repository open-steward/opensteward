import type { Comment } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

/**
 * Nifty message (GET /messages → `messages`). Messages are the comment
 * primitive across tasks, chats, docs and files; this adapter surfaces only
 * those attached to a task. `tagged` holds @-mentioned member ids; attachment
 * CONTENT is refused, so only the count is exposed.
 */
export interface RawNiftyMessage {
  id: string
  text?: string | null
  type?: string | null
  subtype?: string | null
  author?: string | null
  task?: string | null
  chat?: string | null
  thread?: string | null
  tagged?: string[] | null
  attachments?: unknown[] | null
  is_edited?: boolean
  is_deleted?: boolean
  created_at?: string | null
  updated_at?: string | null
  [key: string]: unknown
}

function mentionIds(raw: RawNiftyMessage): string[] {
  return (raw.tagged ?? []).filter((id): id is string => typeof id === 'string')
}

export function transformComment(raw: RawNiftyMessage, taskId?: string): Comment {
  return {
    id: raw.id,
    externalId: raw.id,
    taskId: taskId ?? pickStr(raw.task),
    authorId: pickStr(raw.author) ?? '',
    body: pickStr(raw.text) ?? '',
    mentions: mentionIds(raw),
    attachmentCount: Array.isArray(raw.attachments) ? raw.attachments.length : 0,
    createdAt: toIso(raw.created_at) ?? new Date(0).toISOString(),
    updatedAt: toIso(raw.updated_at),
    platform: 'nifty',
    metadata: strMap({
      type: raw.type,
      subtype: raw.subtype,
      chat: raw.chat,
      thread: raw.thread,
      isEdited: raw.is_edited,
    }),
    raw,
  }
}
