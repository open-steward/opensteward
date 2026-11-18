/**
 * LiveHelpNow department → canonical Team transform.
 *
 * Wire shape from GET /api/departments.
 *
 * Transforms NEVER throw; missing optional fields return undefined.
 */
import type { Team } from '../../../schema'
import { pickStr, strMap } from './shared'

/** Shape from GET /api/departments */
export interface RawLivehelpnowDepartment {
  department_id: number
  department_name?: string | null
  department_email?: string | null
  department_description?: string | null
  [key: string]: unknown
}

export function transformTeam(raw: RawLivehelpnowDepartment): Team {
  return {
    id: String(raw.department_id),
    externalId: String(raw.department_id),
    name: pickStr(raw.department_name) ?? '',
    platform: 'livehelpnow',
    metadata: strMap({
      email: raw.department_email,
      description: raw.department_description,
    }),
    raw,
  }
}
