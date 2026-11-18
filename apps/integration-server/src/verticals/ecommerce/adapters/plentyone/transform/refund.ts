/**
 * PlentyONE Order Credit Note → canonical Refund.
 *
 * In PlentyONE, refunds are represented as credit note orders (typeId = 4)
 * associated with the original sales order via an order reference. The
 * adapter fetches credit notes that reference a given order id.
 *
 * Endpoints used:
 *   GET /rest/orders?typeId=4&referenceOrderId={orderId}&with=amounts,orderItems
 *   GET /rest/orders/{creditNoteId}?with=amounts,orderItems
 *   POST /rest/orders  (typeId=4 with orderReferences to parent order)
 */

import type { Refund, RefundLineItem } from '../../../schema/refund'
import { majorToMinor, minorToMajor } from '../../../schema/shared'
import { toIsoDatetime } from '@opensteward/shared'
import { ORDER_ITEM_TYPE_VARIATION } from '../constants'

// ── Raw PlentyONE shapes ─────────────────────────────────────────────────────

export interface RawPlentyOneCreditNoteItemAmount {
  priceGross?: number | null
  currency?: string | null
}

export interface RawPlentyOneCreditNoteItem {
  id: number | string
  typeId?: number
  itemVariationId?: number | string | null
  quantity?: number
  orderItemName?: string | null
  amounts?: RawPlentyOneCreditNoteItemAmount[]
  [key: string]: unknown
}

export interface RawPlentyOneCreditNoteAmount {
  isSystemCurrency?: boolean
  currency?: string | null
  grossTotal?: number | null
}

export interface RawPlentyOneOrderReference {
  referenceType?: string
  referenceId?: number | string
  origin?: string
}

export interface RawPlentyOneCreditNote {
  id: number | string
  typeId?: number
  statusId?: number
  createdAt?: string
  updatedAt?: string
  amounts?: RawPlentyOneCreditNoteAmount[]
  orderItems?: RawPlentyOneCreditNoteItem[]
  orderReferences?: RawPlentyOneOrderReference[]
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function pickAmount(
  amounts: RawPlentyOneCreditNoteAmount[] | undefined,
): RawPlentyOneCreditNoteAmount | undefined {
  if (!amounts || amounts.length === 0) return undefined
  return amounts.find((a) => a.isSystemCurrency) ?? amounts[0]
}

function findOriginalOrderId(
  refs: RawPlentyOneOrderReference[] | undefined,
): string | undefined {
  if (!refs) return undefined
  const ref = refs.find((r) => r.referenceType === 'order' || r.origin === 'order')
  return ref?.referenceId != null ? String(ref.referenceId) : undefined
}

function mapRefundLineItems(
  items: RawPlentyOneCreditNoteItem[] | undefined,
  currency: string,
): RefundLineItem[] | undefined {
  if (!items || items.length === 0) return undefined
  return items
    .filter((i) => i.typeId === ORDER_ITEM_TYPE_VARIATION)
    .map((i) => {
      const amt = i.amounts?.[0]
      return {
        lineItemId: String(i.id),
        quantity: i.quantity ?? 1,
        amount:
          amt?.priceGross != null
            ? { amount: majorToMinor(Math.abs(amt.priceGross), currency), currency }
            : undefined,
      }
    })
}

// ── Transforms ───────────────────────────────────────────────────────────────

export function transformCreditNote(
  raw: RawPlentyOneCreditNote,
  fallbackOrderId?: string,
): Refund {
  const amtEntry = pickAmount(raw.amounts)
  const currency = amtEntry?.currency ?? 'EUR'
  const grossTotal = amtEntry?.grossTotal
  const orderId = findOriginalOrderId(raw.orderReferences) ?? fallbackOrderId ?? ''

  return {
    id: String(raw.id),
    orderId,
    amount:
      grossTotal != null && grossTotal !== 0
        ? { amount: majorToMinor(Math.abs(grossTotal), currency), currency }
        : undefined,
    refundLineItems: mapRefundLineItems(raw.orderItems, currency),
    createdAt: toIsoDatetime(raw.createdAt),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Refund → PlentyONE credit note body for create. */
export function untransformCreditNote(
  refund: Partial<Refund>,
): Record<string, unknown> {
  const orderItems = (refund.refundLineItems ?? []).map((li) => ({
    typeId: ORDER_ITEM_TYPE_VARIATION,
    quantity: li.quantity,
    amounts: li.amount
      ? [
          {
            priceGross: -(minorToMajor(li.amount.amount, li.amount.currency) ?? 0),
            currency: li.amount.currency,
          },
        ]
      : undefined,
  }))

  const body: Record<string, unknown> = {
    typeId: 4, // credit note
    orderItems: orderItems.length > 0 ? orderItems : undefined,
  }
  if (refund.orderId) {
    body['orderReferences'] = [{ referenceType: 'order', referenceId: Number(refund.orderId) }]
  }
  return body
}
