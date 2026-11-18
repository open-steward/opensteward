/**
 * Shift4Shop Customer → canonical Customer.
 *
 * Shift4Shop customers live under `/Customers`. Each customer has an
 * embedded `BillingAddress` field with name, address, phone etc.
 */

import type { Customer } from '../../../schema/customer'
import { toIsoDatetime } from '@opensteward/shared'
import type { Address } from '../../../schema/shared'
import { majorToMinor } from '../../../schema/shared'

// ── Raw Shift4Shop shapes ────────────────────────────────────────────────────

export interface RawShift4ShopCustomerAddress {
  FirstName?: string | null
  LastName?: string | null
  Address?: string | null
  Address2?: string | null
  City?: string | null
  State?: string | null
  Zip?: string | null
  Country?: string | null
  Phone?: string | null
  [key: string]: unknown
}

export interface RawShift4ShopCustomer {
  CustomerID?: number | string | null
  EMail?: string | null
  FirstName?: string | null
  LastName?: string | null
  Phone?: string | null
  DateCreated?: string | null
  LastLogin?: string | null
  MailList?: string | number | null
  OrdersCount?: number | string | null
  TotalOrdered?: number | string | null
  BillingAddress?: RawShift4ShopCustomerAddress | null
  ShippingAddressList?: RawShift4ShopCustomerAddress[] | null
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function toNum(v: number | string | null | undefined): number {
  if (v == null || v === '') return 0
  const n = typeof v === 'string' ? parseFloat(v) : v
  return isNaN(n) ? 0 : Math.round(n * 100) / 100
}

function mapAddress(raw: RawShift4ShopCustomerAddress | null | undefined): Address | undefined {
  if (!raw) return undefined
  const line1 = raw.Address ?? undefined
  const line2 = raw.Address2 ?? undefined
  const city = raw.City ?? undefined
  const region = raw.State ?? undefined
  const postalCode = raw.Zip ?? undefined
  const country = raw.Country ?? undefined
  if (!line1 && !city && !postalCode && !country) return undefined
  return { line1, line2, city, region, postalCode, country }
}

function isMailListEnabled(v: string | number | null | undefined): boolean | undefined {
  if (v == null) return undefined
  return v === 1 || v === '1' || v === 'true'
}

export function transformCustomer(raw: RawShift4ShopCustomer): Customer {
  const defaultAddress = mapAddress(raw.BillingAddress)

  const addresses: Address[] = []
  if (defaultAddress) addresses.push(defaultAddress)
  for (const addr of raw.ShippingAddressList ?? []) {
    const mapped = mapAddress(addr)
    if (mapped) addresses.push(mapped)
  }

  // Phone priority: root customer phone → billing address phone.
  const phone =
    (raw.Phone && String(raw.Phone).trim()) ||
    (raw.BillingAddress?.Phone && String(raw.BillingAddress.Phone).trim()) ||
    undefined

  const ordersCount = raw.OrdersCount != null ? Math.round(toNum(raw.OrdersCount)) : undefined
  const totalSpent = raw.TotalOrdered != null
    ? { amount: majorToMinor(toNum(raw.TotalOrdered), 'USD'), currency: 'USD' }
    : undefined

  return {
    id: String(raw.CustomerID ?? ''),
    email: raw.EMail ?? undefined,
    firstName: raw.FirstName ?? undefined,
    lastName: raw.LastName ?? undefined,
    phone: phone || undefined,
    acceptsMarketing: isMailListEnabled(raw.MailList),
    ordersCount,
    totalSpent,
    defaultAddress,
    addresses: addresses.length > 0 ? addresses : undefined,
    createdAt: toIsoDatetime(raw.DateCreated),
    updatedAt: toIsoDatetime(raw.LastLogin),
    metadata: raw as unknown as Record<string, unknown>,
  }
}
