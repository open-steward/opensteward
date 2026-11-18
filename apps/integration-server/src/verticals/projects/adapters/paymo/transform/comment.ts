import type { Comment } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

/**
 * Raw Paymo comment (the object under the `comments` response key). Comments
 * hang off a thread (`thread_id`); the thread in turn references a task,
 * discussion, or file. The owning task id is resolved by the caller and passed
 * in, since the comment object itself only carries the thread id.
 */
export interface RawPaymoComment {
  id: number
  content?: string
  thread_id?: number
  user_id?: number
  created_on?: string
  updated_on?: string
  [key: string]: unknown
}

export function transformComment(raw: RawPaymoComment, taskId?: string): Comment {
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    taskId,
    authorId: raw.user_id != null ? String(raw.user_id) : '',
    body: pickStr(raw.content) ?? '',
    mentions: [],
    attachmentCount: 0,
    createdAt: toIso(raw.created_on) ?? new Date(0).toISOString(),
    updatedAt: toIso(raw.updated_on),
    platform: 'paymo',
    metadata: strMap({ threadId: raw.thread_id }),
    raw,
  }
}
