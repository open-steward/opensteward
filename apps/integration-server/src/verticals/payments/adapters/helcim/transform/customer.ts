/**
 * Helcim `Customer` ↔ canonical Customer.
 *
 * Helcim customers are first-class at `/customers`. The natural key is the
 * human-readable `customerCode` (also accepted by the Payment API), while `id`
 * is the numeric primary key. We surface the numeric `id` as the canonical id
 * and keep `customerCode` as `externalId` since it is the cross-API handle.
 *
 * Name resolves to `contactName`, falling back to `businessName`. Billing /
 * shipping addresses are nested objects. There is no `dateCreated` /
 * `dateModified` on the customer payload, so the canonical timestamps stay
 * undefined.
 *
 * Refs:
 *   https://devdocs.helcim.com/reference/getcustomers
 *   https://devdocs.helcim.com/reference/getcustomer
 */
import type { Customer } from '../../../schema/customer'
import type { Address } from '../../../schema/shared'
import { strMap } from './shared'

export interface RawHelcimAddress {
  name?: string
  street1?: string
  street2?: string
  city?: string
  province?: string
  country?: string
  postalCode?: string
  phone?: string
  email?: string
  [k: string]: unknown
}

export interface RawHelcimCustomer {
  id?: number | string
  customerCode?: string
  contactName?: string
  businessName?: string
  cellPhone?: string
  businessPhone?: string
  email?: string
  billingAddress?: RawHelcimAddress
  shippingAddress?: RawHelcimAddress
  cards?: unknown[]
  [k: string]: unknown
}

function mapAddress(raw: RawHelcimAddress | undefined): Address | undefined {
  if (!raw) return undefined
  const line1 = raw.street1 || undefined
  const city = raw.city || undefined
  const postalCode = raw.postalCode || undefined
  const country = raw.country || undefined
  if (!line1 && !city && !postalCode && !country) return undefined
  return {
    line1,
    line2: raw.street2 || undefined,
    city,
    region: raw.province || undefined,
    postalCode,
    country: country ? country.toUpperCase() : undefined,
  }
}

export function transformCustomer(raw: RawHelcimCustomer): Customer {
  const billing = raw.billingAddress
  const email = raw.email || billing?.email || undefined
  const phone = raw.cellPhone || raw.businessPhone || billing?.phone || undefined
  return {
    id: String(raw.id ?? raw.customerCode ?? ''),
    externalId: String(raw.customerCode ?? raw.id ?? ''),
    email,
    name: raw.contactName || raw.businessName || billing?.name || undefined,
    phone,
    billingAddress: mapAddress(raw.billingAddress),
    shippingAddress: mapAddress(raw.shippingAddress),
    gateway: 'helcim',
    metadata: strMap({
      customerCode: raw.customerCode,
      businessName: raw.businessName,
      contactName: raw.contactName,
    }),
    raw,
  }
}
