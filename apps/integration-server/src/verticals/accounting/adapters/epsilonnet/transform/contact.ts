import type { Contact } from '../../../schema/contact'
import { toWorkEmail, toAddress, toPhone, nonempty } from '../../shared/transform'

export interface EpsilonNetCounterpart {
  id: string | number
  name: string
  vatNumber: string
  type: string
  email: string
  phone: string
  address: string
  city: string
  postalCode: string
  country: string
  [key: string]: unknown
}

export function transformContact(raw: EpsilonNetCounterpart): Contact {
  const emails = toWorkEmail(raw.email)
  const phone = toPhone(raw.phone, 'WORK')
  const telephones = phone ? [phone] : []

  return {
    id: String(raw.id),
    name: raw.name || undefined,
    identification: raw.vatNumber || undefined,
    taxNumber: raw.vatNumber || undefined,
    isCustomer: raw.type === 'Customer',
    isSupplier: raw.type === 'Supplier',
    emails: nonempty(emails),
    telephones: nonempty(telephones),
    billingAddress: toAddress({
      address1: raw.address,
      city: raw.city,
      postalCode: raw.postalCode,
      country: raw.country,
    }),
    metadata: raw as Record<string, unknown>,
  }
}
