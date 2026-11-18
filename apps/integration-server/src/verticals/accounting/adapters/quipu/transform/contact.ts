import type { Contact } from '../../../schema/contact'
import { toWorkEmail, toPhone, toAddress, nonempty } from '../../shared/transform'

export interface QuipuContact {
  id: string
  name: string
  tax_id: string
  email: string
  phone: string
  address: string
  city: string
  zip_code: string
  country_code: string
  region: string
  is_customer: boolean
  is_supplier: boolean
  active: boolean
  currency: string
  [key: string]: unknown
}

export function transformContact(raw: QuipuContact): Contact {
  const emails = toWorkEmail(raw.email)
  const phone = toPhone(raw.phone)
  const telephones = phone ? [phone] : []

  return {
    id: raw.id,
    name: raw.name || undefined,
    identification: raw.tax_id || undefined,
    isCustomer: raw.is_customer,
    isSupplier: raw.is_supplier,
    isActive: raw.active,
    currency: raw.currency || undefined,
    emails: nonempty(emails),
    telephones: nonempty(telephones),
    billingAddress: toAddress({
      address1: raw.address,
      city: raw.city,
      postalCode: raw.zip_code,
      country: raw.country_code,
      region: raw.region,
    }),
    metadata: raw as Record<string, unknown>,
  }
}
