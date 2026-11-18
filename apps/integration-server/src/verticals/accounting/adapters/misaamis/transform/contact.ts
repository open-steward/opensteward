import type { Contact } from '../../../schema/contact'
import type { Telephone } from '../../../schema/shared'
import { toWorkEmail, toAddress, nonempty } from '../../shared/transform'

export interface MisaAmisPartner {
  id: string
  partner_name: string
  partner_code: string
  tax_code: string
  email: string
  phone: string
  address: string
  city: string
  province: string
  country: string
  is_customer: boolean
  is_supplier: boolean
  currency_code: string
  is_active: boolean
  [key: string]: unknown
}

export function transformContact(raw: MisaAmisPartner): Contact {
  const emails = toWorkEmail(raw.email)
  const telephones: Telephone[] = []
  if (raw.phone) telephones.push({ telephone: raw.phone, type: 'WORK' })

  return {
    id: raw.id,
    name: raw.partner_name || undefined,
    identification: raw.partner_code || undefined,
    taxNumber: raw.tax_code || undefined,
    isCustomer: raw.is_customer,
    isSupplier: raw.is_supplier,
    isActive: raw.is_active,
    currency: raw.currency_code || undefined,
    emails: nonempty(emails),
    telephones: nonempty(telephones),
    billingAddress: toAddress({
      address1: raw.address,
      city: raw.city,
      region: raw.province,
      country: raw.country,
    }),
    metadata: raw as Record<string, unknown>,
  }
}
