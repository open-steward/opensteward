import type { Project, ProjectStatus } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

/**
 * Raw Paymo project (the object under the `projects` response key). Only the
 * fields the canonical transform reads are typed; everything else survives on
 * `raw`.
 */
export interface RawPaymoProject {
  id: number
  name?: string
  code?: string
  description?: string
  client_id?: number | null
  status_id?: number | null
  active?: boolean
  budget_hours?: number
  price_per_hour?: number
  billable?: boolean
  flat_billing?: boolean
  color?: string
  users?: number[]
  managers?: number[]
  created_on?: string
  updated_on?: string
  [key: string]: unknown
}

/**
 * Paymo's only status signal on the project object is the `active` boolean:
 * active projects accept time, archived ones do not. There is no native
 * completed/on-hold state, so we map to active/archived only.
 */
function mapStatus(raw: RawPaymoProject): ProjectStatus {
  return raw.active === false ? 'archived' : 'active'
}

export function transformProject(raw: RawPaymoProject): Project {
  // Paymo accounts are single-company; there is no workspace concept, so the
  // canonical workspaceId is left blank.
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    workspaceId: '',
    name: pickStr(raw.name) ?? '',
    description: pickStr(raw.description),
    status: mapStatus(raw),
    ownerId: raw.managers?.[0] != null ? String(raw.managers[0]) : undefined,
    createdAt: toIso(raw.created_on),
    updatedAt: toIso(raw.updated_on),
    platform: 'paymo',
    metadata: strMap({
      code: raw.code,
      clientId: raw.client_id,
      statusId: raw.status_id,
      color: raw.color,
      billable: raw.billable,
    }),
    raw,
  }
}
