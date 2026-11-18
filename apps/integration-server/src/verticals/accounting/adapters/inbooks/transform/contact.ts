import type { Contact } from '../../../schema/contact'
import { toWorkEmail, toAddress, nonempty } from '../../shared/transform'

export interface InbooksContact {
  id: number | string
  name?: string
  email?: string
  phone?: string
  billing_address?: string
  city?: string
  zip?: string
  country?: string
  org_number?: string
  is_customer?: boolean
  is_vendor?: boolean
  [key: string]: unknown
}

export function transformContact(raw: InbooksContact): Contact {
  const emails = toWorkEmail(raw.email)
  return {
    id: String(raw.id),
    name: raw.name || undefined,
    identification: raw.org_number || undefined,
    isCustomer: raw.is_customer ?? true,
    isSupplier: raw.is_vendor ?? false,
    isActive: true,
    emails: nonempty(emails),
    billingAddress: toAddress({
      address1: raw.billing_address,
      city: raw.city,
      postalCode: raw.zip,
      country: raw.country,
    }),
    metadata: raw as Record<string, unknown>,
  }
}
