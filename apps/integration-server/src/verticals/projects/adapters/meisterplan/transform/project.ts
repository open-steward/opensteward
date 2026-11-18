import type { Project, ProjectStatus } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

/**
 * Meisterplan project — lives inside a scenario (workspace).
 *
 * Key fields from the API:
 *   id, name, start (YYYY-MM-DD), finish (YYYY-MM-DD),
 *   manager { id }, status { name }, customFields { … }
 *
 * There is no separate "archived" flag; projects can have a `status.name`
 * like "Proposed", "Active", "On Hold", "Done", "Cancelled".
 */
export interface RawMeisterplanProject {
  id: string
  name?: string
  start?: string | null
  finish?: string | null
  status?: { name?: string } | null
  manager?: { id?: string } | null
  externalId?: string | null
  description?: string | null
  customFields?: Record<string, unknown>
  [key: string]: unknown
}

function mapStatus(raw: RawMeisterplanProject): ProjectStatus {
  const s = (raw.status?.name ?? '').toLowerCase()
  if (s === 'active' || s === 'in progress' || s === 'started') return 'active'
  if (s === 'on hold' || s === 'paused' || s === 'deferred') return 'on_hold'
  if (s === 'done' || s === 'completed' || s === 'closed' || s === 'finished') return 'completed'
  if (s === 'cancelled' || s === 'canceled' || s === 'rejected') return 'cancelled'
  if (s === 'archived') return 'archived'
  return 'active'
}

export function transformProject(raw: RawMeisterplanProject, scenarioId?: string): Project {
  return {
    id: raw.id,
    externalId: pickStr(raw.externalId) ?? raw.id,
    workspaceId: scenarioId ?? '',
    name: pickStr(raw.name) ?? '',
    description: pickStr(raw.description),
    status: mapStatus(raw),
    ownerId: pickStr(raw.manager?.id),
    startDate: toIso(raw.start),
    endDate: toIso(raw.finish),
    createdAt: undefined,
    updatedAt: undefined,
    platform: 'meisterplan',
    metadata: strMap({
      statusName: raw.status?.name,
    }),
    raw,
  }
}
