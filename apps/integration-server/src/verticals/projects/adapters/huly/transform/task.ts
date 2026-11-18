/**
 * Huly tracker Issue → canonical Task.
 *
 * Fields, from hcengineering/platform plugins/tracker/src/index.ts
 * (`interface Issue extends Task { attachedTo: Ref<Issue>; title: string;
 * description: MarkupBlobRef | null; status: Ref<IssueStatus>; priority:
 * IssuePriority; subIssues: CollectionSize<Issue>; space: Ref<Project> ... }`,
 * `enum IssuePriority { NoPriority, Urgent, High, Medium, Low }`,
 * `ids.NoParent`) and plugins/task/src/index.ts (`interface Task {
 * number: number; assignee: Ref<Person> | null; dueDate: Timestamp | null;
 * identifier: string ... }`). Timestamps are epoch milliseconds.
 *
 * Not mapped:
 *   - `description` is a MarkupBlobRef (a reference to a collaborative
 *     document), not the text, so it is not the canonical description.
 *   - `status` is a reference to an IssueStatus document; its category needs
 *     a second lookup, so the canonical status is 'unknown' and the reference
 *     is kept in metadata.statusRef.
 */
import type { Task, TaskPriority } from '../../../schema'
import { ISSUE_NO_PARENT } from '../constants'
import { pickNum, strMap, toIso } from './shared'

/** IssuePriority, in declaration order. */
const PRIORITY: Record<number, TaskPriority | undefined> = {
  0: undefined, // NoPriority
  1: 'urgent',
  2: 'high',
  3: 'medium',
  4: 'low',
}

export interface RawHulyIssue {
  _id: string
  _class: string
  /** The tracker Project `_id`. */
  space: string
  /** Parent issue `_id`, or `tracker:ids:NoParent` for a top-level issue. */
  attachedTo?: string
  identifier?: string
  number?: number
  title: string
  description?: string | null
  status?: string
  priority?: number
  assignee?: string | null
  dueDate?: number | null
  subIssues?: number
  createdOn?: number
  modifiedOn: number
  [key: string]: unknown
}

export function transformIssue(raw: RawHulyIssue): Task {
  const parentId =
    typeof raw.attachedTo === 'string' && raw.attachedTo !== ISSUE_NO_PARENT
      ? raw.attachedTo
      : undefined
  const priority = typeof raw.priority === 'number' ? PRIORITY[raw.priority] : undefined
  return {
    id: raw._id,
    externalId: raw._id,
    projectId: raw.space,
    parentId,
    title: raw.title,
    status: 'unknown',
    priority,
    dueDate: toIso(raw.dueDate ?? undefined),
    assigneeIds: raw.assignee ? [raw.assignee] : [],
    tagIds: [],
    subtaskCount: pickNum(raw.subIssues),
    createdAt: toIso(raw.createdOn),
    updatedAt: toIso(raw.modifiedOn),
    platform: 'huly',
    metadata: strMap({
      identifier: raw.identifier,
      statusRef: raw.status,
      platformType: parentId ? 'sub-issue' : 'issue',
    }),
    raw,
  }
}

/** Alias kept for consistency with other adapter exports. */
export type RawHulyTask = RawHulyIssue
export const transformTask = transformIssue
