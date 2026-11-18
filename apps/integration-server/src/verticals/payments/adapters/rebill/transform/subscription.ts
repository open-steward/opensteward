/**
 * Rebill subscription → canonical Subscription.
 *
 * The subscription object (https://docs.rebill.com/api/reference/subscriptions):
 * - `status`: `active`, `paused`, `retrying` ("Payment retry in progress"),
 *   `defaulted`, `cancelled`, `finished` ("Completed subscription (all cycles
 *   charged)"), `processing`.
 * - `statusDetail`: "`in_trial` — Inside the trial period" among others.
 * - `currency`: "Three-letter ISO 4217 currency code".
 * - `plan`: `{ id, title, amount, currency, ... }`, amount "Price per billing
 *   cycle as a decimal in the currency's major unit."
 * - `customer.id`: "Customer identifier. Prefixed with `cus_`."
 * - `metadata`, `createdAt`, `updatedAt`.
 */
import { majorToMinor } from '@opensteward/shared'
import type {
  Subscription,
  SubscriptionStatus,
  SubscriptionItem,
} from '../../../schema/subscription'
import { strMap } from './shared'

export interface RawRebillSubscription {
  id: string
  status: string
  statusDetail?: string | null
  currency?: string | null
  plan?: { id?: string | null; amount?: number | null; currency?: string | null } | null
  customer?: { id?: string | null } | null
  metadata?: Record<string, unknown> | null
  createdAt?: string | null
  updatedAt?: string | null
  [k: string]: unknown
}

const STATUS: Record<string, SubscriptionStatus> = {
  active: 'active',
  paused: 'paused',
  retrying: 'past_due',
  cancelled: 'cancelled',
  finished: 'expired',
}

function mapStatus(raw: RawRebillSubscription): SubscriptionStatus {
  if (raw.statusDetail === 'in_trial') return 'trialing'
  return STATUS[raw.status] ?? 'unknown'
}

function mapItems(raw: RawRebillSubscription): SubscriptionItem[] {
  const plan = raw.plan
  if (!plan?.id) return []
  return [
    {
      id: plan.id,
      amount:
        typeof plan.amount === 'number' && plan.currency
          ? majorToMinor(plan.amount, plan.currency)
          : undefined,
    },
  ]
}

export function transformSubscription(raw: RawRebillSubscription): Subscription {
  if (typeof raw.id !== 'string' || raw.id === '') {
    throw new Error('Rebill subscription has no id')
  }
  const customerId = raw.customer?.id
  if (!customerId) {
    throw new Error(`Rebill subscription ${raw.id} has no customer.id`)
  }
  return {
    id: raw.id,
    externalId: raw.id,
    customerId,
    status: mapStatus(raw),
    currency: raw.currency ?? undefined,
    items: mapItems(raw),
    gateway: 'rebill',
    metadata: strMap(raw.metadata),
    createdAt: raw.createdAt ?? undefined,
    updatedAt: raw.updatedAt ?? undefined,
    raw,
  }
}
