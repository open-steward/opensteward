import type { Contact } from '../../../schema/contact'
import { toWorkEmail, toAddress, toPhone, nonempty } from '../../shared/transform'

export interface MorningClient {
  id: string
  name: string
  type: number // 0=individual, 1=business
  taxId?: string
  email?: string
  phone?: string
  address?: {
    city?: string
    country?: string
    streetAddress?: string
    zip?: string
  }
  [key: string]: unknown
}

export function transformContact(raw: MorningClient): Contact {
  const emails = toWorkEmail(raw.email)
  const phone = toPhone(raw.phone)
  const telephones = phone ? [phone] : []

  return {
    id: raw.id,
    name: raw.name || undefined,
    identification: raw.taxId || undefined,
    isCustomer: true,
    isSupplier: raw.type === 1,
    emails: nonempty(emails),
    telephones: nonempty(telephones),
    billingAddress: toAddress({
      address1: raw.address?.streetAddress,
      city: raw.address?.city,
      postalCode: raw.address?.zip,
      country: raw.address?.country,
    }),
    metadata: raw as Record<string, unknown>,
  }
}
