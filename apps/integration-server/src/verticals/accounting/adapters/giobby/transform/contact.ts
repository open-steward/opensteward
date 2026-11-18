import type { Contact } from '../../../schema/contact'
import { toWorkEmail, toAddress, nonempty } from '../../shared/transform'

export interface GiobbyContact {
  id: string
  name: string
  vat_number: string
  tax_code: string
  email: string
  phone: string
  address: string
  city: string
  postal_code: string
  province: string
  country: string
  currency: string
  is_active: boolean
  type: string
  [key: string]: unknown
}

export function transformContact(raw: GiobbyContact): Contact {
  const emails = toWorkEmail(raw.email)

  return {
    id: String(raw.id),
    name: raw.name || undefined,
    identification: raw.tax_code || undefined,
    taxNumber: raw.vat_number || undefined,
    isCustomer: raw.type === 'customer' || raw.type === 'both',
    isSupplier: raw.type === 'supplier' || raw.type === 'both',
    isActive: raw.is_active,
    currency: raw.currency || undefined,
    emails: nonempty(emails),
    billingAddress: toAddress({
      address1: raw.address,
      city: raw.city,
      postalCode: raw.postal_code,
      region: raw.province,
      country: raw.country,
    }),
    metadata: raw as Record<string, unknown>,
  }
}
