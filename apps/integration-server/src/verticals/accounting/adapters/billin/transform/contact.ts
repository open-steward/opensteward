import type { Contact } from '../../../schema/contact'
import { toWorkEmail, toPhone, toAddress, nonempty } from '../../shared/transform'

export interface BillinContact {
  id: string
  name: string
  tax_id: string
  email: string
  phone: string
  address: string
  city: string
  postal_code: string
  country: string
  region: string
  is_customer: boolean
  is_supplier: boolean
  active: boolean
  currency: string
  [key: string]: unknown
}

export function transformContact(raw: BillinContact): Contact {
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
      postalCode: raw.postal_code,
      country: raw.country,
      region: raw.region,
    }),
    metadata: raw as Record<string, unknown>,
  }
}
