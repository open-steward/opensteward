import type { Comment } from '../../../schema'
import {
  pickStr,
  strMap,
  timePointToIso,
  personId,
  peopleUserIds,
  type PlanfixTimePoint,
  type PlanfixPerson,
  type PlanfixPeople,
} from './shared'

/**
 * Planfix comment (`CommentResponse`). The comment body is `description`; the
 * author is `owner`; `recipients` (a `{ users, groups }` block) are surfaced as
 * canonical `mentions`. Only the attachment COUNT is surfaced from `files` —
 * attachment content is refused by the canonical schema. `task`/`project` are
 * bare `{ id }` references back to the parent objects.
 */
export interface RawPlanfixComment {
  id: number
  dateTime?: PlanfixTimePoint | null
  type?: string
  fromType?: string
  description?: string
  task?: { id?: number } | null
  project?: { id?: number } | null
  owner?: PlanfixPerson | null
  recipients?: PlanfixPeople | null
  files?: unknown[]
  isDeleted?: boolean
  [key: string]: unknown
}

export function transformComment(raw: RawPlanfixComment, taskId?: string, projectId?: string): Comment {
  const resolvedTaskId = taskId ?? (raw.task?.id != null ? String(raw.task.id) : undefined)
  const resolvedProjectId = projectId ?? (raw.project?.id != null ? String(raw.project.id) : undefined)
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    taskId: resolvedTaskId,
    projectId: resolvedProjectId,
    authorId: personId(raw.owner) ?? '',
    body: pickStr(raw.description) ?? '',
    mentions: peopleUserIds(raw.recipients),
    attachmentCount: Array.isArray(raw.files) ? raw.files.length : 0,
    createdAt: timePointToIso(raw.dateTime) ?? new Date(0).toISOString(),
    platform: 'planfix',
    metadata: strMap({ type: raw.type, fromType: raw.fromType, isDeleted: raw.isDeleted }),
    raw,
  }
}
