/**
 * Transform an eGain User (agent) into the canonical OpenSteward User schema.
 *
 * eGain User endpoint: GET /ws/v12/administration/user/{ids}
 * Schema documented at:
 *   https://hd.egain.com/api/authoring_interaction_api_reference/html/dc/dba/
 *   classadministration_1_1pages_1_1user_1_1examples_1_1_user_by_i_ds_examples.html
 */
import type { User } from '../../../schema'
import { pickStr, strMap } from './shared'

interface EgainUserGroup {
  id?: number | string
  name?: string
  department?: { id?: number | string; name?: string }
  [key: string]: unknown
}

/**
 * Raw eGain user object as returned by GET /ws/v12/administration/user.
 */
export interface RawEgainUser {
  id: number | string
  firstName?: string
  lastName?: string
  screenName?: string
  loginId?: string
  emailAddress?: string
  mobileNumber?: string
  status?: {
    value?: string
    displayValue?: string
  }
  department?: {
    id?: number | string
    name?: string
  }
  groups?: {
    group?: EgainUserGroup[]
  }
  manager?: {
    id?: number | string
    name?: string
    firstName?: string
    lastName?: string
  }
  created?: { date?: string }
  lastModified?: { date?: string }
  [key: string]: unknown
}

function buildName(raw: RawEgainUser): string {
  const parts = [raw.firstName, raw.lastName].filter(Boolean)
  if (parts.length > 0) return parts.join(' ')
  return pickStr(raw.screenName) ?? pickStr(raw.loginId) ?? ''
}

export function transformUser(raw: RawEgainUser): User {
  const groups = raw.groups?.group ?? []
  const teamIds = groups.map((g) => String(g.id)).filter(Boolean)

  return {
    id: String(raw.id),
    externalId: String(raw.id),
    email: pickStr(raw.emailAddress),
    name: buildName(raw),
    role: pickStr(raw.status?.value),
    teamIds,
    platform: 'egain',
    metadata: strMap({
      loginId: raw.loginId,
      screenName: raw.screenName,
      statusDisplay: raw.status?.displayValue,
      departmentName: raw.department?.name,
      managerName: raw.manager?.name,
    }),
    raw,
  }
}
