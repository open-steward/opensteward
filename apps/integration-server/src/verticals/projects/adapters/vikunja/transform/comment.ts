import type { Comment } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

/**
 * Raw Vikunja TaskComment object returned by GET /tasks/{id}/comments.
 *
 * Fields sourced from pkg/models/task_comments.go:
 *   id, comment, author, created, updated.
 *
 * Note: `task_id` is not included in the API response (it is tagged json:"-"
 * in the Go model), so the caller must pass the taskId explicitly.
 */
export interface RawVikunjaTaskComment {
  id: number
  comment?: string
  author?: {
    id?: number
    username?: string
    name?: string
    email?: string
    [key: string]: unknown
  } | null
  created?: string
  updated?: string
  [key: string]: unknown
}

export function transformComment(raw: RawVikunjaTaskComment, taskId?: string): Comment {
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    taskId,
    projectId: undefined,
    authorId: raw.author?.id != null ? String(raw.author.id) : '',
    body: pickStr(raw.comment) ?? '',
    mentions: [],
    attachmentCount: 0,
    createdAt: toIso(raw.created) ?? new Date(0).toISOString(),
    updatedAt: toIso(raw.updated),
    platform: 'vikunja',
    metadata: strMap({
      authorUsername: raw.author?.username,
    }),
    raw,
  }
}
