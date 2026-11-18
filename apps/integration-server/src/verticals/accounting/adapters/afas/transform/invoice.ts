/**
 * AFAS Profit_SalesInvoices GetConnector → canonical Invoice transform.
 *
 * Fields returned by the Profit_SalesInvoices standard GetConnector:
 *   InvoiceNr       — invoice number / id
 *   DebtorId        — debtor/customer code
 *   Description     — invoice description
 *   AmtInvoice      — total amount (base currency)
 *   AmtInvoiceCurr  — total amount (invoice currency)
 *   Balance         — outstanding balance
 *   BalanceCurr     — balance in invoice currency
 *   CurrencyId      — ISO-4217 currency code
 *   ExpDate         — due date
 *   NookPieceDate   — posting / booking date
 *   UnitId          — administration unit
 */
import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import { toMinorUnits } from '../../shared/transform'

export interface AfasSalesInvoice {
  InvoiceNr: string
  DebtorId: string
  Description: string
  AmtInvoice: number
  AmtInvoiceCurr: number
  Balance: number
  BalanceCurr: number
  CurrencyId: string
  ExpDate: string
  NookPieceDate: string
  UnitId: number
  [key: string]: unknown
}

function mapStatus(inv: AfasSalesInvoice): InvoiceStatus {
  const total = inv.AmtInvoice ?? 0
  const balance = inv.Balance ?? 0
  if (total !== 0 && balance === 0) return 'PAID'
  if (balance > 0 && balance < total) return 'PARTIALLY_PAID'
  if (balance > 0) return 'AUTHORIZED'
  return 'DRAFT'
}

export function transformInvoice(raw: AfasSalesInvoice): Invoice {
  return {
    id: raw.InvoiceNr,
    type: 'INVOICE',
    status: mapStatus(raw),
    invoiceNumber: raw.InvoiceNr || undefined,
    contactId: raw.DebtorId || undefined,
    currency: raw.CurrencyId || undefined,
    totalAmount: toMinorUnits(raw.AmtInvoice),
    balanceAmount: toMinorUnits(raw.Balance),
    notes: raw.Description || undefined,
    postedAt: typeof raw.NookPieceDate === 'string' && raw.NookPieceDate ? new Date(raw.NookPieceDate) : undefined,
    dueAt: typeof raw.ExpDate === 'string' && raw.ExpDate ? new Date(raw.ExpDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
