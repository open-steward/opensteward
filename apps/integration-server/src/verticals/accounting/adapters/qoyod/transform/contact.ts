import type { Contact } from '../../../schema/contact'
import { toWorkEmail, toAddress, nonempty } from '../../shared/transform'

// Qoyod customer
export interface QoyodCustomer {
  id: number
  name?: string | null
  email?: string | null
  phone?: string | null
  vat_number?: string | null
  address?: string | null
  city?: string | null
  country?: string | null
  zip_code?: string | null
  currency?: string | null
  is_active?: boolean | null
  [key: string]: unknown
}

// Qoyod vendor/supplier
export interface QoyodVendor {
  id: number
  name?: string | null
  email?: string | null
  phone?: string | null
  vat_number?: string | null
  address?: string | null
  city?: string | null
  country?: string | null
  zip_code?: string | null
  currency?: string | null
  is_active?: boolean | null
  [key: string]: unknown
}

export function transformCustomer(raw: QoyodCustomer): Contact {
  const emails = toWorkEmail(raw.email)
  const phones = raw.phone ? [{ telephone: raw.phone, type: 'WORK' as const }] : []

  return {
    id: `cust_${raw.id}`,
    name: raw.name || undefined,
    taxNumber: raw.vat_number || undefined,
    isCustomer: true,
    isSupplier: false,
    isActive: raw.is_active ?? true,
    currency: raw.currency || undefined,
    emails: nonempty(emails),
    telephones: nonempty(phones),
    billingAddress: toAddress({
      address1: raw.address,
      city: raw.city,
      postalCode: raw.zip_code,
      country: raw.country,
    }),
    metadata: raw as Record<string, unknown>,
  }
}

export function transformVendor(raw: QoyodVendor): Contact {
  const emails = toWorkEmail(raw.email)
  const phones = raw.phone ? [{ telephone: raw.phone, type: 'WORK' as const }] : []

  return {
    id: `vend_${raw.id}`,
    name: raw.name || undefined,
    taxNumber: raw.vat_number || undefined,
    isCustomer: false,
    isSupplier: true,
    isActive: raw.is_active ?? true,
    currency: raw.currency || undefined,
    emails: nonempty(emails),
    telephones: nonempty(phones),
    billingAddress: toAddress({
      address1: raw.address,
      city: raw.city,
      postalCode: raw.zip_code,
      country: raw.country,
    }),
    metadata: raw as Record<string, unknown>,
  }
}
