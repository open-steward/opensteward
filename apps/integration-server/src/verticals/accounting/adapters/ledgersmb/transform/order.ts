import { toCalendarDate } from '../../shared/transform'
/**
 * LedgerSMB order transform.
 *
 * API resource: GET /orders/{id}, POST /orders
 *
 * LedgerSMB order response shape (v0 REST API):
 *   id            — transaction id
 *   type          — 'customer' (sales) or 'vendor' (purchase) — currently only sales orders
 *   currency      — 3-char ISO 4217 code
 *   notes         — public notes
 *   internal-notes — private notes
 *   order-number, po-number — reference numbers
 *   dates.order   — order date (ISO date string)
 *   dates.required-by — required delivery date
 *   lines_total   — net total
 *   taxes_total   — tax total
 *   total         — grand total
 *   eca           — entity credit account reference
 *   lines[]       — line items (same shape as invoice lines)
 *   workflow.state — INITIAL | SAVED | POSTED | ONHOLD | VOIDED | REVERSED | DELETED
 */

import type { Order, OrderStatus } from '../../../schema/order'
import type { Lineitem } from '../../../schema/shared'
import type { LedgerSMBInvoiceLine, LedgerSMBTax, LedgerSMBInvoiceECA } from './invoice'

export interface LedgerSMBOrderDates {
  order?: string
  'required-by'?: string
  [key: string]: unknown
}

export interface LedgerSMBOrder {
  id?: string | number
  type?: 'customer' | 'vendor'
  currency?: string
  notes?: string
  'internal-notes'?: string
  'order-number'?: string
  'po-number'?: string
  'quote-number'?: string
  'ship-via'?: string
  'shipping-point'?: string
  dates?: LedgerSMBOrderDates
  lines_total?: number
  taxes_total?: number
  total?: number
  eca?: LedgerSMBInvoiceECA
  lines?: LedgerSMBInvoiceLine[]
  taxes?: Record<string, LedgerSMBTax>
  workflow?: { state?: string }
  [key: string]: unknown
}

function mapWorkflowStatusToOrder(state: string | undefined): OrderStatus {
  if (!state) return 'DRAFT'
  const s = state.toUpperCase()
  if (s === 'VOIDED' || s === 'REVERSED' || s === 'DELETED') return 'CANCELLED'
  if (s === 'POSTED') return 'COMPLETED'
  if (s === 'ONHOLD') return 'ACTIVE'
  if (s === 'SAVED') return 'ACTIVE'
  if (s === 'INITIAL') return 'DRAFT'
  return 'ACTIVE'
}

/** Convert a decimal monetary value from LedgerSMB to integer minor units (cents). */
function toMinor(v: number | undefined | null): number | undefined {
  if (v == null) return undefined
  return Math.round(v * 100)
}

function mapLineitem(line: LedgerSMBInvoiceLine): Lineitem {
  return {
    id: line.id != null ? String(line.id) : undefined,
    itemId: line.part?.number || undefined,
    itemName: line.part?.description || undefined,
    itemDescription: line.description || undefined,
    unitAmount: toMinor(line.price),
    unitQuantity: line.qty != null ? Math.round(line.qty) : undefined,
    totalAmount: toMinor(line.total),
    discountAmount: toMinor(line.discount),
  }
}

export function transformOrder(raw: LedgerSMBOrder): Order {
  const status = mapWorkflowStatusToOrder(raw.workflow?.state)
  const orderType = raw.type === 'vendor' ? 'PURCHASE' : 'SALES'

  return {
    id: raw.id != null ? String(raw.id) : undefined,
    status,
    type: orderType,
    contactId: raw.eca?.id != null ? String(raw.eca.id) : undefined,
    currency: raw.currency || undefined,
    totalAmount: toMinor(raw.total),
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.dates?.order ? new Date(raw.dates.order) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

/**
 * Canonical Order → LedgerSMB newOrder body (for POST /orders).
 *
 * Required by LedgerSMB: eca, currency, dates.order, lines
 */
export function untransformOrder(order: Partial<Order>): Record<string, unknown> {
  return {
    eca: order.contactId ? { id: order.contactId } : undefined,
    currency: order.currency,
    notes: undefined,
    'order-number': undefined,
    dates: {
      order: toCalendarDate(order.postedAt),
    },
    lines: order.lineItems?.map((li) => ({
      description: li.itemDescription ?? li.itemName,
      qty: li.unitQuantity,
      price: li.unitAmount,
      part: li.itemId ? { number: li.itemId } : undefined,
    })),
  }
}
