import type { Contact } from '../../../schema/contact'
import { toWorkEmail, toPhone, toAddress, nonempty } from '../../shared/transform'

export interface BexioContact {
  id: number
  nr: string
  contact_type_id: number
  name_1: string
  name_2: string
  mail: string
  phone_fixed: string
  phone_mobile: string
  fax: string
  address: string
  postcode: string
  city: string
  country_id: number
  country_code: string
  is_lead: boolean
  updated_at: string
  [key: string]: unknown
}

export function transformContact(raw: BexioContact): Contact {
  const emails = toWorkEmail(raw.mail)
  const telephones = [
    toPhone(raw.phone_fixed, 'WORK'),
    toPhone(raw.phone_mobile, 'MOBILE'),
    toPhone(raw.fax, 'FAX'),
  ].filter(Boolean) as NonNullable<ReturnType<typeof toPhone>>[]

  // contact_type_id: 1 = company, 2 = person
  const isCompany = raw.contact_type_id === 1

  return {
    id: String(raw.id),
    name: raw.name_1 || undefined,
    companyName: isCompany ? raw.name_1 || undefined : undefined,
    firstName: !isCompany ? raw.name_1 || undefined : undefined,
    lastName: !isCompany ? raw.name_2 || undefined : undefined,
    isCustomer: raw.contact_type_id === 1 || raw.contact_type_id === 2,
    isSupplier: false,
    isActive: true,
    emails: nonempty(emails),
    telephones: nonempty(telephones),
    billingAddress: toAddress({
      address1: raw.address,
      city: raw.city,
      postalCode: raw.postcode,
      country: raw.country_code,
    }),
    updatedAt: raw.updated_at ? new Date(raw.updated_at) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
