/**
 * Fieldwire project → canonical Project transform.
 *
 * Fieldwire project fields (v3):
 *   id (uuid), name, code, color, account_id,
 *   created_at, updated_at, deleted_at, plan_name
 *
 * Fieldwire has no built-in project status enum; deleted_at presence
 * is used to detect archived/deleted state. Active is the default.
 *
 * Docs: https://developers.fieldwire.com/reference/get_projects
 */
import type { Project, ProjectStatus } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface RawFieldwireProject {
  id: string
  name?: string
  code?: string | null
  color?: string | null
  account_id?: number | string
  created_at?: string
  updated_at?: string
  deleted_at?: string | null
  plan_name?: string | null
  [key: string]: unknown
}

function mapStatus(raw: RawFieldwireProject): ProjectStatus {
  if (raw.deleted_at) return 'archived'
  return 'active'
}

export function transformProject(raw: RawFieldwireProject): Project {
  return {
    id: raw.id,
    externalId: raw.id,
    // Fieldwire projects are scoped to an account; use account_id as workspaceId
    workspaceId: raw.account_id != null ? String(raw.account_id) : '',
    name: pickStr(raw.name) ?? '',
    description: undefined,
    status: mapStatus(raw),
    ownerId: undefined,
    startDate: undefined,
    endDate: undefined,
    createdAt: toIso(raw.created_at),
    updatedAt: toIso(raw.updated_at),
    platform: 'fieldwire',
    metadata: strMap({
      code: raw.code,
      color: raw.color,
      planName: raw.plan_name,
    }),
    raw,
  }
}
