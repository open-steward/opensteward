/**
 * 2Checkout Customer ↔ canonical Customer.
 *
 * 2Checkout identifies a customer by `AvangateCustomerReference` (the stable
 * 2Checkout-assigned id) and optionally an `ExternalCustomerReference` the
 * merchant supplies. Person details live at the top level of the customer
 * record.
 *
 * Docs: https://docs.2checkout.com/get-started-with-the-2checkout-api
 */
import type { Customer } from '../../../schema/customer'
import type { Address } from '../../../schema/shared'
import { toIsoDatetime } from '@opensteward/shared'
import { pickStr, strMap } from './shared'

export interface RawVerifone2checkoutCustomer {
  AvangateCustomerReference?: string | number
  ExternalCustomerReference?: string | null
  Email?: string | null
  FirstName?: string | null
  LastName?: string | null
  Phone?: string | null
  Company?: string | null
  Address1?: string | null
  Address2?: string | null
  City?: string | null
  State?: string | null
  Zip?: string | null
  CountryCode?: string | null
  Enabled?: boolean
  [k: string]: unknown
}

function mapAddress(raw: RawVerifone2checkoutCustomer): Address | undefined {
  const line1 = pickStr(raw.Address1)
  const city = pickStr(raw.City)
  const postalCode = pickStr(raw.Zip)
  const country = pickStr(raw.CountryCode)
  if (!line1 && !city && !postalCode && !country) return undefined
  return {
    line1,
    line2: pickStr(raw.Address2),
    city,
    region: pickStr(raw.State),
    postalCode,
    country: country?.toUpperCase(),
  }
}

export function transformCustomer(raw: RawVerifone2checkoutCustomer): Customer {
  const name = [pickStr(raw.FirstName), pickStr(raw.LastName)].filter(Boolean).join(' ').trim()
  const reference = String(raw.AvangateCustomerReference ?? raw.ExternalCustomerReference ?? '')
  return {
    id: reference,
    externalId: reference,
    email: pickStr(raw.Email),
    name: name || undefined,
    phone: pickStr(raw.Phone),
    billingAddress: mapAddress(raw),
    gateway: 'verifone-2checkout',
    metadata: strMap({
      externalCustomerReference: raw.ExternalCustomerReference,
      company: raw.Company,
      enabled: raw.Enabled,
    }),
    createdAt: toIsoDatetime(raw.CreatedAt),
    raw,
  }
}
