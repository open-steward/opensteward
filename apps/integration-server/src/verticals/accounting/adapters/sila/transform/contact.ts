import type { Contact } from '../../../schema/contact'
import { toWorkEmail, toPhone, toAddress, nonempty } from '../../shared/transform'

export interface SilaUser {
  user_handle?: string
  first_name?: string
  last_name?: string
  entity_name?: string
  email?: string
  phone?: string
  address?: string
  city?: string
  state?: string
  zip?: string
  country?: string
  [key: string]: unknown
}

export function transformContact(raw: SilaUser): Contact {
  const name = raw.entity_name || [raw.first_name, raw.last_name].filter(Boolean).join(' ') || undefined
  const emails = toWorkEmail(raw.email)
  const phone = toPhone(raw.phone)
  const telephones = phone ? [phone] : []

  return {
    id: raw.user_handle || undefined,
    name,
    isCustomer: true,
    isSupplier: false,
    emails: nonempty(emails),
    telephones: nonempty(telephones),
    billingAddress: toAddress({
      address1: raw.address,
      city: raw.city,
      region: raw.state,
      postalCode: raw.zip,
      country: raw.country || 'US',
    }),
    metadata: raw as Record<string, unknown>,
  }
}
