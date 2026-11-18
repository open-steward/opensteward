/**
 * HelpSpot active staff -> canonical User transform.
 *
 * private.util.getActiveStaff returns staff members with fields:
 *   xPerson         — staff ID
 *   sFname          — first name
 *   sLname          — last name
 *   sEmail          — email address
 *   fUserType       — 1=Admin, 2=Help Desk Staff, 3=Level 2, 4=Guest
 *   fDeleted        — 0=active, 1=deleted
 *   xGroup          — primary group/category assignment
 */
import type { User } from '../../../schema'
import { pickStr, strMap, pickNum } from './shared'

export interface RawHelpspotStaff {
  xPerson?: number | string
  sFname?: string
  sLname?: string
  sEmail?: string
  fUserType?: number | string
  fDeleted?: number | string
  xGroup?: number | string | null
  [key: string]: unknown
}

function mapRole(fUserType: number | undefined): string | undefined {
  switch (fUserType) {
    case 1: return 'admin'
    case 2: return 'agent'
    case 3: return 'agent'
    case 4: return 'guest'
    default: return undefined
  }
}

export function transformUser(raw: RawHelpspotStaff): User {
  const id = String(raw.xPerson ?? '')
  const firstName = pickStr(raw.sFname) ?? ''
  const lastName = pickStr(raw.sLname) ?? ''
  const name = ([firstName, lastName].filter(Boolean).join(' ') || pickStr(raw.sEmail)) ?? ''

  return {
    id,
    externalId: id,
    email: pickStr(raw.sEmail),
    name,
    role: mapRole(pickNum(raw.fUserType)),
    teamIds: raw.xGroup ? [String(raw.xGroup)] : [],
    platform: 'helpspot',
    metadata: strMap({ fUserType: raw.fUserType }),
    raw,
  }
}
