/**
 * Vivantio User (technician/agent) → canonical User transform.
 *
 * Vivantio's /api/Configuration/UserSelectAll returns User objects.
 * Key fields: Id, FullName, FirstName, LastName, EmailAddress,
 * IsAdmin, Enabled, AllowApiAccess, JobTitle, Phone1.
 */
import type { User } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawVivantioUser {
  Id: number
  FullName?: string | null
  FirstName?: string | null
  LastName?: string | null
  EmailAddress?: string | null
  DomainLoginName?: string | null
  IsAdmin?: boolean
  Enabled?: boolean
  AllowApiAccess?: boolean
  JobTitle?: string | null
  Phone1?: string | null
  Phone2?: string | null
  [key: string]: unknown
}

export function transformUser(raw: RawVivantioUser): User {
  const displayName =
    pickStr(raw.FullName) ??
    [pickStr(raw.FirstName), pickStr(raw.LastName)].filter(Boolean).join(' ') ??
    ''

  const role = raw.IsAdmin === true ? 'admin' : 'agent'

  return {
    id: String(raw.Id),
    externalId: String(raw.Id),
    email: pickStr(raw.EmailAddress),
    name: displayName,
    role,
    teamIds: [],
    platform: 'vivantio',
    metadata: strMap({
      jobTitle: raw.JobTitle,
      phone: raw.Phone1,
      domainLoginName: raw.DomainLoginName,
      enabled: raw.Enabled,
    }),
    raw,
  }
}
