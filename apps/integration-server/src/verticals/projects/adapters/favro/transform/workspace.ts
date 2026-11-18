import type { Workspace } from '../../../schema'
import { pickStr, strMap } from './shared'

/**
 * Favro organization → canonical workspace. Carries `organizationId`, `name`,
 * and a `sharedToUsers` array (`{ userId, role, joinDate }`); member count is
 * derived from that array.
 */
export interface RawFavroOrganization {
  organizationId: string
  name?: string
  sharedToUsers?: Array<{ userId: string; role?: string; joinDate?: string }>
  [key: string]: unknown
}

export function transformWorkspace(raw: RawFavroOrganization): Workspace {
  return {
    id: raw.organizationId,
    externalId: raw.organizationId,
    name: pickStr(raw.name) ?? '',
    memberCount: raw.sharedToUsers?.length,
    platform: 'favro',
    metadata: strMap({}),
    raw,
  }
}
