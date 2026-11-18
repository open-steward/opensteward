import type { Customer } from '../../../schema/customer'
import { toIsoDatetime } from '@opensteward/shared'
import { priceCurrency, strMap, type AmazonPayPrice } from './shared'

/**
 * Amazon Pay has no standalone customer resource — buyer details are exposed
 * via a Charge Permission. We map a Charge Permission (and its embedded buyer)
 * onto the canonical Customer: the chargePermissionId is the stable id and the
 * buyer carries the contact fields.
 *
 * Docs: https://developer.amazon.com/docs/amazon-pay-api-v2/charge-permission.html
 */
interface AmazonPayBuyer {
  buyerId?: string
  name?: string
  email?: string
  phoneNumber?: string
  primeMembershipTypes?: string | null
}

interface AmazonPayAddress {
  name?: string
  addressLine1?: string
  city?: string
  stateOrRegion?: string
  postalCode?: string
  countryCode?: string
  phoneNumber?: string
}

export interface RawAmazonPayChargePermission {
  chargePermissionId?: string
  chargePermissionReferenceId?: string | null
  chargePermissionType?: string
  buyer?: AmazonPayBuyer
  billingAddress?: AmazonPayAddress | null
  shippingAddress?: AmazonPayAddress | null
  limits?: {
    amountLimit?: AmazonPayPrice
    amountBalance?: AmazonPayPrice
  }
  statusDetails?: {
    state?: string
    reasons?: Array<{ reasonCode?: string; reasonDescription?: string }>
    lastUpdatedTimestamp?: string
  }
  presentmentCurrency?: string
  creationTimestamp?: string
  expirationTimestamp?: string
  releaseEnvironment?: string
  [k: string]: unknown
}

export function transformCustomer(raw: RawAmazonPayChargePermission): Customer {
  const buyer = raw.buyer ?? {}
  const currency =
    raw.presentmentCurrency != null
      ? raw.presentmentCurrency.toUpperCase()
      : raw.limits?.amountLimit
        ? priceCurrency(raw.limits.amountLimit)
        : undefined
  return {
    id: String(raw.chargePermissionId ?? ''),
    externalId: String(raw.chargePermissionId ?? ''),
    email: buyer.email ?? undefined,
    name: buyer.name ?? undefined,
    phone: buyer.phoneNumber ?? raw.billingAddress?.phoneNumber ?? undefined,
    currency,
    gateway: 'amazon-pay',
    metadata: strMap({
      buyerId: buyer.buyerId,
      chargePermissionType: raw.chargePermissionType,
      chargePermissionReferenceId: raw.chargePermissionReferenceId,
      primeMembershipTypes: buyer.primeMembershipTypes,
      state: raw.statusDetails?.state,
      releaseEnvironment: raw.releaseEnvironment,
    }),
    createdAt: toIsoDatetime(raw.creationTimestamp),
    updatedAt: toIsoDatetime(raw.statusDetails?.lastUpdatedTimestamp),
    raw,
  }
}
