import type { Contact } from '../../../schema/contact'
import { toWorkEmail, toPhone, toAddress, nonempty } from '../../shared/transform'

export interface WafeqContactAddress {
  street?: string
  city?: string
  postal_code?: string
  country?: string
  [key: string]: unknown
}

export interface WafeqContact {
  id: string
  name?: string
  email?: string
  phone?: string
  address?: WafeqContactAddress
  tax_number?: string
  type?: string
  [key: string]: unknown
}

export function transformContact(raw: WafeqContact): Contact {
  const emails = toWorkEmail(raw.email)
  const phone = toPhone(raw.phone, 'WORK')
  const telephones = phone ? [phone] : []

  return {
    id: String(raw.id),
    name: raw.name || undefined,
    taxNumber: raw.tax_number || undefined,
    isCustomer: raw.type === 'customer' || raw.type === 'both',
    isSupplier: raw.type === 'supplier' || raw.type === 'both',
    emails: nonempty(emails),
    telephones: nonempty(telephones),
    billingAddress: toAddress({
      address1: raw.address?.street,
      city: raw.address?.city,
      postalCode: raw.address?.postal_code,
      country: raw.address?.country,
    }),
    metadata: raw as Record<string, unknown>,
  }
}
