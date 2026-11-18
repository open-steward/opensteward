/**
 * ProjectManager workspace → canonical Workspace transform.
 *
 * WorkspaceDto is derived from the /api/data/me endpoint which returns the
 * authenticated user's workspace info. Fields (v4):
 *   workSpaceId (uuid), workSpaceName, workSpaceStatus,
 *   workSpaceIsActive, workSpaceCountry, workSpaceCountryCode
 *
 * Docs: https://developer.projectmanager.com/api-reference/me/retrieve-me
 */
import type { Workspace } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawProjectManagerWorkspace {
  workSpaceId: string
  workSpaceName?: string | null
  workSpaceStatus?: string | null
  workSpaceIsActive?: boolean | null
  workSpaceCountry?: string | null
  workSpaceCountryCode?: string | null
  [key: string]: unknown
}

export function transformWorkspace(raw: RawProjectManagerWorkspace): Workspace {
  return {
    id: raw.workSpaceId,
    externalId: raw.workSpaceId,
    name: pickStr(raw.workSpaceName ?? undefined) ?? '',
    platform: 'projectmanager',
    metadata: strMap({
      workSpaceStatus: raw.workSpaceStatus,
      workSpaceIsActive: raw.workSpaceIsActive,
      workSpaceCountry: raw.workSpaceCountry,
      workSpaceCountryCode: raw.workSpaceCountryCode,
    }),
    raw,
  }
}
