/**
 * Nuvei getUserDetails response → canonical Customer.
 *
 * Nuvei manages customers as "users" identified by a merchant-assigned
 * `userTokenId`. The `getUserDetails.do` endpoint returns a `userDetails`
 * sub-object containing the user's profile. There is no Nuvei-side numeric
 * balance concept for users, so `balance` is omitted.
 *
 * Transforms never throw — missing optionals collapse to `undefined`.
 */
import type { Customer } from '../../../schema/customer'
import { toIsoDatetime } from '@opensteward/shared'
import { pickStr, strMap } from './shared'

export interface RawNuveiUserDetails {
  firstName?: string
  lastName?: string
  email?: string
  phone?: string
  address?: string
  city?: string
  zip?: string
  state?: string
  countryCode?: string
  county?: string
  locale?: string
  birthdate?: string
  userTokenId?: string
  userId?: string
  [k: string]: unknown
}

export interface RawNuveiGetUserDetailsResponse {
  userTokenId?: string
  userId?: string
  userDetails?: RawNuveiUserDetails
  status?: string
  errCode?: number
  reason?: string
  merchantId?: string
  merchantSiteId?: string
  clientRequestId?: string
  version?: string
  createdAt?: string
  updatedAt?: string
  [k: string]: unknown
}

export function transformCustomer(raw: RawNuveiGetUserDetailsResponse): Customer {
  const details = raw.userDetails ?? {}
  const id = raw.userTokenId ?? details.userTokenId ?? details.userId ?? ''
  const name = [details.firstName, details.lastName].filter(Boolean).join(' ') || undefined

  return {
    id: String(id),
    externalId: String(id),
    email: pickStr(details.email),
    name: pickStr(name),
    phone: pickStr(details.phone),
    defaultPaymentMethodId: undefined,
    billingAddress:
      details.address || details.city || details.countryCode
        ? {
            line1: pickStr(details.address),
            city: pickStr(details.city),
            postalCode: pickStr(details.zip),
            region: pickStr(details.state),
            country: pickStr(details.countryCode),
          }
        : undefined,
    shippingAddress: undefined,
    currency: undefined,
    balance: undefined,
    delinquent: undefined,
    description: undefined,
    gateway: 'nuvei',
    metadata: strMap({
      userId: details.userId,
      locale: details.locale,
      birthdate: details.birthdate,
      county: details.county,
    }),
    createdAt: toIsoDatetime(raw.createdAt),
    updatedAt: toIsoDatetime(raw.updatedAt),
    raw,
  }
}
