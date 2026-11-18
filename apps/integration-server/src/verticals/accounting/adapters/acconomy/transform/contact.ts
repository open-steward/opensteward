import type { Contact } from '../../../schema/contact'
import { toWorkEmail, toAddress, toPhone, nonempty } from '../../shared/transform'

export interface AcconomyContact {
  id: number | string
  name?: string
  email?: string
  phone?: string
  address?: string
  city?: string
  postal_code?: string
  country?: string
  org_nr?: string
  vat_nr?: string
  is_customer?: boolean
  is_supplier?: boolean
  [key: string]: unknown
}

export function transformContact(raw: AcconomyContact): Contact {
  const emails = toWorkEmail(raw.email)
  const phone = toPhone(raw.phone)
  return {
    id: String(raw.id),
    name: raw.name || undefined,
    identification: raw.org_nr || raw.vat_nr || undefined,
    isCustomer: raw.is_customer ?? true,
    isSupplier: raw.is_supplier ?? false,
    emails: nonempty(emails),
    telephones: phone ? [phone] : undefined,
    billingAddress: toAddress({
      address1: raw.address,
      city: raw.city,
      postalCode: raw.postal_code,
      country: raw.country,
    }),
    metadata: raw as Record<string, unknown>,
  }
}
