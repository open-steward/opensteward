import type { Contact } from '../../../schema/contact'
import { toWorkEmail, toPhone, toAddress, nonempty } from '../../shared/transform'

export interface UhasibuContact {
  id: string
  name?: string
  email?: string
  phone?: string
  type?: string
  tax_number?: string
  address?: string
  city?: string
  region?: string
  postal_code?: string
  country?: string
  is_customer?: boolean
  is_supplier?: boolean
  is_active?: boolean
  [key: string]: unknown
}

export function transformContact(raw: UhasibuContact): Contact {
  const emails = toWorkEmail(raw.email)
  const phone = toPhone(raw.phone)
  const telephones = phone ? [phone] : []
  const type = raw.type?.toLowerCase()

  return {
    id: String(raw.id),
    name: raw.name || undefined,
    taxNumber: raw.tax_number || undefined,
    isCustomer: raw.is_customer ?? (type === 'customer' || type === 'both' || !type),
    isSupplier: raw.is_supplier ?? (type === 'supplier' || type === 'both'),
    isActive: raw.is_active ?? true,
    emails: nonempty(emails),
    telephones: nonempty(telephones),
    billingAddress: toAddress({
      address1: raw.address,
      city: raw.city,
      region: raw.region,
      postalCode: raw.postal_code,
      country: raw.country,
    }),
    metadata: raw as Record<string, unknown>,
  }
}
