import type { Contact } from '../../../schema/contact'
import { espoDatetimeToIso } from './datetime'
import { requireString } from './required'

// EspoCRM Contact entity fields
export interface RawEspoCrmContact {
  id?: string
  firstName?: string
  lastName?: string
  emailAddress?: string
  phoneNumber?: string
  /**
   * spec.json Contact.phoneNumberData: "Multiple phone numbers.", items
   * {phoneNumber: string, primary: boolean, type: enum ["Mobile","Office","Home","Fax","Other"]}.
   */
  phoneNumberData?: { phoneNumber: string; primary: boolean; type?: string }[] | null
  accountId?: string
  assignedUserId?: string
  createdAt?: string
  modifiedAt?: string
  [key: string]: unknown
}

export function transformContact(raw: RawEspoCrmContact): Contact {
  return {
    id: requireString(raw.id, 'Contact.id'),
    first_name: raw.firstName,
    last_name: raw.lastName,
    name: [raw.firstName, raw.lastName].filter(Boolean).join(' ') || undefined,
    email: raw.emailAddress,
    phone: raw.phoneNumber,
    mobile: raw.phoneNumberData?.find((p) => p.type === 'Mobile')?.phoneNumber,
    company_id: raw.accountId,
    owner_id: raw.assignedUserId,
    created_at: espoDatetimeToIso(raw.createdAt),
    updated_at: espoDatetimeToIso(raw.modifiedAt),
    metadata: raw,
  }
}

export function untransformContact(data: Partial<Contact>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.first_name !== undefined) out.firstName = data.first_name
  if (data.last_name !== undefined) out.lastName = data.last_name
  if (data.email !== undefined) out.emailAddress = data.email
  if (data.phone !== undefined) out.phoneNumber = data.phone
  if (data.mobile !== undefined) out.mobilePhoneNumber = data.mobile
  if (data.company_id !== undefined) out.accountId = data.company_id
  return out
}
