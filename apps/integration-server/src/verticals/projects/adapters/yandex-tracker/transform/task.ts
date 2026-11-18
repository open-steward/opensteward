import type { Task, TaskStatus, TaskPriority } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

/**
 * Raw Yandex Tracker issue object from POST /v3/issues/_search.
 * Docs: https://yandex.ru/support/tracker/en/api-ref/issues/search-issues
 */
export interface RawYandexTrackerIssue {
  id: string
  key?: string
  summary?: string
  description?: string
  status?: { key?: string; display?: string }
  priority?: { key?: string; display?: string }
  type?: { key?: string; display?: string }
  assignee?: { id: string; display?: string } | null
  createdBy?: { id: string; display?: string }
  createdAt?: string
  updatedAt?: string
  parent?: { id: string; key?: string } | null
  project?: { primary?: { id: string; display?: string } } | null
  queue?: { id: string; key?: string; display?: string }
  tags?: string[]
  deadline?: string
  [key: string]: unknown
}

function mapStatus(raw: RawYandexTrackerIssue): TaskStatus {
  const key = (raw.status?.key ?? '').toLowerCase()
  if (key === 'closed' || key === 'resolved' || key === 'cancelled' || key === 'rejected') {
    return 'closed'
  }
  if (key === 'inprogress' || key === 'in_progress') return 'in_progress'
  return 'open'
}

function mapPriority(raw: RawYandexTrackerIssue): TaskPriority | undefined {
  const key = (raw.priority?.key ?? raw.priority?.display ?? '').toLowerCase()
  if (key === 'blocker' || key === 'critical') return 'urgent'
  if (key === 'major' || key === 'high') return 'high'
  if (key === 'normal' || key === 'medium') return 'medium'
  if (key === 'minor' || key === 'low' || key === 'trivial') return 'low'
  return undefined
}

export function transformTask(raw: RawYandexTrackerIssue, projectId?: string): Task {
  const pid = projectId ?? raw.project?.primary?.id ?? raw.queue?.id ?? ''
  const issueKey = pickStr(raw.key)
  return {
    id: String(raw.id),
    externalId: issueKey ?? String(raw.id),
    projectId: pid,
    parentId: raw.parent ? String(raw.parent.id) : undefined,
    title: pickStr(raw.summary) ?? '',
    description: pickStr(raw.description),
    status: mapStatus(raw),
    priority: mapPriority(raw),
    dueDate: toIso(raw.deadline),
    assigneeIds: raw.assignee ? [String(raw.assignee.id)] : [],
    tagIds: (raw.tags ?? []).map((t) => String(t)),
    subtaskCount: undefined,
    createdAt: toIso(raw.createdAt),
    updatedAt: toIso(raw.updatedAt),
    platform: 'yandex-tracker',
    metadata: strMap({
      key: issueKey,
      queueKey: raw.queue?.key,
      issueType: raw.type?.key,
    }),
    raw,
  }
}
