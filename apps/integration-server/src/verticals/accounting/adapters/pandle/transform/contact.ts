import type { Contact } from '../../../schema/contact'
import { toWorkEmail, toPhone, toAddress, nonempty } from '../../shared/transform'

export interface PandleContact {
  id: number
  name: string
  company_name: string
  email: string
  phone: string
  mobile: string
  vat_number: string
  address_line_1: string
  address_line_2: string
  city: string
  region: string
  postcode: string
  country: string
  contact_type: string
  is_active: boolean
  [key: string]: unknown
}

export function transformContact(raw: PandleContact): Contact {
  const emails = toWorkEmail(raw.email)
  const telephones = [
    toPhone(raw.phone, 'WORK'),
    toPhone(raw.mobile, 'MOBILE'),
  ].filter(Boolean) as NonNullable<ReturnType<typeof toPhone>>[]

  const isCustomer = raw.contact_type === 'customer' || raw.contact_type === 'both'
  const isSupplier = raw.contact_type === 'supplier' || raw.contact_type === 'both'

  return {
    id: String(raw.id),
    name: raw.name || undefined,
    companyName: raw.company_name || undefined,
    taxNumber: raw.vat_number || undefined,
    isCustomer,
    isSupplier,
    isActive: raw.is_active ?? true,
    emails: nonempty(emails),
    telephones: nonempty(telephones),
    billingAddress: toAddress({
      address1: raw.address_line_1,
      address2: raw.address_line_2,
      city: raw.city,
      region: raw.region,
      postalCode: raw.postcode,
      country: raw.country,
    }),
    metadata: raw as Record<string, unknown>,
  }
}
