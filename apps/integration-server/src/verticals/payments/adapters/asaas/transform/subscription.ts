/**
 * Asaas Subscription ↔ canonical Subscription.
 *
 * An Asaas subscription is a recurring-billing definition: a customer, a
 * `value` (reais), a `cycle`, a `nextDueDate` and a coarse `status`
 * (ACTIVE / EXPIRED / INACTIVE). It has no line-item model, so the canonical
 * `items` array carries a single synthetic item holding the recurring amount.
 *
 * Money is decimal reais → integer centavos; currency is always BRL.
 *
 * Refs: https://docs.asaas.com/reference/list-subscriptions
 */
import type {
  Subscription,
  SubscriptionStatus,
  SubscriptionItem,
} from '../../../schema/subscription'
import { ASAAS_CURRENCY, strMap, toIsoDatetime, toMinorUnits } from './shared'

export interface RawAsaasSubscription {
  object?: string
  id?: string
  dateCreated?: string
  customer?: string
  billingType?: string
  cycle?: string
  value?: number
  nextDueDate?: string
  endDate?: string
  description?: string
  status?: string
  deleted?: boolean
  maxPayments?: number
  externalReference?: string
  [k: string]: unknown
}

/** Asaas subscription `status`: ACTIVE, EXPIRED, INACTIVE. */
function mapStatus(raw: RawAsaasSubscription): SubscriptionStatus {
  switch ((raw.status ?? '').toUpperCase()) {
    case 'ACTIVE':
      return 'active'
    case 'EXPIRED':
      return 'expired'
    case 'INACTIVE':
      return 'paused'
    default:
      return 'active'
  }
}

export function transformSubscription(raw: RawAsaasSubscription): Subscription {
  const amount = toMinorUnits(raw.value)
  const items: SubscriptionItem[] = [
    {
      id: `${raw.id ?? ''}-item`,
      quantity: 1,
      ...(amount !== undefined ? { amount } : {}),
      metadata: strMap({ cycle: raw.cycle, billingType: raw.billingType }),
    },
  ]
  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    customerId: String(raw.customer ?? ''),
    status: mapStatus(raw),
    currency: ASAAS_CURRENCY,
    items,
    currentPeriodEnd: toIsoDatetime(raw.nextDueDate),
    cancelAt: toIsoDatetime(raw.endDate),
    gateway: 'asaas',
    metadata: strMap({
      cycle: raw.cycle,
      billingType: raw.billingType,
      description: raw.description,
      externalReference: raw.externalReference,
      maxPayments: raw.maxPayments,
    }),
    createdAt: toIsoDatetime(raw.dateCreated),
    raw,
  }
}
