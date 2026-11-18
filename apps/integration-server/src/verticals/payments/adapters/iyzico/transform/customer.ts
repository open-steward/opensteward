import { toIsoDatetime } from '@opensteward/shared'
import type { Customer } from '../../../schema/customer'
import { strMap } from './shared'

/**
 * iyzico subscriber object — returned by
 *   GET /v2/subscription/customers
 *   GET /v2/subscription/customers/{customerReferenceCode}
 *
 * iyzico calls these "subscribers" and associates them exclusively with
 * subscription plans; they are not standalone payer records for one-off
 * charges. The `referenceCode` is the stable subscriber identifier.
 *
 * Docs: https://docs.iyzico.com/en/products/subscription/subscription-implementation/subscriber-transactions
 */
export interface RawIyzicoSubscriber {
  referenceCode?: string
  createdDate?: number | string
  status?: string
  name?: string
  surname?: string
  identityNumber?: string
  email?: string
  gsmNumber?: string
  contactEmail?: string
  contactGsmNumber?: string
  billingAddress?: {
    contactName?: string
    city?: string
    country?: string
    address?: string
    zipCode?: string
  }
  shippingAddress?: {
    contactName?: string
    city?: string
    country?: string
    address?: string
    zipCode?: string
  }
  [k: string]: unknown
}

/** Envelope for GET /v2/subscription/customers (list). */
export interface RawIyzicoSubscriberListResponse {
  status?: string
  systemTime?: number
  data?: {
    totalCount?: number
    currentPage?: number
    pageCount?: number
    items?: RawIyzicoSubscriber[]
  }
  [k: string]: unknown
}

/** Envelope for GET /v2/subscription/customers/{id} (single). */
export interface RawIyzicoSubscriberDetailResponse {
  status?: string
  systemTime?: number
  data?: RawIyzicoSubscriber
  [k: string]: unknown
}

export function transformCustomer(raw: RawIyzicoSubscriber): Customer {
  const fullName = [raw.name, raw.surname].filter(Boolean).join(' ') || undefined
  const billing = raw.billingAddress
  const shipping = raw.shippingAddress

  return {
    id: String(raw.referenceCode ?? ''),
    externalId: String(raw.referenceCode ?? ''),
    email: raw.email ?? raw.contactEmail ?? undefined,
    name: fullName,
    phone: raw.gsmNumber ?? raw.contactGsmNumber ?? undefined,
    defaultPaymentMethodId: undefined,
    billingAddress: billing
      ? {
          line1: billing.address ?? undefined,
          city: billing.city ?? undefined,
          // iyzico returns full country names (e.g. "Turkey"), not ISO 3166-1 alpha-2 codes;
          // omit to avoid schema validation failure.
          postalCode: billing.zipCode ?? undefined,
        }
      : undefined,
    shippingAddress: shipping
      ? {
          line1: shipping.address ?? undefined,
          city: shipping.city ?? undefined,
          postalCode: shipping.zipCode ?? undefined,
        }
      : undefined,
    currency: undefined,
    balance: undefined,
    delinquent: undefined,
    description: undefined,
    gateway: 'iyzico',
    metadata: strMap({
      identityNumber: raw.identityNumber,
      status: raw.status,
      contactEmail: raw.contactEmail,
      contactGsmNumber: raw.contactGsmNumber,
    }),
    createdAt: toIsoDatetime(raw.createdDate),
    updatedAt: undefined,
    raw,
  }
}
