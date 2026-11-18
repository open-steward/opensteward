import type { Task, TaskStatus, TaskPriority } from '../../../schema'
import { pickStr, strMap, toIso, fromGraphDateTime, type GraphDateTime } from './shared'

/**
 * A `todoTask` is the work item. Its `body` is an `itemBody` ({ content,
 * contentType }); the due / start / completed timestamps are wrapped in
 * Graph `dateTimeTimeZone` objects, while created / lastModified are bare
 * `DateTimeOffset` strings.
 *
 * To Do has no task hierarchy at the `todoTask` level (checklistItems are a
 * sub-collection, not nested tasks), so `parentId` is never set. `categories`
 * are free-text strings, not addressable tag entities, so they land in
 * `metadata` rather than `tagIds`.
 */
export interface RawTodoTask {
  id: string
  title?: string
  body?: { content?: string; contentType?: string } | null
  bodyLastModifiedDateTime?: string
  categories?: string[]
  completedDateTime?: GraphDateTime | null
  createdDateTime?: string
  dueDateTime?: GraphDateTime | null
  hasAttachments?: boolean
  importance?: string
  isReminderOn?: boolean
  lastModifiedDateTime?: string
  reminderDateTime?: GraphDateTime | null
  startDateTime?: GraphDateTime | null
  status?: string
  [key: string]: unknown
}

function mapStatus(raw: RawTodoTask): TaskStatus {
  switch (raw.status) {
    case 'notStarted':
      return 'open'
    case 'inProgress':
      return 'in_progress'
    case 'waitingOnOthers':
      return 'in_review'
    case 'completed':
      return 'closed'
    case 'deferred':
      return 'open'
    default:
      return 'open'
  }
}

function mapPriority(raw: RawTodoTask): TaskPriority | undefined {
  switch (raw.importance) {
    case 'high':
      return 'high'
    case 'normal':
      return 'medium'
    case 'low':
      return 'low'
    default:
      return undefined
  }
}

export function transformTask(raw: RawTodoTask, projectId = ''): Task {
  // A Graph task is only addressable via its parent list, but the canonical
  // `getTask(id)` receives a single id. We expose a composite `{listId}:{taskId}`
  // as `id` so the task round-trips through `getTask`, while `externalId` keeps
  // the raw Graph task id.
  const id = projectId ? `${projectId}:${raw.id}` : raw.id
  return {
    id,
    externalId: raw.id,
    projectId,
    title: pickStr(raw.title) ?? '',
    description: pickStr(raw.body?.content),
    status: mapStatus(raw),
    priority: mapPriority(raw),
    dueDate: fromGraphDateTime(raw.dueDateTime),
    assigneeIds: [],
    tagIds: [],
    createdAt: toIso(raw.createdDateTime),
    updatedAt: toIso(raw.lastModifiedDateTime),
    platform: 'microsoft-todo',
    metadata: strMap({
      platformType: 'task',
      importance: raw.importance,
      isReminderOn: raw.isReminderOn,
      hasAttachments: raw.hasAttachments,
      categories: raw.categories?.join(','),
      bodyContentType: raw.body?.contentType,
      startDate: fromGraphDateTime(raw.startDateTime),
      completedDate: fromGraphDateTime(raw.completedDateTime),
      reminderDate: fromGraphDateTime(raw.reminderDateTime),
    }),
    raw,
  }
}
