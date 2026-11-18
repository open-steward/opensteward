import { toCalendarDate } from '../../shared/transform'
/**
 * LedgerSMB sales order transform.
 *
 * API resource: GET /orders/{id}, POST /orders
 *
 * LedgerSMB does not have a dedicated sales-order endpoint. Sales orders are
 * orders where eca.type === 'customer'. They are retrieved and created via the
 * same /orders endpoint as purchase orders — the distinction is internal.
 *
 * This transform is derived from the order transform; it maps the same
 * LedgerSMBOrder shape to the canonical SalesOrder type.
 */

import type { SalesOrder, SalesOrderStatus } from '../../../schema/salesorder'
import type { Lineitem } from '../../../schema/shared'
import type { LedgerSMBOrder } from './order'
import type { LedgerSMBInvoiceLine } from './invoice'

function mapWorkflowStatusToSalesOrder(state: string | undefined): SalesOrderStatus {
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

export function transformSalesOrder(raw: LedgerSMBOrder): SalesOrder {
  const status = mapWorkflowStatusToSalesOrder(raw.workflow?.state)

  return {
    id: raw.id != null ? String(raw.id) : undefined,
    status,
    contactId: raw.eca?.id != null ? String(raw.eca.id) : undefined,
    currency: raw.currency || undefined,
    totalAmount: toMinor(raw.total),
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.dates?.order ? new Date(raw.dates.order) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

/**
 * Canonical SalesOrder → LedgerSMB newOrder body (for POST /orders).
 * Sets no explicit type; the ECA passed must be a customer ECA.
 */
export function untransformSalesOrder(so: Partial<SalesOrder>): Record<string, unknown> {
  return {
    eca: so.contactId ? { id: so.contactId } : undefined,
    currency: so.currency,
    dates: {
      order: toCalendarDate(so.postedAt),
    },
    lines: so.lineItems?.map((li) => ({
      description: li.itemDescription ?? li.itemName,
      qty: li.unitQuantity,
      price: li.unitAmount,
      part: li.itemId ? { number: li.itemId } : undefined,
    })),
  }
}
