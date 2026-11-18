import type { Project, ProjectStatus } from '../../../schema'
import { pickStr, refId, refName, strMap, toIso, type CzReference } from './shared'

/**
 * A canonical Project maps to an AdaptiveWork **Project** entity (a WorkItem
 * subtype). `id` is the `/Project/<uuid>` URI; `Manager` is the owning user
 * reference. `State` is the project lifecycle ("Active", "On Hold",
 * "Completed", "Cancelled", "Draft", …).
 */
export interface RawClarizenProject {
  id: string
  Name?: string
  Description?: string
  State?: string | { id?: string; Name?: string }
  StartDate?: string
  DueDate?: string
  Manager?: CzReference
  CreatedOn?: string
  LastUpdatedOn?: string
  [key: string]: unknown
}

/** Read a State value whether it arrives as a bare string or a reference. */
function stateText(state: RawClarizenProject['State']): string | undefined {
  if (typeof state === 'string') return state
  return pickStr(state?.Name ?? state?.id)
}

function mapStatus(raw: RawClarizenProject): ProjectStatus {
  const s = (stateText(raw.State) ?? '').toLowerCase()
  if (s.includes('complet')) return 'completed'
  if (s.includes('cancel')) return 'archived'
  if (s.includes('hold') || s.includes('draft') || s.includes('proposed')) return 'on_hold'
  if (s.includes('active') || s.includes('progress')) return 'active'
  return 'active'
}

export function transformProject(raw: RawClarizenProject): Project {
  return {
    id: raw.id,
    externalId: raw.id,
    // AdaptiveWork has no per-project workspace; the org is the workspace and is
    // surfaced separately. Left empty here (no upstream reference on Project).
    workspaceId: '',
    name: pickStr(raw.Name) ?? '',
    description: pickStr(raw.Description),
    status: mapStatus(raw),
    ownerId: refId(raw.Manager),
    startDate: toIso(raw.StartDate),
    endDate: toIso(raw.DueDate),
    createdAt: toIso(raw.CreatedOn),
    updatedAt: toIso(raw.LastUpdatedOn),
    platform: 'planview-adaptivework',
    metadata: strMap({
      state: stateText(raw.State),
      managerName: refName(raw.Manager),
    }),
    raw,
  }
}
