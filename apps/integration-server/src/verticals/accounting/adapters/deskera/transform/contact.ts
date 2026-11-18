import type { Contact } from '../../../schema/contact'
import type { Telephone } from '../../../schema/shared'
import { toWorkEmail, toAddress, nonempty } from '../../shared/transform'

export interface DeskeraContactAddress {
  address1?: string
  address2?: string
  city?: string
  state?: string
  country?: string
  postalCode?: string
  [key: string]: unknown
}

export interface DeskeraContact {
  id: string
  name?: string
  email?: string
  phone?: string
  isCustomer?: boolean
  isVendor?: boolean
  currencyCode?: string
  taxNumber?: string
  billingAddress?: DeskeraContactAddress
  shippingAddress?: DeskeraContactAddress
  status?: string
  [key: string]: unknown
}

export function transformContact(raw: DeskeraContact): Contact {
  const emails = toWorkEmail(raw.email)
  const telephones: Telephone[] = []
  if (raw.phone) telephones.push({ telephone: raw.phone, type: 'WORK' })

  return {
    id: raw.id,
    name: raw.name || undefined,
    identification: raw.taxNumber || undefined,
    taxNumber: raw.taxNumber || undefined,
    isCustomer: raw.isCustomer ?? false,
    isSupplier: raw.isVendor ?? false,
    isActive: raw.status === 'ACTIVE',
    currency: raw.currencyCode || undefined,
    emails: nonempty(emails),
    telephones: nonempty(telephones),
    billingAddress: raw.billingAddress
      ? toAddress({
          address1: raw.billingAddress.address1,
          address2: raw.billingAddress.address2,
          city: raw.billingAddress.city,
          region: raw.billingAddress.state,
          postalCode: raw.billingAddress.postalCode,
          country: raw.billingAddress.country,
        })
      : undefined,
    shippingAddress: raw.shippingAddress
      ? toAddress({
          address1: raw.shippingAddress.address1,
          address2: raw.shippingAddress.address2,
          city: raw.shippingAddress.city,
          region: raw.shippingAddress.state,
          postalCode: raw.shippingAddress.postalCode,
          country: raw.shippingAddress.country,
        })
      : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
