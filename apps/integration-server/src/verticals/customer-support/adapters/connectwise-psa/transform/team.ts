/**
 * ConnectWise PSA service board transform (mapped to Team).
 *
 * Source endpoint: GET /service/boards, GET /service/boards/{id}
 *
 * ConnectWise boards are the primary team/queue abstraction: tickets belong to
 * a board, board has members and work types. We expose each board as a Team.
 *
 * Key fields:
 *   id, name, location (site), department, inactiveFlag
 */
import type { Team } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawCwBoard {
  id: number
  name?: string
  /** Location/site this board is associated with */
  location?: { id?: number; name?: string } | null
  /** Department this board belongs to */
  department?: { id?: number; name?: string } | null
  /** true if board is disabled */
  inactiveFlag?: boolean
  projectFlag?: boolean
  _info?: {
    lastUpdated?: string
    [key: string]: unknown
  }
  [key: string]: unknown
}

export function transformTeam(raw: RawCwBoard): Team {
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    name: pickStr(raw.name) ?? '',
    platform: 'connectwise-psa',
    metadata: strMap({
      locationName: raw.location?.name,
      departmentName: raw.department?.name,
      inactiveFlag: raw.inactiveFlag,
      projectFlag: raw.projectFlag,
    }),
    raw,
  }
}
