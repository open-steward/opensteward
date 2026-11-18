import type { Task, TaskStatus, TaskPriority } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

/**
 * ONES issue resource from GET /project/issues.
 *
 * Key fields (verified against ONES OpenAPI v2 docs):
 *   id              — issue identifier
 *   title / name    — issue title (API may use either key)
 *   description     — rich-text body (stored as-is)
 *   projectID       — parent project id
 *   parentID        — parent issue id (for sub-issues)
 *   issueTypeID     — issue type id
 *   status          — { id, name, category } | string
 *   priority        — { id, name, value } | string
 *   assign          — single assignee id (legacy)
 *   assignees       — array of { id } objects (preferred)
 *   deadline        — Unix epoch seconds
 *   createTime      — Unix epoch seconds
 *   updateTime      — Unix epoch seconds
 *   subIssueCount   — integer
 *
 * Docs: https://docs.ones.com/developer/openapi/api/issue
 */
export interface RawOnesIssue {
  id?: string
  name?: string
  title?: string
  description?: string
  status?: { id?: string; name?: string; category?: string } | string | null
  statusCategory?: string
  priority?: { id?: string; name?: string; value?: string } | string | null
  projectID?: string
  parentID?: string
  issueTypeID?: string
  issueType?: { id?: string; name?: string } | string | null
  assign?: string | null
  assignees?: Array<{ id?: string } | string>
  owner?: { id?: string } | string | null
  subIssueCount?: number
  deadline?: number | string
  createTime?: number | string
  updateTime?: number | string
  [key: string]: unknown
}

function refId(v: unknown): string | undefined {
  if (!v) return undefined
  if (typeof v === 'string') return v
  if (typeof v === 'object') {
    const o = v as { id?: string }
    return o.id
  }
  return undefined
}

function statusCategory(raw: RawOnesIssue): string {
  if (typeof raw.status === 'object' && raw.status) {
    return (raw.status.category ?? raw.status.name ?? '').toLowerCase()
  }
  return (
    raw.statusCategory ?? (typeof raw.status === 'string' ? raw.status : '')
  ).toLowerCase()
}

function mapStatus(raw: RawOnesIssue): TaskStatus {
  const s = statusCategory(raw)
  if (s.includes('done') || s.includes('closed') || s.includes('complet') || s.includes('resolved')) {
    return 'closed'
  }
  if (s.includes('progress') || s.includes('doing') || s.includes('active') || s.includes('review')) {
    return 'in_progress'
  }
  return 'open'
}

function mapPriority(raw: RawOnesIssue): TaskPriority | undefined {
  const p =
    typeof raw.priority === 'object' && raw.priority
      ? (raw.priority.name ?? raw.priority.value ?? '')
      : typeof raw.priority === 'string'
        ? raw.priority
        : ''
  const v = p.toLowerCase()
  if (v.includes('urgent') || v.includes('critical') || v.includes('highest') || v.includes('blocker')) {
    return 'urgent'
  }
  if (v.includes('high')) return 'high'
  if (v.includes('medium') || v.includes('normal') || v.includes('major')) return 'medium'
  if (v.includes('low') || v.includes('minor') || v.includes('trivial') || v.includes('lowest')) {
    return 'low'
  }
  return undefined
}

function assigneeIds(raw: RawOnesIssue): string[] {
  if (raw.assignees && raw.assignees.length > 0) {
    return raw.assignees.map(refId).filter((x): x is string => Boolean(x))
  }
  const single = pickStr(raw.assign) ?? refId(raw.owner)
  return single ? [single] : []
}

export function transformTask(raw: RawOnesIssue, projectId?: string): Task {
  const id = raw.id ?? ''
  const pid = projectId ?? raw.projectID ?? ''
  return {
    id,
    externalId: id,
    projectId: pid,
    parentId: raw.parentID ?? undefined,
    title: pickStr(raw.name ?? raw.title) ?? '',
    description: pickStr(raw.description),
    status: mapStatus(raw),
    priority: mapPriority(raw),
    dueDate: toIso(raw.deadline),
    assigneeIds: assigneeIds(raw),
    tagIds: [],
    subtaskCount: raw.subIssueCount,
    createdAt: toIso(raw.createTime),
    updatedAt: toIso(raw.updateTime),
    platform: 'ones',
    metadata: strMap({
      platformType: raw.parentID ? 'subissue' : 'issue',
      issueTypeId: raw.issueTypeID ?? refId(raw.issueType),
      statusId:
        typeof raw.status === 'object' && raw.status ? raw.status.id : pickStr(raw.status),
    }),
    raw,
  }
}
