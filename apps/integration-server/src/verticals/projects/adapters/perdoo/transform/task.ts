/**
 * Transform a Perdoo KeyResult → canonical Task.
 *
 * Perdoo KeyResults (type=KEY_RESULT) and Initiatives (type=INITIATIVE) are
 * both surfaced as canonical Tasks. The parent Objective id maps to projectId.
 * Perdoo has no priority field on key results, so priority is always undefined.
 * A key result with `archived=true` maps to `closed` status.
 */
import type { Task, TaskStatus } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

/** Relay-style connection edge. */
interface RelayEdge<T> {
  node: T
}

export interface RawPerdooKeyResult {
  id: string
  name?: string
  description?: string | null
  status?: string | null
  type?: string | null
  archived?: boolean
  lead?: { id: string; name?: string } | null
  objective?: { id: string; name?: string } | null
  parent?: { id: string; name?: string } | null
  childrenCount?: number | null
  contributors?: { edges: Array<RelayEdge<{ id: string }>> } | null
  startDate?: string | null
  dueDate?: string | null
  createdDate?: string | null
  lastEditedDate?: string | null
  startValue?: number | null
  endValue?: number | null
  currentValue?: number | null
  metricUnit?: string | null
  weight?: number | null
  [key: string]: unknown
}

function mapStatus(raw: RawPerdooKeyResult): TaskStatus {
  if (raw.archived) return 'closed'
  const s = (raw.status ?? '').toUpperCase()
  if (s === 'ACCOMPLISHED') return 'closed'
  return 'open'
}

export function transformTask(raw: RawPerdooKeyResult, objectiveId?: string): Task {
  const pid = objectiveId ?? raw.objective?.id ?? ''
  const contributorIds = (raw.contributors?.edges ?? []).map((e) => e.node.id)
  const assigneeIds = raw.lead ? [raw.lead.id, ...contributorIds] : contributorIds
  return {
    id: raw.id,
    externalId: raw.id,
    projectId: pid,
    parentId: raw.parent?.id,
    title: pickStr(raw.name) ?? '',
    description: pickStr(raw.description),
    status: mapStatus(raw),
    priority: undefined,
    dueDate: toIso(raw.dueDate),
    assigneeIds,
    tagIds: [],
    subtaskCount: raw.childrenCount ?? undefined,
    createdAt: toIso(raw.createdDate),
    updatedAt: toIso(raw.lastEditedDate),
    platform: 'perdoo',
    metadata: strMap({
      type: raw.type,
      commitStatus: raw.status,
      metricUnit: raw.metricUnit,
      startValue: raw.startValue,
      endValue: raw.endValue,
      currentValue: raw.currentValue,
      weight: raw.weight,
    }),
    raw,
  }
}
