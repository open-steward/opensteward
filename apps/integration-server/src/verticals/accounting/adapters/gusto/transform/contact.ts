import type { Contact } from '../../../schema/contact'
import { toWorkEmail, toPhone, toAddress, composeName, nonempty } from '../../shared/transform'

export interface GustoContact {
  id: string | number
  first_name: string
  last_name: string
  email: string
  phone?: string
  date_of_birth?: string
  address?: {
    street_1?: string
    street_2?: string
    city?: string
    state?: string
    zip?: string
    country?: string
    [key: string]: unknown
  }
  [key: string]: unknown
}

export function transformContact(raw: GustoContact): Contact {
  const emails = toWorkEmail(raw.email)
  const phone = toPhone(raw.phone, 'WORK')
  const telephones = phone ? [phone] : []

  return {
    id: String(raw.id),
    name: composeName(undefined, raw.first_name, raw.last_name),
    isCustomer: false,
    isSupplier: false,
    emails: nonempty(emails),
    telephones: nonempty(telephones),
    billingAddress: raw.address
      ? toAddress({
          address1: raw.address.street_1,
          address2: raw.address.street_2,
          city: raw.address.city,
          region: raw.address.state,
          postalCode: raw.address.zip,
          country: raw.address.country,
        })
      : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
