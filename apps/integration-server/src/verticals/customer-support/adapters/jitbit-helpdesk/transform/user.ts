/**
 * Transform a raw Jitbit Helpdesk technician/admin to the canonical User schema.
 *
 * Jitbit does not have a separate "agents" endpoint. GET /Users returns all
 * users; at the adapter layer we filter to IsTech === true OR IsAdmin === true
 * to get the support-staff subset.
 */
import type { User } from '../../../schema'
import { pickStr, strMap } from './shared'

// RawJitbitUser is the same shape used by both contact and user transforms
export type { RawJitbitUser } from './contact'
import type { RawJitbitUser } from './contact'

export function transformUser(raw: RawJitbitUser): User {
  const firstName = pickStr(raw.FirstName) ?? ''
  const lastName = pickStr(raw.LastName) ?? ''
  const fullName = [firstName, lastName].filter(Boolean).join(' ') || (pickStr(raw.Username) ?? '')

  const role = raw.IsAdmin ? 'admin' : raw.IsTech ? 'agent' : 'user'

  return {
    id: String(raw.UserID ?? ''),
    externalId: String(raw.UserID ?? ''),
    email: pickStr(raw.Email),
    name: fullName,
    role,
    teamIds: [],  // Jitbit users belong to categories, not teams
    platform: 'jitbit-helpdesk',
    metadata: strMap({
      username: raw.Username,
      isAdmin: raw.IsAdmin,
      isTech: raw.IsTech,
      disabled: raw.Disabled,
      departmentId: raw.DepartmentID,
      companyName: raw.CompanyName,
    }),
    raw,
  }
}
