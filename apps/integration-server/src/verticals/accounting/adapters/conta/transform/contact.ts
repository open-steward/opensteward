import type { Contact } from '../../../schema/contact'
import { toWorkEmail, toAddress, nonempty } from '../../shared/transform'

export interface ContaContact {
  id: string
  name?: string
  email?: string
  phone?: string
  address?: {
    street?: string
    city?: string
    postal_code?: string
    country?: string
  }
  org_number?: string
  is_customer?: boolean
  is_supplier?: boolean
  active?: boolean
  [key: string]: unknown
}

export function transformContact(raw: ContaContact): Contact {
  const emails = toWorkEmail(raw.email)
  return {
    id: raw.id,
    name: raw.name || undefined,
    identification: raw.org_number || undefined,
    isCustomer: raw.is_customer ?? false,
    isSupplier: raw.is_supplier ?? false,
    isActive: raw.active ?? true,
    emails: nonempty(emails),
    billingAddress: toAddress({
      address1: raw.address?.street,
      city: raw.address?.city,
      postalCode: raw.address?.postal_code,
      country: raw.address?.country,
    }),
    metadata: raw as Record<string, unknown>,
  }
}
