import type { Contact } from '../../../schema/contact'
import { toWorkEmail, toAddress, nonempty } from '../../shared/transform'

export interface PromikBookContact {
  id: number | string
  name?: string
  email?: string
  phone?: string
  address?: string
  city?: string
  zip?: string
  country?: string
  org_number?: string
  is_customer?: boolean
  is_supplier?: boolean
  [key: string]: unknown
}

export function transformContact(raw: PromikBookContact): Contact {
  const emails = toWorkEmail(raw.email)
  return {
    id: String(raw.id),
    name: raw.name || undefined,
    identification: raw.org_number || undefined,
    isCustomer: raw.is_customer ?? true,
    isSupplier: raw.is_supplier ?? false,
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
