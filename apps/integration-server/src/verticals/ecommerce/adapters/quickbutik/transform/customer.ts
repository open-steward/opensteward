/**
 * Quickbutik Customer → canonical Customer.
 *
 * Quickbutik does not expose a standalone /customers endpoint in its public
 * REST API. Customer data is embedded inside order objects when fetched with
 * `include_details=true`. This transform converts the embedded customer shape
 * to the canonical Customer type.
 *
 * Because customers are only available via orders, this transform is used by
 * the order-based customer extraction path in the adapter (listCustomers is
 * not available and is intentionally omitted from index.ts).
 */

import type { Customer } from '../../../schema/customer'
import type { Address } from '../../../schema/shared'

// ── Raw Quickbutik shape ──────────────────────────────────────────────────────

export interface RawQuickbutikCustomerShippingDetails {
  firstname?: string | null
  lastname?: string | null
  company_name?: string | null
  address?: string | null
  address2?: string | null
  city?: string | null
  zipcode?: string | null
  country?: string | null
  [key: string]: unknown
}

export interface RawQuickbutikCustomer {
  /** Quickbutik uses `type: "consumer" | "business"`. */
  type?: string | null
  email?: string | null
  phone_number?: string | null
  shipping_details?: RawQuickbutikCustomerShippingDetails | null
  newsletter_subscribe?: boolean
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function mapAddress(
  details: RawQuickbutikCustomerShippingDetails | null | undefined,
): Address | undefined {
  if (!details) return undefined
  const line1 = details.address ?? undefined
  const line2 = details.address2 ?? undefined
  const city = details.city ?? undefined
  const postalCode = details.zipcode ?? undefined
  const country = details.country ?? undefined
  if (!line1 && !city && !postalCode && !country) return undefined
  return { line1, line2, city, postalCode, country }
}

// ── Transform ─────────────────────────────────────────────────────────────────

/**
 * Transform a Quickbutik embedded customer into the canonical Customer shape.
 * A synthetic id is derived from the email since Quickbutik customers embedded
 * in orders don't have a standalone numeric id.
 */
export function transformCustomer(
  raw: RawQuickbutikCustomer,
  derivedId: string,
): Customer {
  const details = raw.shipping_details
  const address = mapAddress(details)

  return {
    id: derivedId,
    email: raw.email ?? undefined,
    firstName: details?.firstname ?? undefined,
    lastName: details?.lastname ?? undefined,
    phone: raw.phone_number ?? undefined,
    acceptsMarketing: raw.newsletter_subscribe,
    defaultAddress: address,
    addresses: address ? [address] : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
