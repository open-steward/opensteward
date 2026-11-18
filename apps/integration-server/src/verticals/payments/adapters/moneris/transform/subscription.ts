import { toIsoDatetime } from '@opensteward/shared'
import type { Subscription, SubscriptionStatus } from '../../../schema/subscription'
import { customDataToMetadata, required, type MonerisCustomData, type MonerisMoney } from './shared'

/**
 * `subscriptionStatus`: `"enum": ["DECLINED", "DECLINED_RETRY", "PAUSED",
 * "ACTIVE", "CANCELED", "COMPLETED"]`.
 */
export type MonerisSubscriptionStatus =
  'DECLINED' | 'DECLINED_RETRY' | 'PAUSED' | 'ACTIVE' | 'CANCELED' | 'COMPLETED'

/**
 * `subscription` (Moneris API 2.15.1,
 * https://developer.moneris.com/moneris-api/reference/getsubscriptions.md),
 * the fields read here. `"required": ["subscriptionId", "merchantId",
 * "orderId", "createdAt", "subscriptionType", "billingInformation",
 * "paymentMethod", "subscriptionStatus"]`.
 */
export interface RawMonerisSubscription {
  subscriptionId: string
  merchantId: string
  customerId?: string | null
  createdAt: string
  modifiedAt?: string | null
  billingInformation: {
    /** "The amount of the subscription transaction. The value must be in cents." */
    billingAmount: MonerisMoney
    [k: string]: unknown
  }
  paymentMethod?: { paymentMethodId?: string } | null
  subscriptionStatus: MonerisSubscriptionStatus
  customData?: MonerisCustomData
  [k: string]: unknown
}

const STATUS: Record<MonerisSubscriptionStatus, SubscriptionStatus> = {
  ACTIVE: 'active',
  PAUSED: 'paused',
  CANCELED: 'cancelled',
  COMPLETED: 'expired',
  DECLINED_RETRY: 'past_due',
  DECLINED: 'unknown',
}

/**
 * One item per subscription: Moneris bills a single `billingAmount` per
 * cycle, so the item carries the subscription's own id. `customerId` is
 * nullable upstream but required by the canonical subscription, so a
 * subscription without one throws rather than invent one.
 */
export function transformSubscription(raw: RawMonerisSubscription): Subscription {
  const id = required(raw.subscriptionId, 'subscription.subscriptionId')
  const billing = required(
    raw.billingInformation?.billingAmount,
    `subscription ${id} billingAmount`,
  )
  return {
    id,
    externalId: id,
    customerId: required(raw.customerId, `subscription ${id} customerId`),
    status: STATUS[raw.subscriptionStatus] ?? 'unknown',
    currency: required(billing.currency, `subscription ${id} billingAmount.currency`),
    items: [{ id, amount: required(billing.amount, `subscription ${id} billingAmount.amount`) }],
    defaultPaymentMethodId: raw.paymentMethod?.paymentMethodId ?? undefined,
    gateway: 'moneris',
    metadata: customDataToMetadata(raw.customData),
    createdAt: toIsoDatetime(raw.createdAt),
    updatedAt: toIsoDatetime(raw.modifiedAt),
    raw,
  }
}
