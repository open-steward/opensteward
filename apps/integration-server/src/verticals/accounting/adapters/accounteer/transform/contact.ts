import type { Contact } from '../../../schema/contact'
import { toWorkEmail, toPhone, toAddress, nonempty } from '../../shared/transform'

export interface AccounteerContact {
  id: string
  name?: string
  email?: string
  phone?: string
  contact_type?: string
  tax_number?: string
  address?: string
  city?: string
  state?: string
  country?: string
  postal_code?: string
  is_active?: boolean
  [key: string]: unknown
}

export function transformContact(raw: AccounteerContact): Contact {
  const emails = toWorkEmail(raw.email)
  const phone = toPhone(raw.phone)
  const telephones = phone ? [phone] : []
  const type = raw.contact_type?.toLowerCase()

  return {
    id: String(raw.id),
    name: raw.name || undefined,
    taxNumber: raw.tax_number || undefined,
    isCustomer: type === 'customer' || type === 'both' || !type,
    isSupplier: type === 'supplier' || type === 'both',
    isActive: raw.is_active ?? true,
    emails: nonempty(emails),
    telephones: nonempty(telephones),
    billingAddress: toAddress({
      address1: raw.address,
      city: raw.city,
      region: raw.state,
      postalCode: raw.postal_code,
      country: raw.country,
    }),
    metadata: raw as Record<string, unknown>,
  }
}
