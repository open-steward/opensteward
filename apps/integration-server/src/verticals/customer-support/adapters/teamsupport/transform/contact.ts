/**
 * TeamSupport contact transform.
 *
 * TeamSupport contact (end-user) fields from /api/json/contacts.json:
 *   ID, FirstName, LastName, Email, Phone, OrganizationID (customer company),
 *   IsActive, DateCreated.
 */
import type { Contact } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawTeamsupportContact {
  ID?: number | string
  FirstName?: string | null
  LastName?: string | null
  Email?: string | null
  Phone?: string | null
  OrganizationID?: number | string | null
  IsActive?: boolean | string
  DateCreated?: string | null
  [key: string]: unknown
}

function buildName(raw: RawTeamsupportContact): string {
  const first = pickStr(raw.FirstName) ?? ''
  const last = pickStr(raw.LastName) ?? ''
  const full = [first, last].filter(Boolean).join(' ')
  return full || ''
}

export function transformContact(raw: RawTeamsupportContact): Contact {
  return {
    id: String(raw.ID ?? ''),
    externalId: String(raw.ID ?? ''),
    email: pickStr(raw.Email),
    name: buildName(raw),
    phone: pickStr(raw.Phone),
    organizationId: raw.OrganizationID != null ? String(raw.OrganizationID) : undefined,
    platform: 'teamsupport',
    metadata: strMap({ IsActive: raw.IsActive }),
    raw,
  }
}
