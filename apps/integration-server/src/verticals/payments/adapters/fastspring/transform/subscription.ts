import type {
  Subscription,
  SubscriptionItem,
  SubscriptionStatus,
} from '../../../schema/subscription'
import { toIsoDatetime } from '@opensteward/shared'
import { toMinorUnits, strMap } from './shared'

/** FastSpring subscription instance. */
export interface RawFastspringSubscription {
  id?: string
  subscription?: string
  active?: boolean
  state?: string
  changed?: number
  changedDisplay?: string
  live?: boolean
  currency?: string | null
  account?: { id?: string; account?: string } | string | null
  product?: string
  sku?: string | null
  display?: string
  quantity?: number
  adhoc?: boolean
  autoRenew?: boolean
  price?: number
  priceDisplay?: string
  discount?: number
  subtotal?: number
  next?: number
  begin?: number
  intervalUnit?: string | null
  intervalLength?: number
  nextChargeCurrency?: string | null
  nextChargeDate?: number
  nextChargeTotal?: number
  nextChargeTotalDisplay?: string
  periods?: number
  remainingPeriods?: number
  sequence?: number
  end?: number | null
  canceledDate?: number | null
  deactivationDate?: number | null
  [k: string]: unknown
}

/** Map FastSpring subscription `state` → canonical status. */
function mapStatus(raw: RawFastspringSubscription): SubscriptionStatus {
  switch ((raw.state ?? '').toLowerCase()) {
    case 'active':
      return 'active'
    case 'trial':
      return 'trialing'
    case 'overdue':
      return 'past_due'
    case 'canceled':
    case 'cancelled':
      return 'cancelled'
    case 'deactivated':
      return 'expired'
    case 'paused':
      return 'paused'
    default:
      return raw.active ? 'active' : 'cancelled'
  }
}

function accountId(account: RawFastspringSubscription['account']): string {
  if (!account) return ''
  if (typeof account === 'string') return account
  return account.id ?? account.account ?? ''
}

function buildItem(raw: RawFastspringSubscription): SubscriptionItem {
  return {
    id: String(raw.id ?? raw.subscription ?? ''),
    priceId: raw.sku ?? undefined,
    productId: raw.product ?? undefined,
    quantity: typeof raw.quantity === 'number' ? raw.quantity : undefined,
    amount: raw.price != null ? toMinorUnits(raw.price) : undefined,
  }
}

export function transformSubscription(raw: RawFastspringSubscription): Subscription {
  const id = String(raw.id ?? raw.subscription ?? '')
  return {
    id,
    externalId: id,
    customerId: accountId(raw.account),
    status: mapStatus(raw),
    currency: raw.currency ? raw.currency.toUpperCase() : undefined,
    items: [buildItem(raw)],
    currentPeriodStart: toIsoDatetime(raw.begin),
    currentPeriodEnd: toIsoDatetime(raw.next),
    billingAnchor: toIsoDatetime(raw.begin),
    cancelledAt: toIsoDatetime(raw.canceledDate),
    cancelAtPeriodEnd: raw.autoRenew === false,
    gateway: 'fastspring',
    metadata: strMap({
      product: raw.product,
      sku: raw.sku,
      display: raw.display,
      state: raw.state,
      live: raw.live,
      adhoc: raw.adhoc,
      autoRenew: raw.autoRenew,
      intervalUnit: raw.intervalUnit,
      intervalLength: raw.intervalLength,
      periods: raw.periods,
      remainingPeriods: raw.remainingPeriods,
      sequence: raw.sequence,
      nextChargeDate:
        raw.nextChargeDate != null ? toIsoDatetime(raw.nextChargeDate) : undefined,
      nextChargeCurrency: raw.nextChargeCurrency,
      nextChargeTotal:
        raw.nextChargeTotal != null ? String(toMinorUnits(raw.nextChargeTotal)) : undefined,
      priceDisplay: raw.priceDisplay,
      discount: raw.discount,
    }),
    createdAt: toIsoDatetime(raw.begin),
    updatedAt: toIsoDatetime(raw.changed),
    raw,
  }
}
