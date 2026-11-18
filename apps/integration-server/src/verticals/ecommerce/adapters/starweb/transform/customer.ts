/**
 * Starweb Customer → canonical Customer.
 *
 * Starweb customer objects carry personal details at the top level.
 * Address data lives under an `addresses` include that is wrapped in a
 * `{data: {invoice, delivery}}` envelope. The actual address keys on the
 * data object are `invoice` and `delivery` (per CustomerUpdateModelAddresses
 * in the OpenAPI spec), NOT `customerInvoice`/`customerDelivery` (those
 * names appear on OrderAddressModel, not CustomerAddressesModel).
 *
 * Docs: https://api-docs.starweb.se/
 */

import type { Customer } from '../../../schema/customer'
import type { Address } from '../../../schema/shared'

export interface RawStarwebAddress {
  companyName?: string | null
  firstName?: string | null
  lastName?: string | null
  careOf?: string | null
  attention?: string | null
  reference?: string | null
  address?: string | null
  postalCode?: string | null
  city?: string | null
  state?: string | null
  countryCode?: string | null
  phoneNo?: string | null
  mobilePhoneNo?: string | null
  [key: string]: unknown
}

/**
 * The actual address keys returned inside `{data: ...}` for the customer
 * `addresses` include. Per CustomerUpdateModelAddresses in the OpenAPI spec
 * the keys are `invoice` and `delivery`.
 */
export interface RawStarwebCustomerAddressData {
  invoice?: RawStarwebAddress
  delivery?: RawStarwebAddress
  [key: string]: unknown
}

/** The `addresses` include on a customer is wrapped in a `{data: ...}` envelope. */
export interface RawStarwebCustomerAddresses {
  data?: RawStarwebCustomerAddressData
  [key: string]: unknown
}

export interface RawStarwebCustomer {
  customerId: number | string
  createdAt?: string | null
  modifiedAt?: string | null
  type?: string // 'person' | 'company'
  email?: string | null
  nationalIdNo?: string | null
  vatNo?: string | null
  approved?: boolean | null
  pricelistId?: number | null
  langCode?: string | null
  /** Nested include — wrapped in `{data: {invoice, delivery}}` by the API. */
  addresses?: RawStarwebCustomerAddresses
  [key: string]: unknown
}

function mapAddress(raw: RawStarwebAddress | null | undefined): Address | undefined {
  if (!raw) return undefined
  const line1 = raw.address ?? undefined
  const city = raw.city ?? undefined
  const postalCode = raw.postalCode ?? undefined
  const country = raw.countryCode ?? undefined
  if (!line1 && !city && !postalCode && !country) return undefined
  return {
    line1,
    city,
    region: raw.state ?? undefined,
    postalCode,
    country,
  }
}

export function transformCustomer(raw: RawStarwebCustomer): Customer {
  // addresses is wrapped in {data: {invoice, delivery}} per the OpenAPI spec.
  const addrData = raw.addresses?.data
  const billing = mapAddress(addrData?.invoice)
  const delivery = mapAddress(addrData?.delivery)
  const addresses: Address[] = []
  if (billing) addresses.push(billing)
  if (delivery) addresses.push(delivery)

  const phone =
    addrData?.invoice?.phoneNo ??
    addrData?.invoice?.mobilePhoneNo ??
    undefined

  return {
    id: String(raw.customerId),
    email: raw.email ?? undefined,
    firstName: addrData?.invoice?.firstName ?? undefined,
    lastName: addrData?.invoice?.lastName ?? undefined,
    phone,
    defaultAddress: billing,
    addresses: addresses.length > 0 ? addresses : undefined,
    createdAt: raw.createdAt ?? undefined,
    updatedAt: raw.modifiedAt ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Customer → Starweb customer body. */
export function untransformCustomer(customer: Partial<Customer>): Record<string, unknown> {
  const body: Record<string, unknown> = {
    email: customer.email,
    type: 'person',
  }
  if (customer.defaultAddress || customer.firstName || customer.lastName || customer.phone) {
    const a = customer.defaultAddress
    const invoiceAddr: Record<string, unknown> = {
      firstName: customer.firstName,
      lastName: customer.lastName,
      phoneNo: customer.phone,
      address: a?.line1,
      postalCode: a?.postalCode,
      city: a?.city,
      state: a?.region,
      countryCode: a?.country,
    }
    // Write path uses {invoice, delivery} keys per CustomerUpdateModelAddresses.
    body['addresses'] = { invoice: invoiceAddr, delivery: invoiceAddr }
  }
  return body
}
