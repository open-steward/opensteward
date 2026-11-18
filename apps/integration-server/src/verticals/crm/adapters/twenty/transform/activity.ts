import type { Activity } from '../../../schema/activity'
import { present, recordId, type RawTwentyRecord } from '../records'

/**
 * Twenty "tasks" (TaskWorkspaceEntity, twentyhq/twenty
 * packages/twenty-server/src/modules/task/standard-objects/task.workspace-entity.ts).
 * Twenty's standard objects are Companies, People, Opportunities, Tasks and
 * Notes, with "**Tasks** — Action items for your team"
 * (https://docs.twenty.com/getting-started/core-concepts/data-model.md);
 * the old Activity object is gone, and Tasks are the activities it keeps.
 *   title: string | null
 *   bodyV2: RichTextMetadata | null
 *   dueAt: Date | null                (DATE_TIME)
 *   status: string | null             (SELECT: TODO, IN_PROGRESS, DONE —
 *                                      compute-task-standard-flat-field-metadata.util.ts)
 *   assigneeId: string | null         (MANY_TO_ONE join column to a workspace member)
 *
 * Linked records live on taskTargets (ONE_TO_MANY, not returned at depth 0).
 */
export interface RawTwentyTask extends RawTwentyRecord {
  title?: string | null
  bodyV2?: { blocknote?: string | null; markdown?: string | null } | null
  dueAt?: string | null
  status?: string | null
  assigneeId?: string | null
}

/** The payload a legacy create call posts; kept for createActivity (out of scope here). */
export type RawTwentyActivity = RawTwentyTask

export function transformActivity(raw: RawTwentyTask): Activity {
  const status = present(raw.status)
  return {
    id: recordId(raw, 'task'),
    // Every row of /rest/tasks is a Twenty task.
    type: 'task',
    subject: present(raw.title),
    note: present(raw.bodyV2?.markdown),
    owner_id: present(raw.assigneeId),
    due_date: present(raw.dueAt),
    done: status === undefined ? undefined : status === 'DONE',
    created_at: raw.createdAt,
    updated_at: raw.updatedAt,
    metadata: raw,
  }
}

export function untransformActivity(data: Partial<Activity>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.type !== undefined) out.type = data.type
  if (data.subject !== undefined) out.title = data.subject
  if (data.note !== undefined) out.body = data.note
  if (data.due_date !== undefined) out.dueAt = data.due_date
  if (data.done !== undefined) out.completedAt = data.done ? new Date().toISOString() : null
  return out
}
