/**
 * SmartTask activity/comment transform.
 *
 * POST /record-activity/activities/{organization_id}/{record_id} with body ["comment"]
 * returns:
 * {
 *   list: [{
 *     activity_id: string,
 *     record_id: string,
 *     created_by_user: { user_id, full_name, email, avatar_url, timezone_in_mins },
 *     type: string ("comment" | ...),
 *     task_id: string | null,
 *     text: string,
 *     created_at: string,
 *     modified_at: string,
 *   }],
 *   limit_reached: boolean
 * }
 */
import type { Comment } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface RawSmarttaskActivity {
  activity_id: string
  record_id?: string
  created_by_user?: { user_id?: number | string; full_name?: string; email?: string } | null
  type?: string
  task_id?: string | null
  contact_id?: string | null
  text?: string
  created_at?: string
  modified_at?: string
  [key: string]: unknown
}

export function transformComment(
  raw: RawSmarttaskActivity,
  taskId?: string,
): Comment {
  const authorId = raw.created_by_user?.user_id != null
    ? String(raw.created_by_user.user_id)
    : ''
  return {
    id: raw.activity_id,
    externalId: raw.activity_id,
    taskId: taskId ?? raw.task_id ?? raw.record_id,
    projectId: undefined,
    authorId,
    body: pickStr(raw.text) ?? '',
    mentions: [],
    attachmentCount: 0,
    createdAt: toIso(raw.created_at) ?? new Date(0).toISOString(),
    platform: 'smarttask',
    metadata: strMap({ type: raw.type }),
    raw,
  }
}
