/**
 * Patreon Pledge / Member → canonical Order.
 *
 * Patreon doesn't have discrete "orders" — the closest analogue is a
 * membership pledge. Each active membership represents an ongoing subscription
 * order. We model each member's pledge as an order:
 *
 *  - Member.id → Order.id
 *  - Member.currently_entitled_amount_cents → totalPrice
 *  - Member.patron_status → financialStatus mapping
 *  - Member.last_charge_date → processedAt
 *  - Member.pledge_relationship_start → createdAt
 *  - Currently entitled tier → lineItem
 *
 * Status mapping (patron_status → canonical):
 *  - active_patron  → {PAID, FULFILLED}
 *  - declined_patron → {PENDING, UNFULFILLED}
 *  - former_patron  → {VOIDED, UNFULFILLED}
 *  - null (follower) → {PENDING, UNFULFILLED}
 */

import type {
  Order,
  LineItem,
  OrderFinancialStatus,
  OrderFulfillmentStatus,
} from '../../../schema/order'
import type { FlatResource } from '../client'

// ── Raw shapes ───────────────────────────────────────────────────────────────

export interface RawPatreonPledge {
  id: string
  email?: string
  full_name?: string
  patron_status?: string | null
  currently_entitled_amount_cents?: number
  lifetime_support_cents?: number
  last_charge_date?: string | null
  last_charge_status?: string | null
  pledge_relationship_start?: string | null
  will_pay_amount_cents?: number
  note?: string
  pledge_cadence?: number | null
  _type?: string
  _relationships?: Record<string, unknown>
  _included?: FlatResource[]
  [key: string]: unknown
}

export interface RawPatreonTierForOrder {
  id: string
  title?: string
  amount_cents?: number
  description?: string
  _type?: string
  [key: string]: unknown
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function mapStatuses(patronStatus: string | null | undefined): {
  financialStatus?: OrderFinancialStatus
  fulfillmentStatus?: OrderFulfillmentStatus
} {
  switch (patronStatus) {
    case 'active_patron':
      return { financialStatus: 'PAID', fulfillmentStatus: 'FULFILLED' }
    case 'declined_patron':
      return { financialStatus: 'PENDING', fulfillmentStatus: 'UNFULFILLED' }
    case 'former_patron':
      return { financialStatus: 'VOIDED', fulfillmentStatus: 'UNFULFILLED' }
    default:
      return { financialStatus: 'PENDING', fulfillmentStatus: 'UNFULFILLED' }
  }
}

function extractEntitledTiers(raw: RawPatreonPledge): RawPatreonTierForOrder[] {
  const included = raw._included ?? []
  const rels = raw._relationships as Record<
    string,
    { data?: { type: string; id: string } | Array<{ type: string; id: string }> }
  > | undefined
  const tierData = rels?.['currently_entitled_tiers']?.data
  if (!tierData) return []

  const tierIds = Array.isArray(tierData)
    ? tierData.map((t) => t.id)
    : [tierData.id]

  return tierIds
    .map((id) => included.find((r) => r._type === 'tier' && r.id === id))
    .filter(Boolean) as unknown as RawPatreonTierForOrder[]
}

function buildLineItems(raw: RawPatreonPledge): LineItem[] | undefined {
  const tiers = extractEntitledTiers(raw)
  if (tiers.length === 0) {
    // Synthesize a single line item from the pledge amount
    const amount = (raw.currently_entitled_amount_cents ?? 0) / 100
    if (amount <= 0) return undefined
    return [
      {
        id: `${raw.id}:pledge`,
        title: 'Patreon Pledge',
        quantity: 1,
        price: { amount, currency: 'USD' },
        metadata: { synthetic: true, pledgeId: raw.id },
      },
    ]
  }
  return tiers.map((tier) => ({
    id: tier.id,
    title: tier.title ?? 'Tier',
    quantity: 1,
    price: { amount: (tier.amount_cents ?? 0) / 100, currency: 'USD' },
    metadata: tier as Record<string, unknown>,
  }))
}

// ── Transform ────────────────────────────────────────────────────────────────

export function transformOrder(raw: RawPatreonPledge): Order {
  const amount = (raw.currently_entitled_amount_cents ?? 0) / 100
  const { financialStatus, fulfillmentStatus } = mapStatuses(raw.patron_status)

  // Extract campaign (customer) id from relationships
  const rels = raw._relationships as Record<
    string,
    { data?: { type: string; id: string } }
  > | undefined
  const campaignId = rels?.['campaign']?.data?.id

  return {
    id: raw.id,
    orderNumber: raw.id,
    name: `Pledge #${raw.id}`,
    email: raw.email,
    currency: 'USD',
    totalPrice: { amount, currency: 'USD' },
    financialStatus,
    fulfillmentStatus,
    lineItems: buildLineItems(raw),
    note: raw.note ?? undefined,
    createdAt: raw.pledge_relationship_start ?? undefined,
    processedAt: raw.last_charge_date ?? undefined,
    cancelledAt:
      raw.patron_status === 'former_patron'
        ? raw.last_charge_date ?? undefined
        : undefined,
    cancelReason:
      raw.patron_status === 'former_patron' ? 'Patron cancelled pledge' : undefined,
    metadata: {
      ...(raw as Record<string, unknown>),
      patronStatus: raw.patron_status,
      lastChargeStatus: raw.last_charge_status,
      lifetimeSupportCents: raw.lifetime_support_cents,
      pledgeCadence: raw.pledge_cadence,
      campaignId,
      willPayAmountCents: raw.will_pay_amount_cents,
    },
  }
}

export function untransformOrder(
  order: Partial<Order>,
): Record<string, unknown> {
  return {
    data: {
      type: 'member',
      attributes: {
        note: order.note,
      },
    },
  }
}
