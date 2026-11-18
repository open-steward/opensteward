import type { Contact } from '../../../schema/contact'
import { toWorkEmail, toAddress, toPhone, nonempty } from '../../shared/transform'

export interface VismaNetContact {
  id: string
  name?: string
  email?: string
  phone?: string
  address?: {
    street?: string
    city?: string
    postalCode?: string
    country?: string
  }
  organizationNumber?: string
  isCustomer?: boolean
  isSupplier?: boolean
  active?: boolean
  [key: string]: unknown
}

export function transformContact(raw: VismaNetContact): Contact {
  const emails = toWorkEmail(raw.email)
  const phone = toPhone(raw.phone)
  return {
    id: raw.id,
    name: raw.name || undefined,
    identification: raw.organizationNumber || undefined,
    isCustomer: raw.isCustomer ?? true,
    isSupplier: raw.isSupplier ?? false,
    isActive: raw.active ?? true,
    emails: nonempty(emails),
    telephones: phone ? [phone] : undefined,
    billingAddress: toAddress({
      address1: raw.address?.street,
      city: raw.address?.city,
      postalCode: raw.address?.postalCode,
      country: raw.address?.country,
    }),
    metadata: raw as Record<string, unknown>,
  }
}
