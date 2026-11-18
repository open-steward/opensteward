/**
 * SmartSuite maps Solutions → Projects.
 *
 * GET /api/v1/solutions/  returns an array of solution objects.
 * Each solution has an `id`, `name`, `description`, `status`, and timestamps.
 */
import type { Project, ProjectStatus } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface RawSmartsuiteDescription {
  data?: unknown
  html?: string
  preview?: string
}

export interface RawSmartsuiteSolution {
  id: string
  name?: string
  description?: RawSmartsuiteDescription | null
  status?: string | null
  /** ISO datetime string */
  created?: string
  updated?: string
  created_by?: string
  members_count?: number
  applications_count?: number
  records_count?: number
  logo_color?: string
  logo_icon?: string
  [key: string]: unknown
}

function mapStatus(raw: RawSmartsuiteSolution): ProjectStatus {
  const s = (raw.status ?? '').toLowerCase()
  if (s === 'archived' || s === 'deleted') return 'archived'
  if (s === 'completed' || s === 'done') return 'completed'
  if (s === 'on_hold' || s === 'paused') return 'on_hold'
  return 'active'
}

export function transformProject(raw: RawSmartsuiteSolution): Project {
  const description = raw.description?.preview ?? raw.description?.html ?? undefined
  return {
    id: raw.id,
    externalId: raw.id,
    workspaceId: '',
    name: pickStr(raw.name) ?? '',
    description: pickStr(description),
    status: mapStatus(raw),
    ownerId: pickStr(raw.created_by),
    createdAt: toIso(raw.created),
    updatedAt: toIso(raw.updated),
    platform: 'smartsuite',
    metadata: strMap({
      logoColor: raw.logo_color,
      logoIcon: raw.logo_icon,
      recordsCount: raw.records_count,
      applicationsCount: raw.applications_count,
      membersCount: raw.members_count,
    }),
    raw,
  }
}
