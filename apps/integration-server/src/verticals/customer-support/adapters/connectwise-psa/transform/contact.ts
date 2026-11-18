/**
 * ConnectWise PSA contact transform.
 *
 * Source endpoint: GET /company/contacts, GET /company/contacts/{id}
 *
 * Key fields:
 *   id, firstName, lastName, company (id, name), defaultPhoneNbr / phoneNumbers[],
 *   communicationItems (type.name="Email" → value is email address)
 */
import type { Contact } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawCwContact {
  id: number
  firstName?: string
  lastName?: string
  /** Parent company */
  company?: { id?: number; name?: string } | null
  /** Direct phone number shorthand — populated by PSA for some configurations */
  defaultPhoneNbr?: string | null
  /** Communication items (email, phone, etc.) */
  communicationItems?: Array<{
    type?: { id?: number; name?: string }
    value?: string
    communicationType?: string
    defaultFlag?: boolean
  }>
  _info?: {
    dateEntered?: string
    lastUpdated?: string
    [key: string]: unknown
  }
  [key: string]: unknown
}

function extractEmail(raw: RawCwContact): string | undefined {
  const items = raw.communicationItems ?? []
  // Prefer default email, then first email
  const defaultEmail = items.find(
    (i) =>
      i.defaultFlag === true &&
      (i.communicationType === 'Email' || i.type?.name?.toLowerCase() === 'email'),
  )
  if (defaultEmail?.value) return pickStr(defaultEmail.value)

  const anyEmail = items.find(
    (i) => i.communicationType === 'Email' || i.type?.name?.toLowerCase() === 'email',
  )
  return pickStr(anyEmail?.value)
}

function extractPhone(raw: RawCwContact): string | undefined {
  if (raw.defaultPhoneNbr) return pickStr(raw.defaultPhoneNbr)
  const items = raw.communicationItems ?? []
  const phone = items.find(
    (i) => i.communicationType === 'Phone' || i.type?.name?.toLowerCase().includes('phone'),
  )
  return pickStr(phone?.value)
}

export function transformContact(raw: RawCwContact): Contact {
  const firstName = pickStr(raw.firstName) ?? ''
  const lastName = pickStr(raw.lastName) ?? ''
  const name = [firstName, lastName].filter(Boolean).join(' ')

  return {
    id: String(raw.id),
    externalId: String(raw.id),
    email: extractEmail(raw),
    name,
    phone: extractPhone(raw),
    organizationId: raw.company?.id ? String(raw.company.id) : undefined,
    platform: 'connectwise-psa',
    metadata: strMap({
      companyName: raw.company?.name,
    }),
    raw,
  }
}
