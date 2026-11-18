import type { Contact } from '../../../schema/contact'
import {
  optDate,
  optKey,
  optString,
  primaryAddress,
  requireKey,
  soleEmail,
  solePhone,
  type RawSageCrmAddress,
  type RawSageCrmEmail,
  type RawSageCrmPhone,
} from '../records'

/** components.schemas.Person of the Sage CRM 2024 R2 RESTful API reference (fields read here). */
export interface RawSageCrmPerson {
  Pers_PersonId?: number
  Pers_FirstName?: string
  Pers_LastName?: string
  Pers_Title?: string
  Pers_CompanyId?: number
  Pers_PrimaryuserId?: string
  Pers_PrimaryAddressId?: number
  Pers_CreatedDate?: string
  Pers_UpdatedDate?: string
  Email?: RawSageCrmEmail[]
  Phone?: RawSageCrmPhone[]
  Address?: RawSageCrmAddress[]
  [key: string]: unknown
}

export function transformContact(raw: RawSageCrmPerson): Contact {
  const first = optString(raw.Pers_FirstName)
  const last = optString(raw.Pers_LastName)
  const name = [first, last].filter(Boolean).join(' ')
  return {
    id: requireKey(raw.Pers_PersonId, 'Pers_PersonId'),
    first_name: first,
    last_name: last,
    name: name || undefined,
    email: soleEmail(raw.Email),
    phone: solePhone(raw.Phone),
    title: optString(raw.Pers_Title),
    company_id: optKey(raw.Pers_CompanyId),
    owner_id: optString(raw.Pers_PrimaryuserId),
    address: primaryAddress(raw.Address, raw.Pers_PrimaryAddressId),
    created_at: optDate(raw.Pers_CreatedDate),
    updated_at: optDate(raw.Pers_UpdatedDate),
    metadata: raw,
  }
}

// Write mapping below is unchanged by the read rebuild (write methods are out
// of its scope); its field names are not from the documented Person schema.
export function untransformContact(data: Partial<Contact>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.first_name !== undefined) out.pers_firstname = data.first_name
  if (data.last_name !== undefined) out.pers_lastname = data.last_name
  if (data.email !== undefined) out.pers_emailaddress = data.email
  if (data.phone !== undefined) out.pers_phone = data.phone
  if (data.mobile !== undefined) out.pers_mobilephone = data.mobile
  if (data.company_id !== undefined) out.comp_companyid = Number(data.company_id)
  return out
}
