/**
 * Transform a Booqable order JSON:API resource into the canonical PurchaseOrder schema.
 *
 * Booqable "orders" are rental orders (customer-facing), not supplier purchase orders.
 * We map them onto PurchaseOrder as the closest available schema — callers should note
 * that supplierId is absent and lines represent rented product quantities.
 *
 * Key Booqable v4 order attributes:
 *   number, status (new | concept | reserved | started | stopped | archived | canceled),
 *   fulfillment_type, starts_at, stops_at, location_id, customer_id,
 *   grand_total_in_cents, deposit_in_cents, price_in_cents, payment_status,
 *   created_at, updated_at
 *
 * Amounts: *_in_cents are already INTEGER MINOR UNITS — passed through as-is.
 */
import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema'
import {pickStr, strMap, toIso, unwrapAttributes, type JsonApiResource} from './shared'

export interface RawBooqableOrder extends JsonApiResource {
  type: 'orders'
}

interface OrderAttrs {
  id: string
  number?: number | string
  status?: string
  fulfillment_type?: string
  starts_at?: string
  stops_at?: string
  location_id?: string
  customer_id?: string
  grand_total_in_cents?: number
  deposit_in_cents?: number
  price_in_cents?: number
  payment_status?: string
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

function mapStatus(s: string | undefined): PurchaseOrderStatus {
  switch ((s ?? '').toLowerCase()) {
    case 'concept':
    case 'new': return 'draft'
    case 'reserved': return 'sent'
    case 'started':
    case 'stopped': return 'received'
    case 'archived': return 'closed'
    case 'canceled': return 'cancelled'
    default: return 'draft'
  }
}

export function transformPurchaseOrder(raw: RawBooqableOrder): PurchaseOrder {
  const attrs = unwrapAttributes(raw) as OrderAttrs

  return {
    id: attrs.id,
    externalId: attrs.id,
    number: attrs.number !== undefined ? String(attrs.number) : undefined,
    supplierId: attrs.customer_id ?? '',
    destinationLocationId: pickStr(attrs.location_id),
    status: mapStatus(attrs.status),
    // grand_total_in_cents is integer minor units
    totalAmount: attrs.grand_total_in_cents,
    subtotalAmount: attrs.price_in_cents,
    lines: [],
    expectedAt: toIso(attrs.stops_at),
    orderedAt: toIso(attrs.starts_at),
    platform: 'booqable',
    metadata: strMap({
      fulfillmentType: attrs.fulfillment_type,
      paymentStatus: attrs.payment_status,
      depositInCents: attrs.deposit_in_cents,
    }),
    raw,
  }
}
