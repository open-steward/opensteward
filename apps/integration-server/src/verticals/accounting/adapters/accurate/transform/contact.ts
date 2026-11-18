import type { Contact } from '../../../schema/contact'
import { toWorkEmail, toAddress, toPhone, nonempty } from '../../shared/transform'

export interface AccurateContact {
  id: number
  name: string
  customerNo: string
  type: string
  email: string | null
  mobilePhone: string | null
  address: string | null
  city: string | null
  [key: string]: unknown
}

export function transformContact(raw: AccurateContact): Contact {
  const emails = toWorkEmail(raw.email ?? undefined)
  const phone = toPhone(raw.mobilePhone ?? undefined, 'MOBILE')
  const telephones = phone ? [phone] : []

  const isCustomer = raw.type === 'CUSTOMER'
  const isSupplier = raw.type === 'SUPPLIER'

  return {
    id: String(raw.id),
    name: raw.name || undefined,
    identification: raw.customerNo || undefined,
    isCustomer,
    isSupplier,
    emails: nonempty(emails),
    telephones: nonempty(telephones),
    billingAddress: toAddress({
      address1: raw.address ?? undefined,
      city: raw.city ?? undefined,
    }),
    metadata: raw as Record<string, unknown>,
  }
}
