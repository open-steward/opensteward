/**
 * SnapEngage requester → canonical Contact.
 *
 * SnapEngage does not have a dedicated Contacts API endpoint.  Contacts
 * are synthesised from the per-case `requested_by` (email) and
 * `requester_details` fields returned by the Logs API.
 *
 * Because there is no stable numeric contact ID, we use the primary
 * email as the identifier.
 */
import type { Contact } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawSnapengageRequester {
  /** Primary email address (the `requested_by` field from the case) */
  email?: string
  name?: string
  phone?: string
  [key: string]: unknown
}

export function transformContact(raw: RawSnapengageRequester): Contact {
  const email = pickStr(raw.email) ?? ''
  return {
    id: email,
    externalId: email,
    email: email || undefined,
    name: pickStr(raw.name) ?? '',
    phone: pickStr(raw.phone),
    platform: 'snapengage',
    metadata: strMap({}),
    raw,
  }
}
