/**
 * Transform a raw Ruddr project object into the canonical Project schema.
 *
 * Ruddr project statusId values:
 *   tentative | not_started | in_progress | paused | completed | cancelled
 *
 * recordStatusId: active | archived
 *
 * Docs: https://docs.ruddr.io/api-reference/projects/list-projects
 */
import type { Project, ProjectStatus } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface RawRuddrProject {
  id: string
  key?: string
  name?: string
  notes?: string | null
  statusId?: string
  start?: string | null
  end?: string | null
  code?: string | null
  poNumber?: string | null
  billingTypeId?: string
  isBillable?: boolean
  currency?: string
  recordStatusId?: string
  requiresTasks?: boolean
  client?: { id: string; name?: string } | null
  practice?: { id: string; name?: string } | null
  projectType?: { id: string; name?: string } | null
  projectGroup?: { id: string; name?: string } | null
  tags?: Array<{ id: string; name?: string }>
  salesRepresentative?: { id: string; name?: string } | null
  businessUnit?: { id: string; name?: string } | null
  createdAt?: string
  completedOn?: string | null
  [key: string]: unknown
}

function mapStatus(raw: RawRuddrProject): ProjectStatus {
  if (raw.recordStatusId === 'archived') return 'archived'
  switch (raw.statusId) {
    case 'in_progress':
      return 'active'
    case 'not_started':
    case 'tentative':
      // No canonical 'planned' status; surface as unknown for reconciliation.
      return 'unknown'
    case 'paused':
      return 'on_hold'
    case 'completed':
      return 'completed'
    case 'cancelled':
      // No canonical 'cancelled' status; surface as unknown for reconciliation.
      return 'unknown'
    default:
      return 'unknown'
  }
}

export function transformProject(raw: RawRuddrProject): Project {
  return {
    id: raw.id,
    externalId: raw.id,
    // Ruddr projects are workspace-scoped; the workspace ID is not embedded
    // in the project object — we use an empty string sentinel and callers
    // can populate it from the outer workspace context if needed.
    workspaceId: '',
    name: pickStr(raw.name) ?? '',
    description: pickStr(raw.notes ?? undefined),
    status: mapStatus(raw),
    // Ruddr does not have a direct project owner; use the sales rep if present.
    ownerId: pickStr(raw.salesRepresentative?.id),
    startDate: toIso(raw.start ?? undefined),
    endDate: toIso(raw.end ?? raw.completedOn ?? undefined),
    createdAt: toIso(raw.createdAt),
    updatedAt: undefined,
    platform: 'ruddr',
    metadata: strMap({
      key: raw.key,
      code: raw.code,
      poNumber: raw.poNumber,
      billingTypeId: raw.billingTypeId,
      isBillable: raw.isBillable,
      currency: raw.currency,
      clientId: raw.client?.id,
      clientName: raw.client?.name,
      practiceId: raw.practice?.id,
      projectTypeId: raw.projectType?.id,
      businessUnitId: raw.businessUnit?.id,
      recordStatusId: raw.recordStatusId,
    }),
    raw,
  }
}
