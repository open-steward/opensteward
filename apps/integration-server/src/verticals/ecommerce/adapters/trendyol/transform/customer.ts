/**
 * Trendyol customer data extracted from order objects → canonical Customer.
 *
 * Trendyol does NOT expose a standalone customer management API. Customer
 * data is embedded within order (shipment package) responses:
 *   customerFirstName, customerLastName, customerEmail, customerId,
 *   invoiceAddress (contains address fields).
 *
 * This transform constructs a minimal Customer from order-level fields.
 * It is used by the adapter to satisfy getCustomer / listCustomers by
 * synthesizing customers from order data only.
 */

import type { Customer } from '../../../schema/customer'
import type { Address } from '../../../schema/shared'

export interface RawTrendyolOrderCustomer {
  customerId?: number | string | null
  customerFirstName?: string | null
  customerLastName?: string | null
  customerEmail?: string | null
  /** Phone from invoiceAddress or shipmentAddress. */
  phone?: string | null
  /** Address from invoiceAddress on the order. */
  address?: {
    address1?: string | null
    address2?: string | null
    city?: string | null
    district?: string | null
    postalCode?: string | null
    countryCode?: string | null
    addressLines?: { addressLine1?: string | null; addressLine2?: string | null } | null
  } | null
  [key: string]: unknown
}

function mapAddress(
  raw: RawTrendyolOrderCustomer['address'],
): Address | undefined {
  if (!raw) return undefined
  const line1 =
    raw.address1 ??
    raw.addressLines?.addressLine1 ??
    undefined
  if (!line1 && !raw.city && !raw.postalCode && !raw.countryCode) return undefined
  return {
    line1: line1 ?? undefined,
    line2: raw.address2 ?? raw.addressLines?.addressLine2 ?? undefined,
    city: raw.city ?? raw.district ?? undefined,
    postalCode: raw.postalCode ?? undefined,
    country: raw.countryCode ?? undefined,
  }
}

export function transformCustomer(raw: RawTrendyolOrderCustomer): Customer {
  const addr = mapAddress(raw.address)
  return {
    id: raw.customerId != null ? String(raw.customerId) : `trendyol-${raw.customerEmail ?? 'unknown'}`,
    email: raw.customerEmail ?? undefined,
    firstName: raw.customerFirstName ?? undefined,
    lastName: raw.customerLastName ?? undefined,
    phone: raw.phone ?? undefined,
    defaultAddress: addr,
    addresses: addr ? [addr] : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
