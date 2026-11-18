import type { Contact } from '../../../schema/contact'
import type { Telephone } from '../../../schema/shared'
import { toWorkEmail, toAddress, nonempty } from '../../shared/transform'

// ── Mezan wire types ──────────────────────────────────────────────────────────

export interface MezanCustomer {
  id: string
  name: string
  is_business?: boolean
  organization_name?: string
  cr_number?: string
  tax_number?: string
  primary_email?: string
  secondary_email?: string
  primary_phone?: string
  secondary_phone?: string
  country?: string
  city?: string
  address?: string
  zipcode?: string
  is_archived?: boolean
  currency?: string
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

export interface MezanVendor {
  id: string
  name: string
  is_business?: boolean
  organization_name?: string
  cr_number?: string
  tax_number?: string
  primary_email?: string
  secondary_email?: string
  primary_phone?: string
  secondary_phone?: string
  country?: string
  city?: string
  address?: string
  zipcode?: string
  is_archived?: boolean
  currency?: string
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

// ── Transforms ────────────────────────────────────────────────────────────────

export function transformCustomer(raw: MezanCustomer): Contact {
  const emails = toWorkEmail(raw.primary_email)
  if (raw.secondary_email) emails.push({ email: raw.secondary_email, type: 'OTHER' })

  const telephones: Telephone[] = []
  if (raw.primary_phone) telephones.push({ telephone: raw.primary_phone, type: 'WORK' })
  if (raw.secondary_phone) telephones.push({ telephone: raw.secondary_phone, type: 'OTHER' })

  return {
    id: `cust_${raw.id}`,
    name: raw.name || undefined,
    companyName: raw.organization_name || undefined,
    identification: raw.cr_number || undefined,
    taxNumber: raw.tax_number || undefined,
    isCustomer: true,
    isSupplier: false,
    isActive: raw.is_archived != null ? !raw.is_archived : undefined,
    currency: raw.currency || undefined,
    emails: nonempty(emails),
    telephones: nonempty(telephones),
    billingAddress: toAddress({
      address1: raw.address,
      city: raw.city,
      postalCode: raw.zipcode,
      country: raw.country,
    }),
    createdAt: raw.created_at ? new Date(raw.created_at) : undefined,
    updatedAt: raw.updated_at ? new Date(raw.updated_at) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function transformVendor(raw: MezanVendor): Contact {
  const emails = toWorkEmail(raw.primary_email)
  if (raw.secondary_email) emails.push({ email: raw.secondary_email, type: 'OTHER' })

  const telephones: Telephone[] = []
  if (raw.primary_phone) telephones.push({ telephone: raw.primary_phone, type: 'WORK' })
  if (raw.secondary_phone) telephones.push({ telephone: raw.secondary_phone, type: 'OTHER' })

  return {
    id: `vend_${raw.id}`,
    name: raw.name || undefined,
    companyName: raw.organization_name || undefined,
    identification: raw.cr_number || undefined,
    taxNumber: raw.tax_number || undefined,
    isCustomer: false,
    isSupplier: true,
    isActive: raw.is_archived != null ? !raw.is_archived : undefined,
    currency: raw.currency || undefined,
    emails: nonempty(emails),
    telephones: nonempty(telephones),
    billingAddress: toAddress({
      address1: raw.address,
      city: raw.city,
      postalCode: raw.zipcode,
      country: raw.country,
    }),
    createdAt: raw.created_at ? new Date(raw.created_at) : undefined,
    updatedAt: raw.updated_at ? new Date(raw.updated_at) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
