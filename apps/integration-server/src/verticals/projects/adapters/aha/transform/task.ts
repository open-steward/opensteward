/**
 * Aha! Feature → canonical Task.
 *
 * A feature is a work item that lives inside a release (project). Status comes
 * from `workflow_status` (whose `complete` flag marks done states); the
 * workflow name is mapped onto the canonical task statuses with a best-effort
 * keyword match. A feature may roll up to an `epic` parent.
 *
 * Aha! tags arrive inline as an array of plain strings; they are surfaced as
 * `tagIds` directly (Aha! has no stand-alone tag resource ids).
 *
 * Aha! has no first-class task priority; `score` (a numeric prioritization
 * value) is preserved in metadata instead.
 *
 * Never throws — missing optionals resolve to `undefined`.
 */
import type { Task, TaskStatus } from '../../../schema'
import { pickNum, pickStr, strMap, toIso } from './shared'

export interface RawAhaFeature {
  id: string
  reference_num?: string
  name?: string
  description?: { id?: string; body?: string } | null
  workflow_status?: { id?: string; name?: string; complete?: boolean; color?: string } | null
  assigned_to_user?: { id: string; name?: string; email?: string } | null
  tags?: string[]
  start_date?: string
  due_date?: string
  score?: number
  progress?: number
  product_id?: string
  release?: { id: string; reference_num?: string } | null
  epic?: { id: string; reference_num?: string } | null
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

function mapStatus(raw: RawAhaFeature): TaskStatus {
  const ws = raw.workflow_status
  if (!ws) return 'open'
  if (ws.complete) return 'closed'
  const name = (ws.name ?? '').toLowerCase()
  if (name.includes('review') || name.includes('qa') || name.includes('testing')) return 'in_review'
  if (
    name.includes('progress') ||
    name.includes('developing') ||
    name.includes('in design') ||
    name.includes('building') ||
    name.includes('started')
  ) {
    return 'in_progress'
  }
  if (name.includes('will not') || name.includes("won't") || name.includes('cancel')) return 'cancelled'
  if (
    name.includes('shipped') ||
    name.includes('done') ||
    name.includes('complete') ||
    name.includes('closed')
  ) {
    return 'closed'
  }
  return 'open'
}

export function transformTask(raw: RawAhaFeature, projectId?: string): Task {
  const pid = projectId ?? pickStr(raw.release?.id) ?? ''
  return {
    id: raw.id,
    externalId: raw.id,
    projectId: pid,
    parentId: pickStr(raw.epic?.id),
    title: pickStr(raw.name) ?? '',
    description: pickStr(raw.description?.body),
    status: mapStatus(raw),
    dueDate: toIso(raw.due_date),
    assigneeIds: raw.assigned_to_user ? [raw.assigned_to_user.id] : [],
    tagIds: raw.tags ?? [],
    createdAt: toIso(raw.created_at),
    updatedAt: toIso(raw.updated_at),
    platform: 'aha',
    metadata: strMap({
      platformType: raw.epic ? 'feature_under_epic' : 'feature',
      referenceNum: raw.reference_num,
      workflowStatus: raw.workflow_status?.name,
      score: pickNum(raw.score),
      progress: pickNum(raw.progress),
      productId: raw.product_id,
    }),
    raw,
  }
}
