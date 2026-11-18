import type { Contact } from '../../../schema/contact'
import { toWorkEmail, toPhone, toAddress, nonempty } from '../../shared/transform'

export interface SilverfinContact {
  id: string | number
  name: string
  company_number: string
  vat_number: string
  email: string
  phone: string
  address: string
  city: string
  postal_code: string
  country: string
  is_client: boolean
  is_supplier: boolean
  [key: string]: unknown
}

export function transformContact(raw: SilverfinContact): Contact {
  const emails = toWorkEmail(raw.email)
  const phone = toPhone(raw.phone, 'WORK')
  const telephones = phone ? [phone] : []

  return {
    id: String(raw.id),
    name: raw.name || undefined,
    identification: raw.company_number || undefined,
    taxNumber: raw.vat_number || undefined,
    isCustomer: raw.is_client ?? false,
    isSupplier: raw.is_supplier ?? false,
    emails: nonempty(emails),
    telephones: nonempty(telephones),
    billingAddress: toAddress({
      address1: raw.address,
      city: raw.city,
      postalCode: raw.postal_code,
      country: raw.country,
    }),
    metadata: raw as Record<string, unknown>,
  }
}
