import type { Contact } from '../../../schema/contact'
import { toWorkEmail, toAddress } from '../../shared/transform'

export interface BillingoPartnerAddress {
  country_code?: string
  post_code?: string
  city?: string
  address?: string
  [key: string]: unknown
}

// Billingo API v3 uses "Partner" as the resource name for contacts
export interface BillingoContact {
  id: string | number
  name: string
  taxcode?: string
  email?: string
  address?: BillingoPartnerAddress
  [key: string]: unknown
}

export function transformContact(raw: BillingoContact): Contact {
  const emails = toWorkEmail(raw.email)
  const addr = raw.address
  return {
    id: String(raw.id),
    name: raw.name || undefined,
    taxNumber: raw.taxcode || undefined,
    isCustomer: true,
    isSupplier: false,
    emails: emails.length ? emails : undefined,
    billingAddress: addr
      ? toAddress({
          address1: addr.address,
          city: addr.city,
          postalCode: addr.post_code,
          country: addr.country_code,
        })
      : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
