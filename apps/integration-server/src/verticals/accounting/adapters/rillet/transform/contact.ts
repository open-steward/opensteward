import type { Contact } from '../../../schema/contact'
import type { Email, Address } from '../../../schema/shared'

// ── Rillet API types ───────────────────────────────────────────────────────────

export interface RilletAddress {
  line1: string
  line2?: string
  city: string
  state: string
  zip_code: string
  country: string
}

export interface RilletCustomerEmail {
  email: string
  type: 'MAIN_SENDER' | 'CC' | 'BCC'
}

/** `CustomerAddress` (v4.0): an `Address` with the stable id of the stored address. */
export interface RilletCustomerAddress extends RilletAddress {
  id?: string
}

/**
 * `Customer` in the v4.0 OpenAPI components
 * (https://docs.api.rillet.com/reference/list-all-customers-1.md). v4.0 adds
 * `billing_addresses` and `shipping_addresses`, "returned in a stable order;
 * the first is the default"; `address` and `shipping_address` are
 * deprecated and are, "In responses, the first address in billing_addresses"
 * (and `shipping_addresses`). The first list entry is read, and the
 * deprecated single address only when the list is absent.
 */
export interface RilletCustomer {
  id: string
  name: string
  name_on_invoice?: string
  /** Deprecated in v4.0: the first of `billing_addresses`. */
  address?: RilletAddress
  /** Deprecated in v4.0: the first of `shipping_addresses`. */
  shipping_address?: RilletAddress
  billing_addresses?: RilletCustomerAddress[] | null
  shipping_addresses?: RilletCustomerAddress[] | null
  emails?: RilletCustomerEmail[]
  payment_terms?: number
  send_invoices_automatically?: boolean
  send_payment_reminders?: boolean
  updated_at: string
  [key: string]: unknown
}

export interface RilletVendor {
  id: string
  name: string
  account_code?: string
  address?: RilletAddress
  email?: string
  payment_terms?: number
  ten_ninety_nine_eligible?: boolean
  tax_id?: string
  updated_at: string
  [key: string]: unknown
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function mapRilletAddress(addr: RilletAddress | undefined): Address | undefined {
  if (!addr) return undefined
  return {
    address1: addr.line1 || undefined,
    address2: addr.line2 || undefined,
    city: addr.city || undefined,
    region: addr.state || undefined,
    postalCode: addr.zip_code || undefined,
    country: addr.country || undefined,
  }
}

// ── Transforms ─────────────────────────────────────────────────────────────────

export function transformCustomer(raw: RilletCustomer): Contact {
  const emails: Email[] = (raw.emails ?? [])
    .filter((e) => e.type === 'MAIN_SENDER')
    .map((e) => ({ email: e.email, type: 'WORK' as const }))

  return {
    id: raw.id,
    name: raw.name || undefined,
    isCustomer: true,
    isSupplier: false,
    billingAddress: mapRilletAddress(raw.billing_addresses?.[0] ?? raw.address),
    shippingAddress: mapRilletAddress(raw.shipping_addresses?.[0] ?? raw.shipping_address),
    emails: emails.length ? emails : undefined,
    updatedAt: raw.updated_at ? new Date(raw.updated_at) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function transformVendor(raw: RilletVendor): Contact {
  const emails: Email[] = raw.email ? [{ email: raw.email, type: 'WORK' as const }] : []

  return {
    id: raw.id,
    name: raw.name || undefined,
    taxNumber: raw.tax_id || undefined,
    isCustomer: false,
    isSupplier: true,
    billingAddress: mapRilletAddress(raw.address),
    emails: emails.length ? emails : undefined,
    updatedAt: raw.updated_at ? new Date(raw.updated_at) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
