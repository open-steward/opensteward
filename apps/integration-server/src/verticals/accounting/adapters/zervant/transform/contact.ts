import type { Contact } from '../../../schema/contact'
import { toWorkEmail, toAddress, nonempty, toPhone } from '../../shared/transform'

export interface ZervantContact {
  id: string
  name?: string
  email?: string
  phone?: string
  address?: {
    street?: string
    city?: string
    zipCode?: string
    countryCode?: string
  }
  businessId?: string
  isCustomer?: boolean
  isSupplier?: boolean
  active?: boolean
  [key: string]: unknown
}

export function transformContact(raw: ZervantContact): Contact {
  const emails = toWorkEmail(raw.email)
  const phone = toPhone(raw.phone)
  return {
    id: raw.id,
    name: raw.name || undefined,
    identification: raw.businessId || undefined,
    isCustomer: raw.isCustomer ?? true,
    isSupplier: raw.isSupplier ?? false,
    isActive: raw.active ?? true,
    emails: nonempty(emails),
    telephones: phone ? [phone] : undefined,
    billingAddress: toAddress({
      address1: raw.address?.street,
      city: raw.address?.city,
      postalCode: raw.address?.zipCode,
      country: raw.address?.countryCode,
    }),
    metadata: raw as Record<string, unknown>,
  }
}
