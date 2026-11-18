import { toIsoDatetime } from '@opensteward/shared'
import type { Activity } from '../../../schema/activity'

/**
 * Reply.io "Tasks" are the closest concept to CRM activities.
 * They represent manual actions (calls, meetings, to-dos, emails, LinkedIn steps)
 * that are assigned to team members and linked to contacts.
 *
 * List:   GET /v3/tasks            → { items: RawReplyIoTask[], hasMore: boolean }
 * Single: GET /v3/tasks/{id}       → RawReplyIoTask (TaskResponse shape)
 *
 * Derived: Reply.io has no generic "activity" resource; Tasks are the equivalent.
 */
export interface RawReplyIoTask {
  id: number
  taskType?: string | null
  status?: string | null
  linkedInTaskType?: string | null
  assignedUserId?: number | null
  contactId?: number | null
  /** Present in list response as a nested object */
  contact?: { id: number; fullName?: string | null } | null
  sequenceId?: number | null
  sequenceStepId?: number | null
  sequenceStepDisplayName?: string | null
  creationSource?: string | null
  createdAt?: string | null
  startAt?: string | null
  dueTo?: string | null
  finishedAt?: string | null
  isFailed?: boolean
  isScheduled?: boolean
  template?: string | null
  content?: string | null
  deliveryInfo?: Record<string, unknown> | null
  [key: string]: unknown
}

/**
 * Maps a Reply.io task's `taskType` to a canonical activity type string.
 * Canonical values: call, email, meeting, task, deadline, lunch.
 */
function mapTaskType(taskType: string | null | undefined): string | undefined {
  if (!taskType) return undefined
  switch (taskType) {
    case 'call': return 'call'
    case 'meeting': return 'meeting'
    case 'manualEmail': return 'email'
    case 'toDo': return 'task'
    case 'linkedIn': return 'task'
    case 'sms': return 'task'
    case 'whatsApp': return 'task'
    default: return taskType
  }
}

export function transformActivity(raw: RawReplyIoTask): Activity {
  // Resolve the contact ID from either the detail (contactId) or list (contact.id) shape.
  const contactId =
    raw.contactId != null
      ? String(raw.contactId)
      : raw.contact?.id != null
        ? String(raw.contact.id)
        : undefined

  // A task is "done" when its status is "finished".
  const done = raw.status === 'finished' ? true : raw.status != null ? false : undefined

  return {
    id: String(raw.id),
    type: mapTaskType(raw.taskType),
    subject: raw.sequenceStepDisplayName ?? raw.taskType ?? undefined,
    note: raw.template ?? undefined,
    contact_id: contactId,
    owner_id: raw.assignedUserId != null ? String(raw.assignedUserId) : undefined,
    due_date: toIsoDatetime(raw.dueTo),
    done,
    created_at: toIsoDatetime(raw.createdAt),
    updated_at: toIsoDatetime(raw.finishedAt),
    metadata: raw as Record<string, unknown>,
  }
}
