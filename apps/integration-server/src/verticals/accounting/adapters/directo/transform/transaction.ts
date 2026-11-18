/**
 * Directo receipt/payment transform (maps to canonical Transaction).
 *
 * Endpoint: GET /v1/receipts  (customer payments / incoming)
 * or        GET /v1/purchase_payments  (supplier payments / outgoing)
 *
 * We unify both under the canonical Transaction type.
 */
import type { Transaction, TransactionContact } from '../../../schema/transaction'
import type { TransactionLineitem } from '../../../schema/shared'

// ── Directo wire types ────────────────────────────────────────────────────────

export interface DirectoReceiptRow {
  rn?: number
  account?: string
  sum?: number
  description?: string
  invoiceno?: string   // linked invoice number
  [key: string]: unknown
}

export interface DirectoReceipt {
  number?: string | number  // receipt number
  date?: string             // payment date ISO-8601
  customercode?: string     // customer code (for receipts)
  customername?: string     // customer name
  suppliercode?: string     // supplier code (for purchase payments)
  suppliername?: string     // supplier name
  currency?: string         // ISO-4217
  sum?: number              // total amount
  account?: string          // bank/cash account code
  reference?: string        // payment reference
  description?: string      // memo / description
  type?: string             // document type code
  rows?: DirectoReceiptRow[]
  [key: string]: unknown
}

// ── Mapping helpers ───────────────────────────────────────────────────────────

function mapLineitems(raw: DirectoReceipt): TransactionLineitem[] {
  const items: TransactionLineitem[] = []
  if (Array.isArray(raw.rows)) {
    for (const row of raw.rows) {
      items.push({
        id: row.rn !== undefined ? String(row.rn) : undefined,
        accountId: row.account || undefined,
        description: row.description || undefined,
        totalAmount: row.sum,
      })
    }
  }
  return items
}

function mapContacts(raw: DirectoReceipt): TransactionContact[] {
  const contacts: TransactionContact[] = []
  if (raw.customercode) contacts.push({ id: raw.customercode, name: raw.customername || undefined })
  else if (raw.suppliercode) contacts.push({ id: raw.suppliercode, name: raw.suppliername || undefined })
  return contacts
}

// ── Public transform ──────────────────────────────────────────────────────────

export function transformTransaction(raw: DirectoReceipt): Transaction {
  const contacts = mapContacts(raw)
  const lineItems = mapLineitems(raw)
  return {
    id: raw.number !== undefined ? String(raw.number) : undefined,
    accountId: raw.account || undefined,
    type: raw.type || undefined,
    reference: raw.reference || undefined,
    memo: raw.description || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.sum,
    contacts: contacts.length > 0 ? contacts : undefined,
    lineItems: lineItems.length > 0 ? lineItems : undefined,
    createdAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
