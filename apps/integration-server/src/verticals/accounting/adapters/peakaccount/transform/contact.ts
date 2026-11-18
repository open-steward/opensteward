import type { Contact } from '../../../schema/contact'
import { toWorkEmail, toAddress, toPhone, nonempty } from '../../shared/transform'

export interface PeakAccountContact {
  id: string | number
  name: string
  type: string
  email: string
  phone: string
  address: string
  province: string
  country: string
  taxId: string
  [key: string]: unknown
}

export function transformContact(raw: PeakAccountContact): Contact {
  const emails = toWorkEmail(raw.email)
  const phone = toPhone(raw.phone)
  const telephones = phone ? [phone] : []

  return {
    id: String(raw.id),
    name: raw.name || undefined,
    identification: raw.taxId || undefined,
    isCustomer: raw.type === 'customer' || raw.type === 'both',
    isSupplier: raw.type === 'supplier' || raw.type === 'both',
    emails: nonempty(emails),
    telephones: nonempty(telephones),
    billingAddress: toAddress({
      address1: raw.address,
      region: raw.province,
      country: raw.country,
    }),
    metadata: raw as Record<string, unknown>,
  }
}
