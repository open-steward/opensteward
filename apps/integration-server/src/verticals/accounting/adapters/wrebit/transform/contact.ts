import type { Contact } from '../../../schema/contact'
import { toWorkEmail, toAddress, nonempty } from '../../shared/transform'

export interface WrebitContact {
  id: number | string
  name?: string
  email?: string
  phone?: string
  address?: string
  city?: string
  zip?: string
  country?: string
  org_number?: string
  customer?: boolean
  supplier?: boolean
  [key: string]: unknown
}

export function transformContact(raw: WrebitContact): Contact {
  const emails = toWorkEmail(raw.email)
  return {
    id: String(raw.id),
    name: raw.name || undefined,
    identification: raw.org_number || undefined,
    isCustomer: raw.customer ?? true,
    isSupplier: raw.supplier ?? false,
    isActive: true,
    emails: nonempty(emails),
    billingAddress: toAddress({
      address1: raw.address,
      city: raw.city,
      postalCode: raw.zip,
      country: raw.country,
    }),
    metadata: raw as Record<string, unknown>,
  }
}
