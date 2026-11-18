import { toIsoDatetime } from '@opensteward/shared'
import type { Subscription, SubscriptionItem } from '../../../schema/subscription'
import { optStr, requiredId } from './shared'

/**
 * A Stax scheduled invoice (Stax's recurring billing), as GET
 * /invoice/schedule lists it. Fields from the documented response example:
 * https://docs.staxpayments.com/reference/retrieve-all-scheduled-invoices
 */
export interface RawStaxSubscription {
  id?: string
  customer_id?: string | null
  payment_method_id?: string | null
  active?: boolean | null
  end_at?: string | null
  meta?: {
    lineItems?: Array<{ id?: string | null; quantity?: number | null }> | null
  } | null
  created_at?: string | null
  updated_at?: string | null
  [k: string]: unknown
}

/**
 * The line items the schedule bills. Their `price` is a major-unit amount and
 * a schedule carries no currency, so no amount is claimed here; the price
 * stays in `raw`. Only items with a documented `id` are kept.
 */
function items(raw: RawStaxSubscription): SubscriptionItem[] {
  const out: SubscriptionItem[] = []
  for (const li of raw.meta?.lineItems ?? []) {
    const id = optStr(li.id)
    if (id === undefined) continue
    out.push({
      id,
      ...(typeof li.quantity === 'number' && Number.isInteger(li.quantity) && li.quantity >= 0
        ? { quantity: li.quantity }
        : {}),
    })
  }
  return out
}

export function transformSubscription(raw: RawStaxSubscription): Subscription {
  const id = requiredId(raw.id, 'scheduled invoice')
  const customerId = optStr(raw.customer_id)
  if (customerId === undefined)
    throw new Error(`Stax Payments scheduled invoice ${id} has no customer_id`)
  return {
    id,
    externalId: id,
    customerId,
    // `active` is the documented boolean; an inactive schedule's reason
    // (ended, paused or cancelled) is not documented, so it is not guessed.
    status: raw.active === true ? 'active' : 'unknown',
    items: items(raw),
    defaultPaymentMethodId: optStr(raw.payment_method_id),
    gateway: 'stax-payments',
    metadata: {},
    createdAt: toIsoDatetime(raw.created_at),
    updatedAt: toIsoDatetime(raw.updated_at),
    raw,
  }
}
