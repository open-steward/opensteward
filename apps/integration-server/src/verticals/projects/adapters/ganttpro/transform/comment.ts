/**
 * GanttPRO comment transform.
 *
 * GET /comments?taskId=X              →  array of RawGanttproComment
 * GET /comments/getByProjectId?projectId=X  →  array of RawGanttproComment
 */
import type { Comment } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface RawGanttproComment {
  id: number | string
  taskId?: number | string
  projectId?: number | string
  userId?: number | string
  content?: string
  /** some response shapes nest the user details */
  user?: {
    resourceId?: number | string
    firstName?: string
    lastName?: string
    photo?: string
  }
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

export function transformComment(
  raw: RawGanttproComment,
  taskId?: string,
  projectId?: string,
): Comment {
  const authorId =
    raw.userId != null
      ? String(raw.userId)
      : raw.user?.resourceId != null
        ? String(raw.user.resourceId)
        : ''

  return {
    id: String(raw.id),
    externalId: String(raw.id),
    taskId: taskId ?? (raw.taskId != null ? String(raw.taskId) : undefined),
    projectId: projectId ?? (raw.projectId != null ? String(raw.projectId) : undefined),
    authorId,
    body: pickStr(raw.content) ?? '',
    mentions: [],
    attachmentCount: 0,
    createdAt: toIso(raw.createdAt) ?? new Date(0).toISOString(),
    updatedAt: toIso(raw.updatedAt),
    platform: 'ganttpro',
    metadata: strMap({}),
    raw,
  }
}
