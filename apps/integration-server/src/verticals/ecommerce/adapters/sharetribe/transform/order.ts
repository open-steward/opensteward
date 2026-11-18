/**
 * Sharetribe transaction → canonical Order.
 *
 * Sharetribe transactions represent marketplace exchanges (bookings, purchases)
 * between a customer and a provider. They map to the canonical Order resource.
 *
 * Key field notes:
 *  - `id` is a UUID object { uuid: string }.
 *  - `payinTotal` / `payoutTotal` are Money objects { amount (minor units), currency }.
 *  - `lineItems` is an array of charge breakdown objects (not traditional order lines).
 *  - `state` drives the canonical financialStatus / fulfillmentStatus.
 *  - The transaction has two parties: `customer` (buyer) and `provider` (seller).
 *  - The linked listing (product) id is in relationships.listing.
 *
 * Docs: https://www.sharetribe.com/api-reference/integration.html#transactions
 */

import type { Order, LineItem, OrderFinancialStatus, OrderFulfillmentStatus } from '../../../schema/order'
import type { SharetribeUUID } from './product'

// ── Raw Sharetribe shapes ─────────────────────────────────────────────────────

export interface SharetribeMoney {
  amount: number
  currency: string
}

export interface SharetribeLineItem {
  code: string
  unitPrice?: SharetribeMoney | null
  quantity?: number | null
  units?: number | null
  seats?: number | null
  lineTotal?: SharetribeMoney | null
  reversal?: boolean
  includeFor?: string[]
}

export interface RawSharetribeTransaction {
  id: SharetribeUUID
  type: 'transaction'
  attributes: {
    state?: string | null
    lastTransition?: string | null
    lastTransitionedAt?: string | null
    payinTotal?: SharetribeMoney | null
    payoutTotal?: SharetribeMoney | null
    lineItems?: SharetribeLineItem[]
    protectedData?: Record<string, unknown>
    metadata?: Record<string, unknown>
    createdAt?: string
  }
  relationships?: {
    customer?: { data?: SharetribeUUID }
    provider?: { data?: SharetribeUUID }
    listing?: { data?: SharetribeUUID }
    booking?: { data?: SharetribeUUID }
    reviews?: { data?: SharetribeUUID[] }
    messages?: { data?: SharetribeUUID[] }
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Map Sharetribe transaction state → canonical OrderFinancialStatus.
 *
 * Sharetribe transaction states are marketplace-defined, but common defaults:
 *  pending-payment  → PENDING
 *  preauthorized    → AUTHORIZED
 *  accepted / delivered / reviewed → PAID
 *  cancelled        → VOIDED
 *  declined         → VOIDED
 */
function mapFinancialStatus(state: string | null | undefined): OrderFinancialStatus | undefined {
  if (!state) return undefined
  const s = state.toLowerCase()
  if (s.includes('pending')) return 'PENDING'
  if (s.includes('preauthorized') || s.includes('authorized')) return 'AUTHORIZED'
  if (s.includes('cancel') || s.includes('declined') || s.includes('expire')) return 'VOIDED'
  if (
    s.includes('paid') ||
    s.includes('accepted') ||
    s.includes('delivered') ||
    s.includes('completed') ||
    s.includes('reviewed')
  ) {
    return 'PAID'
  }
  return undefined
}

/**
 * Map Sharetribe transaction state → canonical OrderFulfillmentStatus.
 *
 *  preauthorized / pending → UNFULFILLED
 *  accepted                → PARTIAL (accepted but not delivered)
 *  delivered / completed   → FULFILLED
 *  cancelled               → RESTOCKED
 */
function mapFulfillmentStatus(state: string | null | undefined): OrderFulfillmentStatus | undefined {
  if (!state) return undefined
  const s = state.toLowerCase()
  if (s.includes('cancel') || s.includes('decline') || s.includes('expire')) return 'RESTOCKED'
  if (s.includes('delivered') || s.includes('completed') || s.includes('reviewed')) return 'FULFILLED'
  if (s.includes('accepted')) return 'PARTIAL'
  if (s.includes('preauthorized') || s.includes('pending')) return 'UNFULFILLED'
  return undefined
}

/** Build canonical LineItems from Sharetribe lineItems (charge breakdown). */
function mapLineItems(
  items: SharetribeLineItem[] | undefined,
): LineItem[] | undefined {
  if (!items || items.length === 0) return undefined
  return items
    .filter((li) => !li.reversal)
    .map((li, idx) => {
      const currency = li.lineTotal?.currency ?? li.unitPrice?.currency ?? 'USD'
      const quantity = li.quantity ?? li.units ?? li.seats ?? 1
      return {
        id: `${li.code}:${idx}`,
        title: li.code,
        quantity,
        price: {
          amount: li.unitPrice?.amount ?? 0,
          currency,
        },
        metadata: li as unknown as Record<string, unknown>,
      }
    })
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformTransaction(raw: RawSharetribeTransaction): Order {
  const id = raw.id?.uuid ?? String(raw.id)
  const attrs = raw.attributes
  const rels = raw.relationships ?? {}

  const currency = attrs.payinTotal?.currency ?? attrs.payoutTotal?.currency ?? 'USD'

  return {
    id,
    customerId: rels.customer?.data?.uuid,
    currency,
    totalPrice: attrs.payinTotal
      ? { amount: attrs.payinTotal.amount, currency: attrs.payinTotal.currency }
      : undefined,
    financialStatus: mapFinancialStatus(attrs.state),
    fulfillmentStatus: mapFulfillmentStatus(attrs.state),
    lineItems: mapLineItems(attrs.lineItems),
    createdAt: attrs.createdAt,
    processedAt: attrs.lastTransitionedAt ?? undefined,
    metadata: {
      state: attrs.state,
      lastTransition: attrs.lastTransition,
      lastTransitionedAt: attrs.lastTransitionedAt,
      payinTotal: attrs.payinTotal,
      payoutTotal: attrs.payoutTotal,
      listingId: rels.listing?.data?.uuid,
      providerId: rels.provider?.data?.uuid,
      bookingId: rels.booking?.data?.uuid,
      protectedData: attrs.protectedData,
      transactionMetadata: attrs.metadata,
    } as Record<string, unknown>,
  }
}
