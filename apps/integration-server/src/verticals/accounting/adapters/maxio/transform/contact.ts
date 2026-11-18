import type { Contact } from '../../../schema/contact'
import { toWorkEmail, toPhone, toAddress, nonempty } from '../../shared/transform'

export interface MaxioCustomer {
  id: number
  first_name: string
  last_name: string
  organization: string
  email: string
  phone: string
  address: string
  address_2: string
  city: string
  state: string
  zip: string
  country: string
  portal_customer_created_at: string | null
  [key: string]: unknown
}

export function transformContact(raw: MaxioCustomer): Contact {
  const emails = toWorkEmail(raw.email)
  const phone = toPhone(raw.phone, 'WORK')
  const telephones = phone ? [phone] : []
  const name = raw.organization || [raw.first_name, raw.last_name].filter(Boolean).join(' ') || undefined

  return {
    id: String(raw.id),
    name,
    isCustomer: true,
    isSupplier: false,
    emails: nonempty(emails),
    telephones: nonempty(telephones),
    billingAddress: toAddress({
      address1: raw.address,
      address2: raw.address_2,
      city: raw.city,
      region: raw.state,
      postalCode: raw.zip,
      country: raw.country,
    }),
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformContact(data: Partial<Contact>): Record<string, unknown> {
  return {
    first_name: data.name,
    email: data.emails?.[0]?.email,
    phone: data.telephones?.[0]?.telephone,
    address: data.billingAddress?.address1,
    city: data.billingAddress?.city,
    state: data.billingAddress?.region,
    zip: data.billingAddress?.postalCode,
    country: data.billingAddress?.country,
  }
}
