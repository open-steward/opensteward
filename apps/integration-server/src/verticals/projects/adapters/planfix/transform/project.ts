import type { Project, ProjectStatus } from '../../../schema'
import {
  pickStr,
  strMap,
  timePointToIso,
  personId,
  type PlanfixTimePoint,
  type PlanfixPerson,
} from './shared'

/**
 * Planfix project (`ProjectResponse`). The project `status` is a bare
 * `{ id }` reference to an account-configurable status directory (no name or
 * color on the wire), so the canonical status can only distinguish deleted
 * (→ `archived`) from everything else (→ `active`); the raw status id is kept
 * in metadata. `owner` is the project lead; people are namespaced string ids.
 */
export interface RawPlanfixProject {
  id: number
  name?: string
  description?: string
  status?: { id?: number } | null
  owner?: PlanfixPerson | null
  parent?: { id?: number } | null
  counterparty?: PlanfixPerson | null
  startDate?: PlanfixTimePoint | null
  endDate?: PlanfixTimePoint | null
  overdue?: boolean
  isDeleted?: boolean
  [key: string]: unknown
}

function mapStatus(raw: RawPlanfixProject): ProjectStatus {
  if (raw.isDeleted) return 'archived'
  return 'active'
}

export function transformProject(raw: RawPlanfixProject): Project {
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    // Planfix is single-account: the account host is the workspace. There is
    // no per-project workspace id on the wire.
    workspaceId: '',
    name: pickStr(raw.name) ?? '',
    description: pickStr(raw.description),
    status: mapStatus(raw),
    ownerId: personId(raw.owner),
    startDate: timePointToIso(raw.startDate),
    endDate: timePointToIso(raw.endDate),
    platform: 'planfix',
    metadata: strMap({
      statusId: raw.status?.id,
      parentId: raw.parent?.id,
      counterpartyId: personId(raw.counterparty),
      overdue: raw.overdue,
    }),
    raw,
  }
}
