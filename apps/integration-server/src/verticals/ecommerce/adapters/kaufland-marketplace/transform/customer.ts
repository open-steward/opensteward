/**
 * Kaufland Marketplace Buyer → canonical Customer.
 *
 * Kaufland does not expose a standalone customer resource in its Seller API.
 * Buyer information is carried on each order-unit (billing_address + buyer
 * object). We synthesise a canonical Customer from the data available on an
 * order-unit. The canonical customer id is the Kaufland id_buyer.
 *
 * Because there is no dedicated customer list/get endpoint, only
 * `transformCustomer` (read-only) is exposed here. Write operations are not
 * supported and will auto-501 via the adapter registry.
 *
 * Docs: https://sellerapi.kaufland.com/?page=managing-orders
 */

import type { Customer } from '../../../schema/customer'
import type { Address } from '../../../schema/shared'

// ── Raw Kaufland shapes ───────────────────────────────────────────────────────

export interface RawKauflandBuyerAddress {
  first_name?: string | null
  last_name?: string | null
  company_name?: string | null
  street?: string | null
  house_number?: string | null
  postcode?: string | null
  additional_field?: string | null
  city?: string | null
  phone?: string | null
  country?: string | null
}

/**
 * A Kaufland buyer as extracted from an order-unit. The buyer object itself
 * only carries id_buyer and email; address fields come from billing_address.
 */
export interface RawKauflandBuyer {
  id_buyer?: number | string | null
  email?: string | null
  billing_address?: RawKauflandBuyerAddress | null
  currency?: string | null
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function mapAddress(raw: RawKauflandBuyerAddress | null | undefined): Address | undefined {
  if (!raw) return undefined
  const street = raw.street ?? undefined
  const houseNum = raw.house_number ?? undefined
  const line1 = street && houseNum ? `${street} ${houseNum}` : (street ?? houseNum ?? undefined)
  const city = raw.city ?? undefined
  const postalCode = raw.postcode ?? undefined
  const country = raw.country ?? undefined
  if (!line1 && !city && !postalCode && !country) return undefined
  return {
    line1,
    line2: raw.additional_field ?? undefined,
    city,
    postalCode,
    country,
  }
}

// ── Transforms ───────────────────────────────────────────────────────────────

/**
 * Transform a Kaufland buyer (as extracted from an order-unit) to the
 * canonical Customer type.
 */
export function transformCustomer(raw: RawKauflandBuyer): Customer {
  const address = mapAddress(raw.billing_address)
  return {
    id: raw.id_buyer != null ? String(raw.id_buyer) : '',
    email: raw.email ?? undefined,
    firstName: raw.billing_address?.first_name ?? undefined,
    lastName: raw.billing_address?.last_name ?? undefined,
    phone: raw.billing_address?.phone ?? undefined,
    defaultAddress: address,
    addresses: address ? [address] : undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
