import type { Contact } from '../../../schema/contact'
import { toWorkEmail, toPhone, toAddress, nonempty } from '../../shared/transform'

export interface ClearBooksContact {
  entity_id: string | number
  company_name: string
  email: string
  phone: string
  address_1: string
  address_2: string
  town: string
  county: string
  postcode: string
  country: string
  is_customer: boolean
  is_supplier: boolean
  vat_number: string
  company_number: string
  [key: string]: unknown
}

export function transformContact(raw: ClearBooksContact): Contact {
  const emails = toWorkEmail(raw.email)
  const phone = toPhone(raw.phone, 'WORK')
  const telephones = phone ? [phone] : []

  return {
    id: String(raw.entity_id),
    name: raw.company_name || undefined,
    identification: raw.company_number || undefined,
    taxNumber: raw.vat_number || undefined,
    isCustomer: raw.is_customer ?? false,
    isSupplier: raw.is_supplier ?? false,
    emails: nonempty(emails),
    telephones: nonempty(telephones),
    billingAddress: toAddress({
      address1: raw.address_1,
      address2: raw.address_2,
      city: raw.town,
      region: raw.county,
      postalCode: raw.postcode,
      country: raw.country,
    }),
    metadata: raw as Record<string, unknown>,
  }
}
