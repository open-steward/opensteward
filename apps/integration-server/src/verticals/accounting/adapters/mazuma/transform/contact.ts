import type { Contact } from '../../../schema/contact'
import { toWorkEmail, toPhone, toAddress, nonempty } from '../../shared/transform'

export interface MazumaContact {
  id: string
  name?: string
  email?: string
  phone?: string
  contact_type?: string
  address_line_1?: string
  address_line_2?: string
  city?: string
  county?: string
  postcode?: string
  country?: string
  is_active?: boolean
  [key: string]: unknown
}

export function transformContact(raw: MazumaContact): Contact {
  const emails = toWorkEmail(raw.email)
  const phone = toPhone(raw.phone)
  const telephones = phone ? [phone] : []
  const type = raw.contact_type?.toLowerCase()

  return {
    id: String(raw.id),
    name: raw.name || undefined,
    isCustomer: type === 'customer' || type === 'both' || !type,
    isSupplier: type === 'supplier' || type === 'both',
    isActive: raw.is_active ?? true,
    emails: nonempty(emails),
    telephones: nonempty(telephones),
    billingAddress: toAddress({
      address1: raw.address_line_1,
      address2: raw.address_line_2,
      city: raw.city,
      region: raw.county,
      postalCode: raw.postcode,
      country: raw.country,
    }),
    metadata: raw as Record<string, unknown>,
  }
}
