import type { Contact } from '../../../schema/contact'
import { toWorkEmail, toPhone, toAddress, nonempty } from '../../shared/transform'
import { toIso3166Alpha2 } from '../../../../shared/iso-normalise'

export interface ErpNextContact {
  name: string
  full_name: string
  email_id: string
  mobile_no: string
  address_line1: string
  city: string
  country: string
  customer_name: string
  supplier_name: string
  [key: string]: unknown
}

export function transformContact(raw: ErpNextContact): Contact {
  const emails = toWorkEmail(raw.email_id)
  const phone = toPhone(raw.mobile_no, 'MOBILE')
  const telephones = phone ? [phone] : []

  return {
    id: raw.name,
    name: raw.full_name || raw.name || undefined,
    isCustomer: Boolean(raw.customer_name),
    isSupplier: Boolean(raw.supplier_name),
    emails: nonempty(emails),
    telephones: nonempty(telephones),
    billingAddress: toAddress({
      address1: raw.address_line1,
      city: raw.city,
      country: toIso3166Alpha2(raw.country),
    }),
    metadata: raw as Record<string, unknown>,
  }
}
