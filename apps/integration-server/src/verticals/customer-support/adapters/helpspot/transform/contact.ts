/**
 * HelpSpot address book contact -> canonical Contact transform.
 *
 * private.addressbook.getContacts returns contacts with fields:
 *   xContact        — contact ID
 *   sFirstName      — first name
 *   sLastName       — last name
 *   sEmail          — email address
 *   sPhone          — phone number
 *   sUserId         — customer / company identifier
 */
import type { Contact } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawHelpspotContact {
  xContact?: number | string
  sFirstName?: string
  sLastName?: string
  sEmail?: string
  sPhone?: string
  sUserId?: string
  [key: string]: unknown
}

export function transformContact(raw: RawHelpspotContact): Contact {
  const id = String(raw.xContact ?? raw.sEmail ?? '')
  const firstName = pickStr(raw.sFirstName) ?? ''
  const lastName = pickStr(raw.sLastName) ?? ''
  const name = ([firstName, lastName].filter(Boolean).join(' ') || pickStr(raw.sEmail)) ?? ''

  return {
    id,
    externalId: pickStr(raw.sUserId) ?? id,
    email: pickStr(raw.sEmail),
    name,
    phone: pickStr(raw.sPhone),
    platform: 'helpspot',
    metadata: strMap({}),
    raw,
  }
}
