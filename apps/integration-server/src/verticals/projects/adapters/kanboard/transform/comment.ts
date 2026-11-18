import type { Comment } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

/**
 * Raw comment object returned by Kanboard's getComment / getAllComments.
 * Numeric fields are strings from the API.
 *
 * Docs: https://docs.kanboard.org/v1/api/comment_procedures/
 */
export interface RawKanboardComment {
  id: string | number
  task_id?: string | number
  user_id?: string | number
  date_creation?: string | number
  comment?: string
  username?: string
  name?: string
  [key: string]: unknown
}

export function transformComment(raw: RawKanboardComment, taskId?: string): Comment {
  const id = String(raw.id)
  const resolvedTaskId = taskId ?? (raw.task_id ? String(raw.task_id) : undefined)

  return {
    id,
    externalId: id,
    taskId: resolvedTaskId,
    projectId: undefined,
    authorId: raw.user_id ? String(raw.user_id) : '',
    body: pickStr(raw.comment) ?? '',
    mentions: [],
    attachmentCount: 0,
    createdAt: toIso(raw.date_creation) ?? new Date(0).toISOString(),
    platform: 'kanboard',
    metadata: strMap({
      username: raw.username,
      authorName: raw.name,
    }),
    raw,
  }
}
