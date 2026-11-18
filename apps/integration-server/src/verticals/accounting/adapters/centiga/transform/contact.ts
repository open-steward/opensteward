import type { Contact } from '../../../schema/contact'
import { toWorkEmail, toAddress, nonempty } from '../../shared/transform'

export interface CentigaContact {
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
  org_nr?: string
  customer?: boolean
  supplier?: boolean
  is_active?: boolean
  [key: string]: unknown
}

export function transformContact(raw: CentigaContact): Contact {
  const emails = toWorkEmail(raw.email)
  return {
    id: raw.id,
    name: raw.name || undefined,
    identification: raw.org_nr || undefined,
    isCustomer: raw.customer ?? false,
    isSupplier: raw.supplier ?? false,
    isActive: raw.is_active ?? true,
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
