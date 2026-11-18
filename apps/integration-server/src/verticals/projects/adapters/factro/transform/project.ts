/**
 * Factro project transform.
 *
 * Factro project fields (camelCase JSON):
 *   id, title, description, startDate, endDate, createDate, changeDate,
 *   creatorId, officerId, companyId, mandantId, projectState, isArchived,
 *   isDraft, priority, number, plannedEffort, realizedEffort, remainingEffort
 *
 * projectState values: "planned" | "inProcess" | "closed" | "pushedBack" | "stopped"
 */
import type { Project, ProjectStatus } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface RawFactroProject {
  id: string
  title?: string
  description?: string
  startDate?: string
  endDate?: string
  createDate?: string
  changeDate?: string
  creatorId?: string
  officerId?: string
  companyId?: string
  mandantId?: string
  projectState?: string
  isArchived?: boolean
  isDraft?: boolean
  priority?: number
  number?: number
  [key: string]: unknown
}

function mapStatus(raw: RawFactroProject): ProjectStatus {
  if (raw.isArchived) return 'archived'
  switch (raw.projectState) {
    case 'closed':
      return 'completed'
    case 'stopped':
      return 'archived'
    case 'pushedBack':
      return 'on_hold'
    case 'inProcess':
      return 'active'
    case 'planned':
      return 'planning'
    default:
      return raw.isDraft ? 'planning' : 'active'
  }
}

export function transformProject(raw: RawFactroProject): Project {
  return {
    id: raw.id,
    externalId: raw.id,
    workspaceId: pickStr(raw.mandantId) ?? '',
    name: pickStr(raw.title) ?? '',
    description: pickStr(raw.description),
    status: mapStatus(raw),
    ownerId: pickStr(raw.officerId ?? raw.creatorId),
    startDate: toIso(raw.startDate),
    endDate: toIso(raw.endDate),
    createdAt: toIso(raw.createDate),
    updatedAt: toIso(raw.changeDate),
    platform: 'factro',
    metadata: strMap({
      companyId: raw.companyId,
      isDraft: raw.isDraft,
      projectState: raw.projectState,
      priority: raw.priority,
      number: raw.number,
    }),
    raw,
  }
}
