/**
 * UVdesk customer (contact) transform.
 *
 * UVdesk customer wire shape (GET /{locale}/api/customers.json):
 *   id, email, name, firstName, lastName, isActive, isStarred,
 *   source, count, contactNumber
 *
 * Single customer (GET /{locale}/api/customer/{id}.json):
 *   id, email, firstName, lastName, isEnabled, isActive, isVerified,
 *   contactNumber, profileImagePath
 */
import type { Contact } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawUvdeskCustomer {
  id?: number | string
  email?: string
  name?: string
  firstName?: string
  lastName?: string
  isActive?: boolean
  isStarred?: boolean
  isEnabled?: boolean
  isVerified?: boolean
  source?: string
  count?: number
  contactNumber?: string | null
  profileImagePath?: string | null
  [key: string]: unknown
}

function resolveName(raw: RawUvdeskCustomer): string {
  if (raw.name) return String(raw.name)
  const first = raw.firstName ? String(raw.firstName) : ''
  const last = raw.lastName ? String(raw.lastName) : ''
  return `${first} ${last}`.trim()
}

export function transformContact(raw: RawUvdeskCustomer): Contact {
  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    email: pickStr(raw.email),
    name: resolveName(raw),
    phone: pickStr(raw.contactNumber),
    platform: 'uvdesk',
    metadata: strMap({
      isActive: raw.isActive,
      isStarred: raw.isStarred,
      source: raw.source,
    }),
    raw,
  }
}
