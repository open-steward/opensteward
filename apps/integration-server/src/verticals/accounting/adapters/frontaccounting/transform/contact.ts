import type { Contact } from '../../../schema/contact'
import type { Telephone } from '../../../schema/shared'
import { toWorkEmail, toAddress, nonempty } from '../../shared/transform'

export interface FADebtor {
  id: number | string
  name?: string
  email?: string
  phone?: string
  fax?: string
  address?: string
  postal_code?: string
  city?: string
  state?: string
  country?: string
  country_code?: string
  gst_no?: string
  curr_code?: string
  inactive?: number | string
  [key: string]: unknown
}

export interface FASupplier {
  id: number | string
  supp_name?: string
  email?: string
  phone?: string
  fax?: string
  address?: string
  postal_code?: string
  city?: string
  state?: string
  country?: string
  country_code?: string
  gst_no?: string
  curr_code?: string
  inactive?: number | string
  [key: string]: unknown
}

export function transformDebtor(raw: FADebtor): Contact {
  const emails = toWorkEmail(raw.email)
  const telephones: Telephone[] = []
  if (raw.phone) telephones.push({ telephone: raw.phone, type: 'WORK' })
  if (raw.fax) telephones.push({ telephone: raw.fax, type: 'FAX' })

  return {
    id: `customer_${raw.id}`,
    name: raw.name || undefined,
    taxNumber: raw.gst_no || undefined,
    isCustomer: true,
    isSupplier: false,
    isActive: raw.inactive !== 1,
    currency: raw.curr_code || undefined,
    emails: nonempty(emails),
    telephones: nonempty(telephones),
    billingAddress: toAddress({
      address1: raw.address,
      city: raw.city,
      region: raw.state,
      postalCode: raw.postal_code,
      country: raw.country_code || raw.country,
    }),
    metadata: raw as Record<string, unknown>,
  }
}

export function transformSupplier(raw: FASupplier): Contact {
  const emails = toWorkEmail(raw.email)
  const telephones: Telephone[] = []
  if (raw.phone) telephones.push({ telephone: raw.phone, type: 'WORK' })
  if (raw.fax) telephones.push({ telephone: raw.fax, type: 'FAX' })

  return {
    id: `supplier_${raw.id}`,
    name: raw.supp_name || undefined,
    taxNumber: raw.gst_no || undefined,
    isCustomer: false,
    isSupplier: true,
    isActive: raw.inactive !== 1,
    currency: raw.curr_code || undefined,
    emails: nonempty(emails),
    telephones: nonempty(telephones),
    billingAddress: toAddress({
      address1: raw.address,
      city: raw.city,
      region: raw.state,
      postalCode: raw.postal_code,
      country: raw.country_code || raw.country,
    }),
    metadata: raw as Record<string, unknown>,
  }
}
