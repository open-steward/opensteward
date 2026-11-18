import type { Contact } from '../../../schema/contact'
import { toWorkEmail, toPhone, toAddress, nonempty } from '../../shared/transform'

export interface SmaccContact {
  id: string
  name?: string
  email?: string
  phone?: string
  type?: string
  vat_number?: string
  street?: string
  city?: string
  zip?: string
  country?: string
  is_customer?: boolean
  is_supplier?: boolean
  is_active?: boolean
  [key: string]: unknown
}

export function transformContact(raw: SmaccContact): Contact {
  const emails = toWorkEmail(raw.email)
  const phone = toPhone(raw.phone)
  const telephones = phone ? [phone] : []
  const type = raw.type?.toLowerCase()

  return {
    id: String(raw.id),
    name: raw.name || undefined,
    taxNumber: raw.vat_number || undefined,
    isCustomer: raw.is_customer ?? (type === 'customer' || type === 'both' || !type),
    isSupplier: raw.is_supplier ?? (type === 'supplier' || type === 'both'),
    isActive: raw.is_active ?? true,
    emails: nonempty(emails),
    telephones: nonempty(telephones),
    billingAddress: toAddress({
      address1: raw.street,
      city: raw.city,
      postalCode: raw.zip,
      country: raw.country,
    }),
    metadata: raw as Record<string, unknown>,
  }
}
