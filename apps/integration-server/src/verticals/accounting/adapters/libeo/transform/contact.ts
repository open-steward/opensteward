import type { Contact } from '../../../schema/contact'
import { toWorkEmail, toAddress, nonempty } from '../../shared/transform'
import type { Telephone } from '../../../schema/shared'

export interface LibeoContact {
  id: string
  name: string
  registration_number: string
  vat_number: string
  email: string
  phone: string
  address_line1: string
  postal_code: string
  city: string
  country: string
  is_customer: boolean
  is_supplier: boolean
  is_active: boolean
  currency: string
  [key: string]: unknown
}

export function transformContact(raw: LibeoContact): Contact {
  const emails = toWorkEmail(raw.email)
  const telephones: Telephone[] = []
  if (raw.phone) telephones.push({ telephone: raw.phone, type: 'WORK' })

  return {
    id: String(raw.id),
    name: raw.name || undefined,
    identification: raw.registration_number || undefined,
    taxNumber: raw.vat_number || undefined,
    isCustomer: raw.is_customer ?? false,
    isSupplier: raw.is_supplier ?? false,
    isActive: raw.is_active,
    currency: raw.currency || undefined,
    emails: nonempty(emails),
    telephones: nonempty(telephones),
    billingAddress: toAddress({
      address1: raw.address_line1,
      city: raw.city,
      postalCode: raw.postal_code,
      country: raw.country,
    }),
    metadata: raw as Record<string, unknown>,
  }
}
