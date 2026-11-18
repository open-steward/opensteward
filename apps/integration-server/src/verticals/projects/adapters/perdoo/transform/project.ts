/**
 * Transform a Perdoo Objective → canonical Project.
 *
 * Perdoo organises work around OKRs. The top-level entity is an Objective;
 * Key Results sit under it. We map Objective → Project so that the hierarchy
 * is consistent with other project-management verticals.
 *
 * Workspace is derived from the first group the objective belongs to.
 */
import type { Project, ProjectStatus } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

/** Relay-style connection edge returned by the objectives query. */
interface RelayEdge<T> {
  node: T
}

export interface RawPerdooObjective {
  id: string
  name?: string
  description?: string | null
  progress?: number | null
  status?: string | null
  stage?: string | null
  lead?: { id: string; name?: string } | null
  timeframe?: { id: string; name?: string } | null
  parent?: { id: string; name?: string } | null
  groups?: { edges: Array<RelayEdge<{ id: string; name?: string }>> } | null
  startDate?: string | null
  dueDate?: string | null
  createdDate?: string | null
  lastEditedDate?: string | null
  [key: string]: unknown
}

function mapStatus(raw: RawPerdooObjective): ProjectStatus {
  const stage = (raw.stage ?? '').toUpperCase()
  if (stage === 'CLOSED') return 'archived'
  if (stage === 'DRAFT') return 'on_hold'
  const status = (raw.status ?? '').toUpperCase()
  if (status === 'OFF_TRACK' || status === 'NEEDS_ATTENTION') return 'on_hold'
  return 'active'
}

export function transformProject(raw: RawPerdooObjective): Project {
  const firstGroupId = raw.groups?.edges?.[0]?.node?.id ?? ''
  return {
    id: raw.id,
    externalId: raw.id,
    workspaceId: firstGroupId,
    name: pickStr(raw.name) ?? '',
    description: pickStr(raw.description),
    status: mapStatus(raw),
    ownerId: pickStr(raw.lead?.id),
    startDate: toIso(raw.startDate),
    endDate: toIso(raw.dueDate),
    createdAt: toIso(raw.createdDate),
    updatedAt: toIso(raw.lastEditedDate),
    platform: 'perdoo',
    metadata: strMap({
      stage: raw.stage,
      commitStatus: raw.status,
      progress: raw.progress,
      timeframeId: raw.timeframe?.id,
      timeframeName: raw.timeframe?.name,
      parentId: raw.parent?.id,
    }),
    raw,
  }
}
