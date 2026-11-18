import type { Tag } from '../../../schema'
import { pickStr, strMap } from './shared'

/**
 * Nifty label (GET /labels → `items`). Labels are team-scoped (no project or
 * subteam ownership), so the canonical `workspaceId` carries the owning team.
 */
export interface RawNiftyLabel {
  id: string
  name?: string
  color?: string | null
  type?: string | null
  team?: string | null
  created_by?: string | null
  default?: boolean
  [key: string]: unknown
}

export function transformTag(raw: RawNiftyLabel): Tag {
  return {
    id: raw.id,
    externalId: raw.id,
    workspaceId: pickStr(raw.team) ?? '',
    name: pickStr(raw.name) ?? '',
    color: pickStr(raw.color),
    platform: 'nifty',
    metadata: strMap({
      type: raw.type,
      createdBy: raw.created_by,
      default: raw.default,
    }),
    raw,
  }
}
