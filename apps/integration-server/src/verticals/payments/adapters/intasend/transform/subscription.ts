/**
 * IntaSend subscriptions (`/api/v1/subscriptions/`).
 *
 * An IntaSend subscription links a subscription customer to a plan and carries
 * status, start date, and how many billing cycles have completed. It maps onto
 * the canonical **Subscription**.
 *
 * Field mapping:
 *   subscription_id          → id / externalId
 *   customer.customer_id     → customerId
 *   status                   → status (ACTIVE, CANCELED, PENDING)
 *   plan.currency            → currency
 *   start_date               → currentPeriodStart
 *   payment_method           → metadata.payment_method
 *   completed_cycles         → metadata.completed_cycles
 *
 * IntaSend statuses: ACTIVE, PENDING, CANCELED.
 *
 * Refs:
 *   https://developers.intasend.com/docs/create-a-subscription-plan-copy
 *   https://developers.intasend.com/docs/unsubscribe-a-customer
 *   https://developers.intasend.com/reference/api_v1_subscriptions_retrieve
 */
import { toIsoDatetime } from '@opensteward/shared'
import type { Subscription, SubscriptionStatus } from '../../../schema/subscription'
import { pickCurrency, strMap } from './shared'

interface RawIntasendSubCustomer {
  customer_id?: string
  id?: number | string
  email?: string | null
  first_name?: string | null
  last_name?: string | null
  [k: string]: unknown
}

interface RawIntasendSubPlan {
  plan_id?: string
  id?: number | string
  name?: string | null
  frequency?: number | null
  frequency_unit?: string | null
  billing_cycles?: number | null
  currency?: string | null
  amount?: string | number | null
  [k: string]: unknown
}

export interface RawIntasendSubscription {
  subscription_id?: string
  id?: number | string
  reference?: string | null
  customer?: RawIntasendSubCustomer | null
  customer_id?: string | null
  plan?: RawIntasendSubPlan | null
  plan_id?: string | null
  payment_method?: string | null
  status?: string | null
  start_date?: string | null
  completed_cycles?: number | null
  setup_url?: string | null
  created_at?: string
  updated_at?: string
  [k: string]: unknown
}

function mapStatus(status: string | null | undefined): SubscriptionStatus {
  switch ((status ?? '').toUpperCase()) {
    case 'ACTIVE':
      return 'active'
    case 'CANCELED':
    case 'CANCELLED':
      return 'cancelled'
    case 'PENDING':
      return 'incomplete'
    default:
      return 'incomplete'
  }
}

export function transformSubscription(raw: RawIntasendSubscription): Subscription {
  const id = String(raw.subscription_id ?? raw.id ?? '')

  const customerId =
    (typeof raw.customer === 'object' && raw.customer
      ? String(raw.customer.customer_id ?? raw.customer.id ?? '')
      : String(raw.customer_id ?? '')) || ''

  const currency = raw.plan?.currency
    ? pickCurrency(raw.plan.currency)
    : undefined

  return {
    id,
    externalId: id,
    customerId,
    status: mapStatus(raw.status),
    currency,
    items: [],
    currentPeriodStart: toIsoDatetime(raw.start_date) ?? undefined,
    currentPeriodEnd: undefined,
    billingAnchor: undefined,
    trialStart: undefined,
    trialEnd: undefined,
    cancelAt: undefined,
    cancelledAt:
      (raw.status ?? '').toUpperCase() === 'CANCELED' ||
      (raw.status ?? '').toUpperCase() === 'CANCELLED'
        ? toIsoDatetime(raw.updated_at) ?? undefined
        : undefined,
    cancelAtPeriodEnd: undefined,
    collectionMethod: 'charge_automatically',
    dunningState: undefined,
    defaultPaymentMethodId: undefined,
    latestInvoiceId: undefined,
    gateway: 'intasend',
    metadata: strMap({
      reference: raw.reference,
      payment_method: raw.payment_method,
      completed_cycles: raw.completed_cycles,
      plan_id: raw.plan?.plan_id ?? raw.plan?.id ?? raw.plan_id,
      setup_url: raw.setup_url,
    }),
    createdAt: toIsoDatetime(raw.created_at),
    updatedAt: toIsoDatetime(raw.updated_at),
    raw,
  }
}
