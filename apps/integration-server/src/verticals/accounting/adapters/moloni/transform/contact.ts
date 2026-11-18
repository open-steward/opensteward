import type { Contact } from '../../../schema/contact'
import { toWorkEmail, toAddress, toPhone, nonempty } from '../../shared/transform'

export interface MoloniContact {
  customer_id: number
  name: string
  vat: string
  email: string
  phone: string
  address: string
  city: string
  zip_code: string
  country_id: number
  is_customer: number
  is_supplier: number
  [key: string]: unknown
}

export function transformContact(raw: MoloniContact): Contact {
  const emails = toWorkEmail(raw.email)
  const phone = toPhone(raw.phone)
  const telephones = phone ? [phone] : []

  return {
    id: String(raw.customer_id),
    name: raw.name || undefined,
    identification: raw.vat || undefined,
    isCustomer: raw.is_customer === 1,
    isSupplier: raw.is_supplier === 1,
    emails: nonempty(emails),
    telephones: nonempty(telephones),
    billingAddress: toAddress({
      address1: raw.address,
      city: raw.city,
      postalCode: raw.zip_code,
    }),
    metadata: raw as Record<string, unknown>,
  }
}
