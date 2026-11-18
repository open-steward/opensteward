import type { Contact } from '../../../schema/contact'
import type { Email, Address } from '../../../schema/shared'

// Melio vendor (payee/contact)
export interface MelioVendor {
  id: string
  name?: string
  accountName?: string
  email?: string
  phone?: string
  taxId?: string
  currency?: string
  isActive?: boolean
  address?: {
    line1?: string
    line2?: string
    city?: string
    state?: string
    postalCode?: string
    country?: string
  }
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

function mapAddress(addr: MelioVendor['address']): Address | undefined {
  if (!addr) return undefined
  return {
    address1: addr.line1 || undefined,
    address2: addr.line2 || undefined,
    city: addr.city || undefined,
    region: addr.state || undefined,
    postalCode: addr.postalCode || undefined,
    country: (addr.country as Address['country']) || undefined,
  }
}

export function transformVendor(raw: MelioVendor): Contact {
  const emails: Email[] = raw.email
    ? [{ email: raw.email, type: 'WORK' }]
    : []

  return {
    id: raw.id,
    name: raw.name || raw.accountName || undefined,
    companyName: raw.accountName || raw.name || undefined,
    taxNumber: raw.taxId || undefined,
    isCustomer: false,
    isSupplier: true,
    isActive: raw.isActive ?? true,
    currency: (raw.currency as Contact['currency']) || undefined,
    emails: emails.length ? emails : undefined,
    billingAddress: mapAddress(raw.address),
    createdAt: raw.createdAt ? new Date(raw.createdAt) : undefined,
    updatedAt: raw.updatedAt ? new Date(raw.updatedAt) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
