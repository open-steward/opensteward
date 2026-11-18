/**
 * Fieldwire bubble → canonical Comment transform.
 *
 * In Fieldwire, "bubbles" are the comment/annotation objects attached to tasks.
 * Bubble types include: note, photo, video, file, hyperlink.
 * We map all bubble types to Comment; text-only bubbles have a `note` field.
 *
 * Bubble fields (v3):
 *   id (uuid), task_id (uuid), project_id (uuid),
 *   creator_user_id (int32), note (string|null),
 *   note_type (string), device_created_at, device_updated_at
 *
 * Docs: https://developers.fieldwire.com/reference/get_bubbles_in_task
 */
import type { Comment } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface RawFieldwireBubble {
  id: string
  task_id?: string
  project_id?: string
  creator_user_id?: number | null
  note?: string | null
  note_type?: string | null
  device_created_at?: string
  device_updated_at?: string
  [key: string]: unknown
}

export function transformComment(raw: RawFieldwireBubble, taskId?: string, projectId?: string): Comment {
  return {
    id: raw.id,
    externalId: raw.id,
    taskId: taskId ?? raw.task_id,
    projectId: projectId ?? raw.project_id,
    authorId: raw.creator_user_id != null ? String(raw.creator_user_id) : '',
    body: pickStr(raw.note) ?? '',
    mentions: [],
    attachmentCount: 0,
    createdAt: toIso(raw.device_created_at) ?? new Date(0).toISOString(),
    platform: 'fieldwire',
    metadata: strMap({ noteType: raw.note_type }),
    raw,
  }
}
