/**
 * Tyms does not have a dedicated "transaction" endpoint.
 * The closest equivalent is the Sales endpoint (`GET /api/v1/sales`),
 * which records direct income transactions (POS sales, revenue receipts).
 * We derive Transaction from the Tyms Sale wire type.
 *
 * Confirmed endpoint: GET https://api.tyms.io/api/v1/sales
 * Docs: https://tyms.readme.io/reference/get-sales-copy-1
 */
import type { Transaction } from '../../../schema/transaction'
import type { TransactionLineitem } from '../../../schema/shared'

// ── Tyms wire types ────────────────────────────────────────────────────────────

export interface TymsSaleItem {
  uuid?: string
  name?: string
  description?: string
  quantity?: number
  price?: number
  amount?: number
  account?: string
  [key: string]: unknown
}

export interface TymsSale {
  uuid: string
  title?: string
  date?: string
  amount?: number
  tax?: number | { amount?: number; [key: string]: unknown }
  discount?: number
  currency?: string
  status?: string
  payment_type?: string
  category?: string
  memo?: string
  customer?: {
    uuid?: string
    name?: string
    [key: string]: unknown
  }
  items?: TymsSaleItem[]
  source_uuid?: string
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

// ── Tax amount extraction ──────────────────────────────────────────────────────

function extractTaxAmount(tax: TymsSale['tax']): number | undefined {
  if (tax === undefined || tax === null) return undefined
  if (typeof tax === 'number') return tax
  return typeof tax.amount === 'number' ? tax.amount : undefined
}

// ── Line-item mapping ──────────────────────────────────────────────────────────

function mapLineitem(item: TymsSaleItem): TransactionLineitem {
  return {
    id: item.uuid || undefined,
    accountId: item.account || undefined,
    name: item.name || undefined,
    description: item.description || undefined,
    objectType: 'sales_item',
    unitAmount: item.price ?? undefined,
    unitQuantity: item.quantity ?? undefined,
    totalAmount: item.amount ?? undefined,
  }
}

// ── Public transform ───────────────────────────────────────────────────────────

export function transformTransaction(raw: TymsSale): Transaction {
  const taxAmt = extractTaxAmount(raw.tax)
  return {
    id: raw.uuid,
    type: 'SALE',
    reference: raw.source_uuid || undefined,
    memo: raw.memo || raw.title || undefined,
    paymentMethod: raw.payment_type || undefined,
    currency: raw.currency || undefined,
    taxAmount: taxAmt,
    totalAmount: raw.amount ?? undefined,
    contacts: raw.customer?.uuid
      ? [{ id: raw.customer.uuid, name: raw.customer.name || undefined }]
      : undefined,
    lineItems: Array.isArray(raw.items) ? raw.items.map(mapLineitem) : undefined,
    createdAt: raw.created_at ? new Date(raw.created_at) : undefined,
    updatedAt: raw.updated_at ? new Date(raw.updated_at) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
