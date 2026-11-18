import type { Contact } from '../../../schema/contact'
import { toWorkEmail, toPhone, toAddress, composeName, nonempty } from '../../shared/transform'

export interface SellsyContact {
  id: string
  first_name: string
  last_name: string
  company_name: string
  email: string
  phone: string
  mobile: string
  siret: string
  vat_number: string
  is_customer: boolean
  is_supplier: boolean
  currency: string
  address_line_1: string
  address_line_2: string
  city: string
  postal_code: string
  region: string
  country: string
  [key: string]: unknown
}

export function transformContact(raw: SellsyContact): Contact {
  const emails = toWorkEmail(raw.email)
  const telephones = [toPhone(raw.phone, 'WORK'), toPhone(raw.mobile, 'MOBILE')].filter(
    Boolean,
  ) as NonNullable<ReturnType<typeof toPhone>>[]

  return {
    id: raw.id,
    name: composeName(raw.company_name, raw.first_name, raw.last_name),
    firstName: raw.first_name || undefined,
    lastName: raw.last_name || undefined,
    companyName: raw.company_name || undefined,
    taxNumber: raw.vat_number || undefined,
    identification: raw.siret || undefined,
    isCustomer: raw.is_customer,
    isSupplier: raw.is_supplier,
    isActive: true,
    currency: raw.currency || undefined,
    emails: nonempty(emails),
    telephones: nonempty(telephones),
    billingAddress: toAddress({
      address1: raw.address_line_1,
      address2: raw.address_line_2,
      city: raw.city,
      postalCode: raw.postal_code,
      region: raw.region,
      country: raw.country,
    }),
    metadata: raw as Record<string, unknown>,
  }
}
