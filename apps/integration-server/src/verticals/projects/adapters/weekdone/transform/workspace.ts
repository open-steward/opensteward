/**
 * Weekdone team → canonical Workspace.
 *
 * GET /teams returns:
 *   { status: 'ok', teams: [{ id, name, privacy, external_reports, ... }] }
 */
import type { Workspace } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawWeekdoneTeam {
  id: number | string
  name?: string
  privacy?: number
  external_reports?: string
  [key: string]: unknown
}

export function transformWorkspace(raw: RawWeekdoneTeam): Workspace {
  const id = String(raw.id)
  return {
    id,
    externalId: id,
    name: pickStr(raw.name) ?? '',
    platform: 'weekdone',
    metadata: strMap({
      privacy: raw.privacy,
      externalReports: raw.external_reports,
    }),
    raw,
  }
}
