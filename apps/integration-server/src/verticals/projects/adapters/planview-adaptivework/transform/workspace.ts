import type { Workspace } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

/**
 * A canonical Workspace maps to the AdaptiveWork **Organization** — the single
 * tenant that owns all projects, tasks, and users for a connection. `id` is the
 * `/Organization/<uuid>` URI returned by login (`organizationId`) and resolved
 * via `data/objects/Organization/<uuid>`.
 */
export interface RawClarizenOrganization {
  id: string
  Name?: string
  CreatedOn?: string
  LastUpdatedOn?: string
  [key: string]: unknown
}

export function transformWorkspace(raw: RawClarizenOrganization): Workspace {
  return {
    id: raw.id,
    externalId: raw.id,
    name: pickStr(raw.Name) ?? '',
    platform: 'planview-adaptivework',
    metadata: strMap({
      createdOn: toIso(raw.CreatedOn),
      updatedOn: toIso(raw.LastUpdatedOn),
    }),
    raw,
  }
}
