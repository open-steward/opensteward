/**
 * Volusion Customer → canonical Customer.
 */

import type { Customer } from '../../../schema/customer'
import type { Address } from '../../../schema/shared'
import { majorToMinor } from '../../../schema/shared'

export interface RawVolusionAddress {
  Address1?: string | null
  Address2?: string | null
  City?: string | null
  State?: string | null
  PostalCode?: string | null
  Country?: string | null
  PhoneNumber?: string | null
  [key: string]: unknown
}

export interface RawVolusionCustomer {
  CustomerID: number | string
  EmailAddress?: string | null
  FirstName?: string | null
  LastName?: string | null
  PhoneNumber?: string | null
  NewsletterSubscriber?: boolean
  TotalOrders?: number
  TotalSpent?: number | string | null
  BillingAddress?: RawVolusionAddress | null
  ShippingAddress?: RawVolusionAddress | null
  DateCreated?: string | null
  LastModified?: string | null
  [key: string]: unknown
}

function mapAddress(raw: RawVolusionAddress | null | undefined): Address | undefined {
  if (!raw) return undefined
  const line1 = raw.Address1 ?? undefined
  const line2 = raw.Address2 ?? undefined
  const city = raw.City ?? undefined
  const region = raw.State ?? undefined
  const postalCode = raw.PostalCode ?? undefined
  const country = raw.Country ?? undefined
  if (!line1 && !city && !postalCode && !country) return undefined
  return { line1, line2, city, region, postalCode, country }
}

export function transformCustomer(raw: RawVolusionCustomer): Customer {
  const totalSpentNum =
    typeof raw.TotalSpent === 'string' ? parseFloat(raw.TotalSpent) : raw.TotalSpent
  const billing = mapAddress(raw.BillingAddress)
  const shipping = mapAddress(raw.ShippingAddress)
  const addresses = [billing, shipping].filter((a): a is Address => !!a)

  return {
    id: String(raw.CustomerID),
    email: raw.EmailAddress ?? undefined,
    firstName: raw.FirstName ?? undefined,
    lastName: raw.LastName ?? undefined,
    phone: raw.PhoneNumber ?? undefined,
    acceptsMarketing: raw.NewsletterSubscriber,
    ordersCount: raw.TotalOrders,
    totalSpent:
      totalSpentNum != null && !Number.isNaN(totalSpentNum)
        ? { amount: majorToMinor(totalSpentNum, 'USD'), currency: 'USD' }
        : undefined,
    defaultAddress: billing,
    addresses: addresses.length > 0 ? addresses : undefined,
    createdAt: raw.DateCreated ?? undefined,
    updatedAt: raw.LastModified ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function untransformCustomer(customer: Partial<Customer>): Record<string, unknown> {
  const body: Record<string, unknown> = {
    EmailAddress: customer.email,
    FirstName: customer.firstName,
    LastName: customer.lastName,
    PhoneNumber: customer.phone,
    NewsletterSubscriber: customer.acceptsMarketing,
  }
  if (customer.defaultAddress) {
    const a = customer.defaultAddress
    body.BillingAddress = {
      Address1: a.line1,
      Address2: a.line2,
      City: a.city,
      State: a.region,
      PostalCode: a.postalCode,
      Country: a.country,
    }
  }
  return body
}
