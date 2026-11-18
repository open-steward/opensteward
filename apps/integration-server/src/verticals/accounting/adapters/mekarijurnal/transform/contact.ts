import type { Contact } from '../../../schema/contact'
import { toWorkEmail, toAddress, toPhone, nonempty } from '../../shared/transform'

export interface MekariJurnalContact {
  id: number
  display_name: string
  contact_type: string
  email: string | null
  phone: string | null
  address: string | null
  city: string | null
  country_code: string | null
  tax_no: string | null
  [key: string]: unknown
}

export function transformContact(raw: MekariJurnalContact): Contact {
  const emails = toWorkEmail(raw.email ?? undefined)
  const phone = toPhone(raw.phone ?? undefined, 'WORK')
  const telephones = phone ? [phone] : []

  const isCustomer = raw.contact_type === 'customer'
  const isSupplier = raw.contact_type === 'vendor'

  return {
    id: String(raw.id),
    name: raw.display_name || undefined,
    taxNumber: raw.tax_no || undefined,
    isCustomer,
    isSupplier,
    emails: nonempty(emails),
    telephones: nonempty(telephones),
    billingAddress: toAddress({
      address1: raw.address ?? undefined,
      city: raw.city ?? undefined,
      country: raw.country_code ?? undefined,
    }),
    metadata: raw as Record<string, unknown>,
  }
}
