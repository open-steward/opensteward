import type { Task, TaskStatus, TaskPriority } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

/**
 * Redmine issue object returned by GET /issues.json and GET /issues/:id.json.
 *
 * Relevant fields:
 *   id              - numeric issue id
 *   project         - { id, name }
 *   tracker         - { id, name } (Bug, Feature, Task, etc.)
 *   status          - { id, name }
 *   priority        - { id, name } (Low, Normal, High, Urgent, Immediate)
 *   author          - { id, name }
 *   assigned_to     - { id, name } | undefined
 *   parent          - { id } | undefined (parent issue)
 *   subject         - issue title
 *   description
 *   start_date      - YYYY-MM-DD
 *   due_date        - YYYY-MM-DD
 *   done_ratio      - 0-100
 *   created_on      - ISO-8601
 *   updated_on      - ISO-8601
 *   closed_on       - ISO-8601 | undefined
 */
export interface RawRedmineIssue {
  id: number
  project?: { id: number; name?: string }
  tracker?: { id: number; name?: string }
  status?: { id: number; name?: string }
  priority?: { id: number; name?: string }
  author?: { id: number; name?: string }
  assigned_to?: { id: number; name?: string }
  parent?: { id: number }
  subject?: string
  description?: string
  start_date?: string
  due_date?: string
  done_ratio?: number
  created_on?: string
  updated_on?: string
  closed_on?: string
  [key: string]: unknown
}

function mapStatus(raw: RawRedmineIssue): TaskStatus {
  const name = (raw.status?.name ?? '').toLowerCase()
  if (name === 'closed' || name === 'rejected' || name === 'resolved') return 'closed'
  if (name === 'in progress' || name === 'in_progress') return 'in_progress'
  return 'open'
}

function mapPriority(raw: RawRedmineIssue): TaskPriority | undefined {
  const name = (raw.priority?.name ?? '').toLowerCase()
  if (name === 'immediate') return 'urgent'
  if (name === 'urgent') return 'urgent'
  if (name === 'high') return 'high'
  if (name === 'normal') return 'medium'
  if (name === 'low') return 'low'
  return undefined
}

export function transformIssue(raw: RawRedmineIssue, projectId?: string): Task {
  const id = String(raw.id ?? '')
  const pid = projectId ?? (raw.project ? String(raw.project.id) : '')
  return {
    id,
    externalId: id,
    projectId: pid,
    parentId: raw.parent ? String(raw.parent.id) : undefined,
    title: pickStr(raw.subject) ?? '',
    description: pickStr(raw.description),
    status: mapStatus(raw),
    priority: mapPriority(raw),
    dueDate: toIso(raw.due_date),
    assigneeIds: raw.assigned_to ? [String(raw.assigned_to.id)] : [],
    tagIds: [],
    subtaskCount: undefined,
    createdAt: toIso(raw.created_on),
    updatedAt: toIso(raw.updated_on),
    platform: 'redmine',
    metadata: strMap({
      tracker: raw.tracker?.name,
      statusName: raw.status?.name,
      doneRatio: raw.done_ratio,
      authorId: raw.author ? String(raw.author.id) : undefined,
      closedOn: raw.closed_on,
    }),
    raw,
  }
}
