import type { Contact } from '../../../schema/contact'
import { toWorkEmail, toAddress, nonempty } from '../../shared/transform'

export interface SuperbillContact {
  id: string
  name: string
  vat_number: string
  fiscal_code: string
  email: string
  phone: string
  address: string
  city: string
  zip_code: string
  province: string
  country: string
  currency: string
  active: boolean
  contact_type: string
  [key: string]: unknown
}

export function transformContact(raw: SuperbillContact): Contact {
  const emails = toWorkEmail(raw.email)

  return {
    id: String(raw.id),
    name: raw.name || undefined,
    identification: raw.fiscal_code || undefined,
    taxNumber: raw.vat_number || undefined,
    isCustomer: raw.contact_type === 'customer' || raw.contact_type === 'both',
    isSupplier: raw.contact_type === 'supplier' || raw.contact_type === 'both',
    isActive: raw.active,
    currency: raw.currency || undefined,
    emails: nonempty(emails),
    billingAddress: toAddress({
      address1: raw.address,
      city: raw.city,
      postalCode: raw.zip_code,
      region: raw.province,
      country: raw.country,
    }),
    metadata: raw as Record<string, unknown>,
  }
}
