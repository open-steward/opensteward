/**
 * Invoiced Credit Note → canonical CreditMemo transform.
 *
 * Credit Note statuses: draft, open, paid, closed, voided
 * Docs: https://developer.invoiced.com/api/credit-notes
 */
import type { CreditMemo, CreditMemoStatus } from '../../../schema/creditmemo'
import type { Lineitem } from '../../../schema/shared'

export interface InvoicedCreditNoteLineItem {
  id: number
  catalog_item: string | null
  name: string | null
  description: string | null
  quantity: number
  unit_cost: number
  amount: number
  [key: string]: unknown
}

export interface InvoicedCreditNote {
  id: number
  object: string
  customer: number
  number: string | null
  status: string
  draft: boolean
  closed: boolean
  paid: boolean
  currency: string
  date: number | null
  items: InvoicedCreditNoteLineItem[]
  total: number
  balance: number
  notes: string | null
  url: string | null
  metadata: Record<string, unknown>
  created_at: number
  updated_at: number
  [key: string]: unknown
}

function mapStatus(raw: InvoicedCreditNote): CreditMemoStatus {
  const s = raw.status
  if (s === 'voided') return 'VOIDED'
  if (s === 'paid') return 'PAID'
  if (s === 'draft') return 'DRAFT'
  // open / closed
  return 'AUTHORIZED'
}

function mapLineitem(li: InvoicedCreditNoteLineItem): Lineitem {
  return {
    id: String(li.id),
    itemId: li.catalog_item || undefined,
    itemName: li.name || undefined,
    itemDescription: li.description || undefined,
    unitAmount: li.unit_cost,
    unitQuantity: li.quantity,
    totalAmount: li.amount,
  }
}

export function transformCreditMemo(raw: InvoicedCreditNote): CreditMemo {
  return {
    id: String(raw.id),
    status: mapStatus(raw),
    creditmemoNumber: raw.number || String(raw.id),
    contactId: raw.customer ? String(raw.customer) : undefined,
    currency: raw.currency ? raw.currency.toUpperCase() : undefined,
    totalAmount: raw.total,
    balanceAmount: raw.balance,
    notes: raw.notes || undefined,
    url: raw.url || undefined,
    lineItems: (raw.items ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date * 1000) : undefined,
    createdAt: raw.created_at ? new Date(raw.created_at * 1000) : undefined,
    updatedAt: raw.updated_at ? new Date(raw.updated_at * 1000) : undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
