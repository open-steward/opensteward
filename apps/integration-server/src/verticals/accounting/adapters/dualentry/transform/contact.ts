import type { Contact } from '../../../schema/contact'
import type { Telephone } from '../../../schema/shared'
import { toWorkEmail, toAddress, nonempty } from '../../shared/transform'

// ── DualEntry Customer ────────────────────────────────────────────────────────

export interface DualentryAddress {
  street: string | null
  second_line: string | null
  city: string | null
  state: string | null
  postal_code: string | null
  country: string | null
  name?: string | null
}

export interface DualentryCustomer {
  id: number
  name: string
  unique_id: string | null
  email: string | null
  website: string | null
  phone: string | null
  customer_type: string | null
  is_active: boolean
  full_address: DualentryAddress | null
  shipping_address: DualentryAddress | null
  [key: string]: unknown
}

// ── DualEntry Vendor ──────────────────────────────────────────────────────────

export interface DualentryVendor {
  id: number
  name: string
  vendor_type: string | null
  unique_id: string | null
  email: string | null
  website: string | null
  phone: string | null
  country: string | null
  is_active: boolean
  tin: string | null
  tin_type: string | null
  address: DualentryAddress | null
  [key: string]: unknown
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function addressToFields(addr: DualentryAddress | null) {
  if (!addr) return {}
  return {
    address1: addr.street || undefined,
    address2: addr.second_line || undefined,
    city: addr.city || undefined,
    region: addr.state || undefined,
    postalCode: addr.postal_code || undefined,
    country: addr.country || undefined,
  }
}

// ── Transforms ────────────────────────────────────────────────────────────────

export function transformCustomer(raw: DualentryCustomer): Contact {
  const emails = toWorkEmail(raw.email ?? undefined)
  const telephones: Telephone[] = []
  if (raw.phone) telephones.push({ telephone: raw.phone, type: 'WORK' })

  return {
    id: `cust_${raw.id}`,
    name: raw.name || undefined,
    identification: raw.unique_id || undefined,
    isCustomer: true,
    isSupplier: false,
    isActive: raw.is_active,
    emails: nonempty(emails),
    telephones: nonempty(telephones),
    billingAddress: toAddress(addressToFields(raw.full_address)),
    shippingAddress: toAddress(addressToFields(raw.shipping_address)),
    metadata: raw as Record<string, unknown>,
  }
}

export function transformVendor(raw: DualentryVendor): Contact {
  const emails = toWorkEmail(raw.email ?? undefined)
  const telephones: Telephone[] = []
  if (raw.phone) telephones.push({ telephone: raw.phone, type: 'WORK' })

  return {
    id: `vend_${raw.id}`,
    name: raw.name || undefined,
    identification: raw.unique_id || undefined,
    taxNumber: raw.tin || undefined,
    isCustomer: false,
    isSupplier: true,
    isActive: raw.is_active,
    emails: nonempty(emails),
    telephones: nonempty(telephones),
    billingAddress: toAddress(addressToFields(raw.address)),
    metadata: raw as Record<string, unknown>,
  }
}
