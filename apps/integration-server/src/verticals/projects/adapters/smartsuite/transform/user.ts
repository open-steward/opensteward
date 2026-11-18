/**
 * SmartSuite members map to canonical Users.
 *
 * Members come from POST /api/v1/members/list/
 * (https://developers.smartsuite.com/docs/org_management/members/list-members),
 * fields per the Member Object
 * (https://developers.smartsuite.com/docs/org_management/members/member-object):
 *   id "Member's record id"
 *   full_name "Name of the Member" (a full name object; sys_root holds the
 *     whole name, e.g. "sys_root": "Jane Doe" in the documented example)
 *   email "array of strings" "Member's email address"
 *   role 'Member's role type, as a numeric string ADMIN = "1" ...'
 *   type 'Member's user type, as a numeric string EMPLOYEE = "1" ...'
 *   status "member status object" (e.g. "status": { "value": "1", ... })
 *
 * "Returned records do not include any fields with "empty" values, e.g. "",
 * [], or false." So an absent full_name is an empty name, and an absent email
 * list means no email.
 */
import type { User } from '../../../schema'
import { strMap } from './shared'

export interface RawSmartsuiteFullName {
  title?: string
  first_name?: string
  middle_name?: string
  last_name?: string
  sys_root?: string
}

export interface RawSmartsuiteMember {
  id: string
  full_name?: RawSmartsuiteFullName
  email?: string[]
  role?: string
  type?: string
  status?: { value?: string; updated_on?: string }
  [key: string]: unknown
}

/** `workspaceId` is the connection's ACCOUNT-ID: members are listed per workspace. */
export function transformUser(raw: RawSmartsuiteMember, workspaceId: string): User {
  if (typeof raw.id !== 'string' || raw.id.length === 0)
    throw new Error('SmartSuite member has no id')
  const email = Array.isArray(raw.email) ? raw.email[0] : undefined
  return {
    id: raw.id,
    externalId: raw.id,
    ...(email ? { email } : {}),
    name: raw.full_name?.sys_root ?? '',
    workspaceIds: workspaceId ? [workspaceId] : [],
    platform: 'smartsuite',
    metadata: strMap({
      role: raw.role,
      type: raw.type,
      status: raw.status?.value,
    }),
    raw,
  }
}
