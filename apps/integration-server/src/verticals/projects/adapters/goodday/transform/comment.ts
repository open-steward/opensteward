import type { Comment } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

/**
 * GoodDay message object returned by GET /task/{id}/messages.
 *
 * Messages are the comments/replies on a task.
 */
export interface RawGooddayMessage {
  id: string
  message?: string | null
  fromUserId?: string | null
  toUserId?: string | null
  momentCreated?: number | string | null
  taskId?: string | null
  type?: string | null
  [key: string]: unknown
}

export function transformComment(raw: RawGooddayMessage, taskId?: string): Comment {
  return {
    id: raw.id,
    externalId: raw.id,
    taskId: taskId ?? pickStr(raw.taskId),
    projectId: undefined,
    authorId: pickStr(raw.fromUserId) ?? '',
    body: pickStr(raw.message) ?? '',
    mentions: [],
    attachmentCount: 0,
    createdAt: toIso(raw.momentCreated) ?? new Date(0).toISOString(),
    platform: 'goodday',
    metadata: strMap({ type: raw.type, toUserId: raw.toUserId }),
    raw,
  }
}
