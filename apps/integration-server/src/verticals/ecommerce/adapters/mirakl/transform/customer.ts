/**
 * Mirakl customer data → canonical Customer.
 *
 * Mirakl does not expose a dedicated `/api/customers` listing endpoint for
 * sellers. Customer identity is embedded in each Order object under the
 * `customer` field. This transform converts that embedded customer shape
 * to the canonical Customer so the adapter can return customers extracted
 * from orders.
 *
 * The `RawMiraklCustomer` type is re-exported from `./order` to keep the
 * raw shapes in one place.
 */

import type { Customer } from '../../../schema/customer'
import type { Address } from '../../../schema/shared'
import type { RawMiraklCustomer, RawMiraklAddress } from './order'

export type { RawMiraklCustomer } from './order'

function mapAddress(raw: RawMiraklAddress | null | undefined): Address | undefined {
  if (!raw) return undefined
  const line1 = raw.street_1 ?? undefined
  const line2 = raw.street_2 ?? undefined
  const city = raw.city ?? undefined
  const region = raw.state ?? undefined
  const postalCode = raw.zip_code ?? undefined
  const country = raw.country_iso_code ?? raw.country ?? undefined
  if (!line1 && !city && !postalCode && !country) return undefined
  return { line1, line2, city, region, postalCode, country }
}

/**
 * Transform an embedded Mirakl customer object (from an order response)
 * into a canonical Customer. The `orderId` is carried in `metadata` for
 * traceability.
 */
export function transformCustomer(raw: RawMiraklCustomer, orderId?: string): Customer {
  const billing = mapAddress(raw.billing_address)
  const shipping = mapAddress(raw.shipping_address)
  const addresses: Address[] = []
  if (billing) addresses.push(billing)
  if (shipping) addresses.push(shipping)

  const fullName =
    [raw.billing_address?.firstname, raw.billing_address?.lastname]
      .filter(Boolean)
      .join(' ') || undefined

  return {
    id: String(raw.customer_id ?? ''),
    email: raw.email ?? undefined,
    firstName: raw.billing_address?.firstname ?? undefined,
    lastName: raw.billing_address?.lastname ?? undefined,
    phone:
      raw.billing_address?.phone ??
      raw.billing_address?.phone_secondary ??
      undefined,
    defaultAddress: billing,
    addresses: addresses.length > 0 ? addresses : undefined,
    metadata: {
      ...(raw as Record<string, unknown>),
      fullName,
      sourceOrderId: orderId,
    },
  }
}
