import type { Subscription } from '../../../schema/subscription'
import { metadataMap, present, required } from './shared'

/**
 * The body of `GET /subscriptions/v1/card/search/{subscriptionId}`
 * (https://api-docs.kushkipagos.com/mexico/online-payments/one-click-payments/get-recurring-charge-info.md),
 * returned at the root of the response. Only documented fields are declared.
 */
export interface RawKushkiSubscription {
  subscriptionId?: string
  amount?: {
    subtotalIva0?: number
    subtotalIva?: number
    iva?: number
    ice?: number
    currency?: string
  }
  contactDetails?: { firstName?: string; lastName?: string; email?: string }
  /** "Timestamp format"; the examples are epoch seconds (`1574693127`). */
  created?: number
  periodicity?: string
  planName?: string
  metadata?: unknown
  [k: string]: unknown
}

/**
 * Kushki documents no subscription status and no customer object: a
 * recurring charge carries only `contactDetails`. `customerId` is the
 * documented `contactDetails.email`, and the subscription is refused
 * without it. Status is `unknown` because no field reports it.
 *
 * `items` is empty: the response documents no plan or item. The response's
 * `amount` holds `subtotalIva0`, `subtotalIva`, `iva`, `ice` and `currency`,
 * and this page does not say how the parts add up to the charged amount, so
 * the parts stay in `raw`.
 */
export function transformSubscription(raw: RawKushkiSubscription): Subscription {
  const id = required(present(raw.subscriptionId), 'subscriptionId', 'subscription')
  const customerId = required(
    present(raw.contactDetails?.email),
    'contactDetails.email',
    `subscription ${id}`,
  )
  return {
    id,
    externalId: id,
    customerId,
    status: 'unknown',
    currency: present(raw.amount?.currency),
    items: [],
    gateway: 'kushki',
    metadata: metadataMap(raw.metadata),
    createdAt:
      typeof raw.created === 'number' && Number.isFinite(raw.created)
        ? new Date(raw.created * 1000).toISOString()
        : undefined,
    raw,
  }
}
