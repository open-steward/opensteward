/**
 * Transform a raw Jitbit Helpdesk user (end-user / submitter) to the canonical
 * Contact schema.
 *
 * GET /Users returns all users; we filter to non-tech, non-admin users at the
 * adapter layer (IsTech === false && IsAdmin === false).
 * GET /User?userId={id} returns a single user object.
 *
 * Jitbit has no separate "contact" resource — contacts are regular users that
 * are not technicians or admins.
 */
import type { Contact } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawJitbitUser {
  UserID?: number
  Username?: string
  FirstName?: string
  LastName?: string
  Email?: string
  Phone?: string | null
  CompanyName?: string | null
  CompanyId?: number | null
  DepartmentID?: number | null
  Location?: string | null
  IsAdmin?: boolean
  IsTech?: boolean
  Disabled?: boolean
  Notes?: string | null
  [key: string]: unknown
}

export function transformContact(raw: RawJitbitUser): Contact {
  const firstName = pickStr(raw.FirstName) ?? ''
  const lastName = pickStr(raw.LastName) ?? ''
  const fullName = [firstName, lastName].filter(Boolean).join(' ') || (pickStr(raw.Username) ?? '')

  return {
    id: String(raw.UserID ?? ''),
    externalId: String(raw.UserID ?? ''),
    email: pickStr(raw.Email),
    name: fullName,
    phone: pickStr(raw.Phone),
    organizationId: raw.CompanyId != null ? String(raw.CompanyId) : undefined,
    platform: 'jitbit-helpdesk',
    metadata: strMap({
      username: raw.Username,
      companyName: raw.CompanyName,
      location: raw.Location,
      disabled: raw.Disabled,
      departmentId: raw.DepartmentID,
    }),
    raw,
  }
}
