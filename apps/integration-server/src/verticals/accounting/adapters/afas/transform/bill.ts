/**
 * AFAS Profit_PurchaseInvoices GetConnector → canonical Bill transform.
 *
 * Fields returned by the Profit_PurchaseInvoices standard GetConnector:
 *   InvoiceNr       — vendor invoice number (displayed on bill)
 *   CreditorId      — creditor/supplier code
 *   Description     — invoice description
 *   AmtInvoice      — total amount (base currency)
 *   AmtInvoiceCurr  — total amount (invoice currency)
 *   Balance         — outstanding balance
 *   BalanceCurr     — balance in invoice currency
 *   CurrencyId      — ISO-4217 currency code
 *   ExpDate         — due date
 *   NookPieceDate   — posting / booking date
 */
import type { Bill, BillStatus } from '../../../schema/bill'
import { toMinorUnits } from '../../shared/transform'

export interface AfasPurchaseInvoice {
  InvoiceNr: string
  CreditorId: string
  Description: string
  AmtInvoice: number
  AmtInvoiceCurr: number
  Balance: number
  BalanceCurr: number
  CurrencyId: string
  ExpDate: string
  NookPieceDate: string
  [key: string]: unknown
}

function mapStatus(inv: AfasPurchaseInvoice): BillStatus {
  const total = inv.AmtInvoice ?? 0
  const balance = inv.Balance ?? 0
  if (total !== 0 && balance === 0) return 'PAID'
  if (balance > 0 && balance < total) return 'PARTIALLY_PAID'
  if (balance > 0) return 'AUTHORIZED'
  return 'DRAFT'
}

export function transformBill(raw: AfasPurchaseInvoice): Bill {
  return {
    id: raw.InvoiceNr,
    status: mapStatus(raw),
    billNumber: raw.InvoiceNr || undefined,
    contactId: raw.CreditorId || undefined,
    currency: raw.CurrencyId || undefined,
    totalAmount: toMinorUnits(raw.AmtInvoice),
    balanceAmount: toMinorUnits(raw.Balance),
    postedAt: typeof raw.NookPieceDate === 'string' && raw.NookPieceDate ? new Date(raw.NookPieceDate) : undefined,
    dueAt: typeof raw.ExpDate === 'string' && raw.ExpDate ? new Date(raw.ExpDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
