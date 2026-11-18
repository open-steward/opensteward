import type { Contact } from '../../../schema/contact'
import { toWorkEmail, toAddress, toPhone, nonempty } from '../../shared/transform'

export interface WintContact {
  id: number | string
  name?: string
  email?: string
  phone?: string
  address?: string
  city?: string
  zip?: string
  country?: string
  org_nr?: string
  customer?: boolean
  supplier?: boolean
  [key: string]: unknown
}

export function transformContact(raw: WintContact): Contact {
  const emails = toWorkEmail(raw.email)
  const phone = toPhone(raw.phone)
  return {
    id: String(raw.id),
    name: raw.name || undefined,
    identification: raw.org_nr || undefined,
    isCustomer: raw.customer ?? true,
    isSupplier: raw.supplier ?? false,
    isActive: true,
    emails: nonempty(emails),
    telephones: phone ? [phone] : undefined,
    billingAddress: toAddress({
      address1: raw.address,
      city: raw.city,
      postalCode: raw.zip,
      country: raw.country,
    }),
    metadata: raw as Record<string, unknown>,
  }
}
