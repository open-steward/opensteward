import type { Contact } from '../../../schema/contact'
import { toWorkEmail, toAddress, toPhone, nonempty } from '../../shared/transform'

export interface ICountContact {
  client_id: string
  client_name: string
  type?: string // 'business' | 'private'
  email?: string
  phone?: string
  address?: string
  city?: string
  country?: string
  tax_id?: string
  [key: string]: unknown
}

export function transformContact(raw: ICountContact): Contact {
  const emails = toWorkEmail(raw.email)
  const phone = toPhone(raw.phone)
  const telephones = phone ? [phone] : []

  return {
    id: raw.client_id,
    name: raw.client_name || undefined,
    identification: raw.tax_id || undefined,
    isCustomer: true,
    isSupplier: raw.type === 'business',
    emails: nonempty(emails),
    telephones: nonempty(telephones),
    billingAddress: toAddress({
      address1: raw.address,
      city: raw.city,
      country: raw.country,
    }),
    metadata: raw as Record<string, unknown>,
  }
}
