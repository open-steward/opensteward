/**
 * Sana Commerce customer → canonical Customer.
 *
 * Customers are retrieved via:
 *  GET `customer/search`       — list customers (sales-agent authenticated)
 *  GET `customer/shippingaddresses/{customerId}` — shipping addresses
 *
 * Sana Commerce is primarily a B2B platform. "Customers" are business
 * accounts, and individual contacts (buyers) are associated with them.
 * We surface the account as the canonical Customer.
 *
 * Docs:
 *  https://help.sana-commerce.com/sana-commerce-90/how_tos/web-service-developer-guide/api-methods
 */

import type { Customer } from '../../../schema/customer'
import type { Address } from '../../../schema/shared'
import { majorToMinor } from '../../../schema/shared'

export interface RawSanaAddress {
  Street?: string | null
  street?: string | null
  Street2?: string | null
  street2?: string | null
  City?: string | null
  city?: string | null
  ZipCode?: string | null
  zipCode?: string | null
  State?: string | null
  state?: string | null
  CountryCode?: string | null
  countryCode?: string | null
  Country?: string | null
  country?: string | null
  [key: string]: unknown
}

export interface RawSanaCustomer {
  Id?: number | string | null
  id?: number | string | null
  CustomerId?: string | null
  customerId?: string | null
  Email?: string | null
  email?: string | null
  FirstName?: string | null
  firstName?: string | null
  LastName?: string | null
  lastName?: string | null
  Name?: string | null
  name?: string | null
  Phone?: string | null
  phone?: string | null
  TotalOrderAmount?: number | null
  totalOrderAmount?: number | null
  Currency?: string | null
  currency?: string | null
  Address?: RawSanaAddress | null
  address?: RawSanaAddress | null
  [key: string]: unknown
}

function str(v: string | number | null | undefined): string | undefined {
  if (v == null) return undefined
  return String(v).trim() || undefined
}

function mapAddress(raw: RawSanaAddress | null | undefined): Address | undefined {
  if (!raw) return undefined
  const line1 = str(raw.Street ?? raw.street)
  const city = str(raw.City ?? raw.city)
  const postalCode = str(raw.ZipCode ?? raw.zipCode)
  const country = str(raw.CountryCode ?? raw.countryCode ?? raw.Country ?? raw.country)
  if (!line1 && !city && !postalCode && !country) return undefined
  return {
    line1,
    line2: str(raw.Street2 ?? raw.street2),
    city,
    region: str(raw.State ?? raw.state),
    postalCode,
    country,
  }
}

export function transformCustomer(raw: RawSanaCustomer): Customer {
  const id = str(raw.Id ?? raw.id ?? raw.CustomerId ?? raw.customerId) ?? ''
  const currency = str(raw.Currency ?? raw.currency) ?? 'EUR'
  const totalOrderAmount = raw.TotalOrderAmount ?? raw.totalOrderAmount

  // Sana Commerce B2B: Name field may contain the company name; try to split
  // into first/last for canonical shape, falling back to name in firstName.
  const rawFirst = str(raw.FirstName ?? raw.firstName)
  const rawLast = str(raw.LastName ?? raw.lastName)
  const rawName = str(raw.Name ?? raw.name)
  let firstName = rawFirst
  let lastName = rawLast
  if (!firstName && !lastName && rawName) {
    const parts = rawName.split(' ')
    firstName = parts.slice(0, 1).join(' ') || rawName
    lastName = parts.slice(1).join(' ') || undefined
  }

  return {
    id,
    email: str(raw.Email ?? raw.email),
    firstName,
    lastName,
    phone: str(raw.Phone ?? raw.phone),
    totalSpent:
      totalOrderAmount != null && Number.isFinite(totalOrderAmount)
        ? { amount: majorToMinor(totalOrderAmount, currency), currency }
        : undefined,
    defaultAddress: mapAddress(raw.Address ?? raw.address),
    metadata: raw as unknown as Record<string, unknown>,
  }
}
