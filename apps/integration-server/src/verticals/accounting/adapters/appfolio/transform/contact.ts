import type { Contact } from '../../../schema/contact'
import { toWorkEmail, toPhone, toAddress, nonempty } from '../../shared/transform'

export interface AppFolioContact {
  id: string | number
  name: string
  email: string
  phone: string
  address: string
  city: string
  state: string
  zip: string
  country: string
  contact_type: string
  property_id: string | number
  unit_id: string | number
  lease_id: string | number
  [key: string]: unknown
}

export function transformContact(raw: AppFolioContact): Contact {
  const emails = toWorkEmail(raw.email)
  const phone = toPhone(raw.phone, 'WORK')
  const telephones = phone ? [phone] : []

  const isCustomer = raw.contact_type === 'tenant' || raw.contact_type === 'owner'
  const isSupplier = raw.contact_type === 'vendor'

  return {
    id: String(raw.id),
    name: raw.name || undefined,
    isCustomer,
    isSupplier,
    emails: nonempty(emails),
    telephones: nonempty(telephones),
    billingAddress: toAddress({
      address1: raw.address,
      city: raw.city,
      region: raw.state,
      postalCode: raw.zip,
      country: raw.country,
    }),
    metadata: raw as Record<string, unknown>,
  }
}
