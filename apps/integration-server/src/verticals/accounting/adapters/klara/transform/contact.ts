/**
 * KLARA contact transform.
 *
 * KLARA exposes contacts (Kontakte) with a unified structure.
 * contact_type: "company" | "person"
 * is_customer / is_supplier flags indicate roles.
 */

import type { Contact } from '../../../schema/contact'
import { toWorkEmail, toPhone, toAddress, nonempty } from '../../shared/transform'

export interface KlaraContact {
  id: string
  contact_type?: string        // "company" | "person"
  company_name?: string
  first_name?: string
  last_name?: string
  is_customer?: boolean
  is_supplier?: boolean
  is_active?: boolean
  currency?: string
  email?: string
  phone?: string
  mobile?: string
  address?: string
  address2?: string
  zip?: string
  city?: string
  country?: string             // ISO 3166-1 alpha-2
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

export function transformContact(raw: KlaraContact): Contact {
  const isCompany = raw.contact_type === 'company'
  const name = isCompany
    ? raw.company_name || undefined
    : [raw.first_name, raw.last_name].filter(Boolean).join(' ') || undefined

  const emails = toWorkEmail(raw.email)
  const telephones = [
    toPhone(raw.phone, 'WORK'),
    toPhone(raw.mobile, 'MOBILE'),
  ].filter(Boolean) as NonNullable<ReturnType<typeof toPhone>>[]

  return {
    id: raw.id || undefined,
    name,
    companyName: isCompany ? raw.company_name || undefined : undefined,
    firstName: !isCompany ? raw.first_name || undefined : undefined,
    lastName: !isCompany ? raw.last_name || undefined : undefined,
    isCustomer: raw.is_customer ?? false,
    isSupplier: raw.is_supplier ?? false,
    isActive: raw.is_active ?? true,
    currency: raw.currency || undefined,
    emails: nonempty(emails),
    telephones: nonempty(telephones),
    billingAddress: toAddress({
      address1: raw.address,
      address2: raw.address2,
      city: raw.city,
      postalCode: raw.zip,
      country: raw.country,
    }),
    createdAt: raw.created_at ? new Date(raw.created_at) : undefined,
    updatedAt: raw.updated_at ? new Date(raw.updated_at) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
