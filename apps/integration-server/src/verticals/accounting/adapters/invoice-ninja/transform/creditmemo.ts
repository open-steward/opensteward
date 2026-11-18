import { toCalendarDate } from '../../shared/transform'
/**
 * Invoice Ninja v5 credit → canonical CreditMemo.
 *
 * Endpoint: GET /api/v1/credits
 * Single:   GET /api/v1/credits/{id}
 *
 * Invoice Ninja "credits" are the equivalent of credit notes / credit memos.
 * Status IDs: 1=Draft, 2=Sent, 3=Partial, 4=Applied/Paid
 */

import type { CreditMemo, CreditMemoStatus } from '../../../schema/creditmemo'
import type { Lineitem } from '../../../schema/shared'
import { currencyIdToIso } from '../constants'

// Reuse the same line item shape as invoices
export interface InvoiceNinjaCreditLineItem {
  product_key?: string | null
  notes?: string | null
  cost?: number | null
  quantity?: number | null
  discount?: number | null
  line_total?: number | null
  [key: string]: unknown
}

export interface InvoiceNinjaCredit {
  id: string
  status_id?: number | null
  number?: string | null
  client_id?: string | null
  amount?: number | null
  balance?: number | null
  paid_to_date?: number | null
  tax_amount?: number | null
  discount?: number | null
  currency_id?: string | null
  date?: string | null
  due_date?: string | null
  public_notes?: string | null
  line_items?: InvoiceNinjaCreditLineItem[] | null
  updated_at?: number | null
  created_at?: number | null
  [key: string]: unknown
}

const CREDIT_STATUS_MAP: Record<number, CreditMemoStatus> = {
  1: 'DRAFT',
  2: 'AUTHORIZED',
  3: 'PARTIALLY_PAID',
  4: 'PAID',
}

function mapStatus(statusId?: number | null): CreditMemoStatus {
  if (!statusId) return 'DRAFT'
  return CREDIT_STATUS_MAP[statusId] ?? 'DRAFT'
}

function parseDateStr(s?: string | null): Date | undefined {
  if (!s) return undefined
  const d = new Date(s)
  return isNaN(d.getTime()) ? undefined : d
}

function parseEpoch(n?: number | null): Date | undefined {
  if (!n) return undefined
  return new Date(n * 1000)
}

function mapLineItem(li: InvoiceNinjaCreditLineItem): Lineitem {
  return {
    itemId: li.product_key || undefined,
    itemDescription: li.notes || undefined,
    unitAmount: li.cost ?? undefined,
    unitQuantity: li.quantity != null ? Math.round(li.quantity) : undefined,
    discountAmount: li.discount || undefined,
    totalAmount: li.line_total ?? undefined,
  }
}

export function transformCreditMemo(raw: InvoiceNinjaCredit): CreditMemo {
  return {
    id: raw.id,
    status: mapStatus(raw.status_id),
    creditmemoNumber: raw.number || undefined,
    contactId: raw.client_id || undefined,
    currency: currencyIdToIso(raw.currency_id),
    totalAmount: raw.amount ?? undefined,
    taxAmount: raw.tax_amount || undefined,
    discountAmount: raw.discount || undefined,
    paidAmount: raw.paid_to_date || undefined,
    balanceAmount: raw.balance ?? undefined,
    notes: raw.public_notes || undefined,
    lineItems: (raw.line_items ?? []).map(mapLineItem),
    postedAt: parseDateStr(raw.date),
    dueAt: parseDateStr(raw.due_date),
    createdAt: parseEpoch(raw.created_at),
    updatedAt: parseEpoch(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}

/** Canonical CreditMemo → Invoice Ninja body (for create) */
export function untransformCreditMemo(cm: Partial<CreditMemo>): Record<string, unknown> {
  return {
    client_id: cm.contactId,
    date: toCalendarDate(cm.postedAt),
    due_date: toCalendarDate(cm.dueAt),
    public_notes: cm.notes,
    line_items: cm.lineItems?.map((li) => ({
      product_key: li.itemId,
      notes: li.itemDescription,
      cost: li.unitAmount,
      quantity: li.unitQuantity,
    })),
  }
}
