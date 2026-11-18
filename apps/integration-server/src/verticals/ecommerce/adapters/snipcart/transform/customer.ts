/**
 * Snipcart Customer → canonical Customer.
 *
 * Snipcart customers are identified by a GUID `id`. Address fields are
 * prefixed with `billingAddress` / `shippingAddress` on the root customer
 * object (not in a nested object). `ordersAmount` is a major-unit decimal.
 *
 * Docs: https://docs.snipcart.com/v3/api-reference/customers
 */

import type { Customer } from '../../../schema/customer'
import type { Address } from '../../../schema/shared'
import { majorToMinor } from '../../../schema/shared'

// ── Raw Snipcart shape ────────────────────────────────────────────────────────

export interface RawSnipcartCustomerStatistics {
  /** Total number of orders placed. */
  ordersCount?: number
  /** Major-unit decimal total spent (e.g. 49.99). Currency not provided; we store as USD by default. */
  ordersAmount?: number | null
}

export interface RawSnipcartCustomer {
  id: string
  email?: string | null
  /** Full display name, e.g. "Jane Doe". Snipcart does not expose a separate firstName field. */
  billingAddressName?: string | null
  billingAddressAddress1?: string | null
  billingAddressAddress2?: string | null
  billingAddressCity?: string | null
  billingAddressCountry?: string | null
  billingAddressProvince?: string | null
  billingAddressPostalCode?: string | null
  billingAddressPhone?: string | null
  shippingAddressName?: string | null
  shippingAddressAddress1?: string | null
  shippingAddressAddress2?: string | null
  shippingAddressCity?: string | null
  shippingAddressCountry?: string | null
  shippingAddressProvince?: string | null
  shippingAddressPostalCode?: string | null
  shippingAddressPhone?: string | null
  shippingAddressSameAsBilling?: boolean
  status?: string | null
  /** Order statistics nested object. */
  statistics?: RawSnipcartCustomerStatistics | null
  [key: string]: unknown
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseName(
  fullName: string | null | undefined,
  firstNameHint: string | null | undefined,
): { firstName?: string; lastName?: string } {
  if (!fullName) return { firstName: firstNameHint ?? undefined }
  const parts = fullName.trim().split(/\s+/)
  if (parts.length === 1) return { firstName: parts[0] }
  const firstName = firstNameHint ?? parts[0]
  const lastName = parts.slice(1).join(' ')
  return { firstName: firstName ?? undefined, lastName: lastName || undefined }
}

function mapBillingAddress(raw: RawSnipcartCustomer): Address | undefined {
  const line1 = raw.billingAddressAddress1 ?? undefined
  const city = raw.billingAddressCity ?? undefined
  const country = raw.billingAddressCountry ?? undefined
  const postalCode = raw.billingAddressPostalCode ?? undefined
  if (!line1 && !city && !country && !postalCode) return undefined
  return {
    line1,
    line2: raw.billingAddressAddress2 ?? undefined,
    city,
    region: raw.billingAddressProvince ?? undefined,
    postalCode,
    country,
  }
}

function mapShippingAddress(raw: RawSnipcartCustomer): Address | undefined {
  if (raw.shippingAddressSameAsBilling) return mapBillingAddress(raw)
  const line1 = raw.shippingAddressAddress1 ?? undefined
  const city = raw.shippingAddressCity ?? undefined
  const country = raw.shippingAddressCountry ?? undefined
  const postalCode = raw.shippingAddressPostalCode ?? undefined
  if (!line1 && !city && !country && !postalCode) return undefined
  return {
    line1,
    line2: raw.shippingAddressAddress2 ?? undefined,
    city,
    region: raw.shippingAddressProvince ?? undefined,
    postalCode,
    country,
  }
}

export function transformCustomer(raw: RawSnipcartCustomer): Customer {
  const { firstName, lastName } = parseName(raw.billingAddressName, undefined)
  const billingAddress = mapBillingAddress(raw)
  const shippingAddress = mapShippingAddress(raw)
  const stats = raw.statistics

  return {
    id: raw.id,
    email: raw.email ?? undefined,
    firstName,
    lastName,
    phone: raw.billingAddressPhone ?? undefined,
    acceptsMarketing: undefined,
    ordersCount: stats?.ordersCount,
    totalSpent:
      stats?.ordersAmount != null && Number.isFinite(stats.ordersAmount)
        ? { amount: majorToMinor(stats.ordersAmount, 'USD'), currency: 'USD' }
        : undefined,
    tags: undefined,
    defaultAddress: billingAddress,
    addresses: [billingAddress, shippingAddress].filter((a): a is Address => !!a),
    createdAt: undefined,
    updatedAt: undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
