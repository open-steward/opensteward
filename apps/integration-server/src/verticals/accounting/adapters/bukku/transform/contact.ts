import type { Contact } from '../../../schema/contact'
import type { Telephone } from '../../../schema/shared'
import { toWorkEmail, toAddress, nonempty } from '../../shared/transform'

export interface BukkuContact {
  id: string | number
  name: string
  email: string
  phone: string
  billing_address_line_1: string
  billing_address_line_2: string
  billing_city: string
  billing_postcode: string
  billing_state: string
  billing_country: string
  shipping_address_line_1: string
  shipping_address_city: string
  shipping_address_postcode: string
  shipping_address_country: string
  is_customer: boolean
  is_supplier: boolean
  currency_code: string
  tax_number: string
  is_active: boolean
  [key: string]: unknown
}

export function transformContact(raw: BukkuContact): Contact {
  const emails = toWorkEmail(raw.email)
  const telephones: Telephone[] = []
  if (raw.phone) telephones.push({ telephone: raw.phone, type: 'WORK' })

  return {
    id: String(raw.id),
    name: raw.name || undefined,
    identification: raw.tax_number || undefined,
    isCustomer: raw.is_customer,
    isSupplier: raw.is_supplier,
    isActive: raw.is_active,
    currency: raw.currency_code || undefined,
    emails: nonempty(emails),
    telephones: nonempty(telephones),
    billingAddress: toAddress({
      address1: raw.billing_address_line_1,
      address2: raw.billing_address_line_2,
      city: raw.billing_city,
      postalCode: raw.billing_postcode,
      region: raw.billing_state,
      country: raw.billing_country,
    }),
    shippingAddress: toAddress({
      address1: raw.shipping_address_line_1,
      city: raw.shipping_address_city,
      postalCode: raw.shipping_address_postcode,
      country: raw.shipping_address_country,
    }),
    metadata: raw as Record<string, unknown>,
  }
}
