import type { Project, ProjectStatus } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

/**
 * A Kantata OX Workspace (called a "Project" in the UI). Maps to the canonical
 * `Project`. The owning org (Account) is surfaced as `workspaceId`.
 */
export interface RawKantataWorkspace {
  id: string
  title?: string
  description?: string
  archived?: boolean
  account_id?: number | string
  creator_id?: string
  due_date?: string
  start_date?: string
  created_at?: string
  updated_at?: string
  percentage_complete?: number
  currency?: string
  /** `status` is an object such as { message, color, key, ... }. */
  status?: { message?: string; color?: string; key?: string } | null
  [key: string]: unknown
}

function mapStatus(raw: RawKantataWorkspace): ProjectStatus {
  if (raw.archived) return 'archived'
  if ((raw.percentage_complete ?? 0) >= 100) return 'completed'
  return 'active'
}

export function transformProject(raw: RawKantataWorkspace): Project {
  return {
    id: raw.id,
    externalId: raw.id,
    workspaceId: pickStr(raw.account_id) ?? '',
    name: pickStr(raw.title) ?? '',
    description: pickStr(raw.description),
    status: mapStatus(raw),
    ownerId: pickStr(raw.creator_id),
    startDate: toIso(raw.start_date),
    endDate: toIso(raw.due_date),
    createdAt: toIso(raw.created_at),
    updatedAt: toIso(raw.updated_at),
    platform: 'kantata',
    metadata: strMap({
      currency: raw.currency,
      percentageComplete: raw.percentage_complete,
      statusMessage: raw.status?.message,
      statusKey: raw.status?.key,
    }),
    raw,
  }
}
