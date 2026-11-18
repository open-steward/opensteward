import type { Contact } from '../../../schema/contact'
import type { Telephone } from '../../../schema/shared'
import { toWorkEmail, toAddress, nonempty } from '../../shared/transform'

export interface ClearContact {
  id: string
  name: string
  gstin: string
  pan: string
  email: string
  phone: string
  billing_address_line1: string
  billing_address_line2: string
  billing_city: string
  billing_state: string
  billing_pincode: string
  billing_country: string
  shipping_address_line1: string
  shipping_city: string
  shipping_state: string
  shipping_pincode: string
  shipping_country: string
  is_customer: boolean
  is_supplier: boolean
  currency: string
  is_active: boolean
  [key: string]: unknown
}

export function transformContact(raw: ClearContact): Contact {
  const emails = toWorkEmail(raw.email)
  const telephones: Telephone[] = []
  if (raw.phone) telephones.push({ telephone: raw.phone, type: 'WORK' })

  return {
    id: raw.id,
    name: raw.name || undefined,
    taxNumber: raw.gstin || undefined,
    identification: raw.pan || undefined,
    isCustomer: raw.is_customer,
    isSupplier: raw.is_supplier,
    isActive: raw.is_active,
    currency: raw.currency || undefined,
    emails: nonempty(emails),
    telephones: nonempty(telephones),
    billingAddress: toAddress({
      address1: raw.billing_address_line1,
      address2: raw.billing_address_line2,
      city: raw.billing_city,
      region: raw.billing_state,
      postalCode: raw.billing_pincode,
      country: raw.billing_country,
    }),
    shippingAddress: toAddress({
      address1: raw.shipping_address_line1,
      city: raw.shipping_city,
      region: raw.shipping_state,
      postalCode: raw.shipping_pincode,
      country: raw.shipping_country,
    }),
    metadata: raw as Record<string, unknown>,
  }
}
