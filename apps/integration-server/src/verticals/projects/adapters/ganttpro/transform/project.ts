/**
 * GanttPRO project transform.
 *
 * GET /projects  →  array of RawGanttproProject
 * GET /projects/{projectId}  →  single RawGanttproProject
 *
 * GanttPRO does not expose an archived/status flag in the list endpoint;
 * we default to 'active'. `lastUpdate` is the only timestamp on the list
 * resource; a full `createdAt` is absent from the list payload.
 */
import type { Project } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface RawGanttproProject {
  projectId: number | string
  name?: string
  description?: string
  isFavorite?: boolean
  favoriteOrder?: number
  lastUpdate?: string
  /** present on POST response / detail if ever added */
  ownerId?: number | string
  startProject?: string
  [key: string]: unknown
}

export function transformProject(raw: RawGanttproProject): Project {
  return {
    id: String(raw.projectId),
    externalId: String(raw.projectId),
    workspaceId: '',
    name: pickStr(raw.name) ?? '',
    description: pickStr(raw.description),
    status: 'active',
    ownerId: raw.ownerId != null ? String(raw.ownerId) : undefined,
    startDate: toIso(raw.startProject),
    endDate: undefined,
    createdAt: undefined,
    updatedAt: toIso(raw.lastUpdate),
    platform: 'ganttpro',
    metadata: strMap({
      isFavorite: raw.isFavorite,
      favoriteOrder: raw.favoriteOrder,
    }),
    raw,
  }
}
