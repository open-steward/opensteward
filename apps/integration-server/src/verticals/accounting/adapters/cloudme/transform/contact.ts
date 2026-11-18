import type { Contact } from '../../../schema/contact'
import { toWorkEmail, toPhone, toAddress, nonempty } from '../../shared/transform'

export interface CloudMeContact {
  id: string | number
  name: string
  email: string
  phone: string
  billing_address: {
    street?: string
    city?: string
    postal_code?: string
    country?: string
    [key: string]: unknown
  } | null
  tax_id: string
  is_customer: boolean
  is_vendor: boolean
  [key: string]: unknown
}

export function transformContact(raw: CloudMeContact): Contact {
  const emails = toWorkEmail(raw.email)
  const phone = toPhone(raw.phone)
  const telephones = phone ? [phone] : []

  return {
    id: String(raw.id),
    name: raw.name || undefined,
    identification: raw.tax_id || undefined,
    isCustomer: raw.is_customer,
    isSupplier: raw.is_vendor,
    emails: nonempty(emails),
    telephones: nonempty(telephones),
    billingAddress: raw.billing_address
      ? toAddress({
          address1: raw.billing_address.street,
          city: raw.billing_address.city,
          postalCode: raw.billing_address.postal_code,
          country: raw.billing_address.country,
        })
      : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
